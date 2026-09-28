import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createLeadServers} from './server.mjs';
import {confirmationText, customerNumber, createTwilioCustomerAdapter} from './customer-texts.mjs';

const origin = 'https://fixingfortmyers.com';
const consent = {smsConsent: true, smsConsentTimestamp: new Date().toISOString(), smsConsentVersion: '2026-09-06-v1', smsConsentSource: 'bay-one-chat', smsConsentPage: origin + '/', smsConsentDisclosure: 'Synthetic consent record for local QA.'};
const lead = (extra = {}) => ({name: 'Maria Synthetic', phone: '(239) 555-0142', vehicle: '2012 F-150', details: 'Synthetic test only.', city: 'Fort Myers', starts: 'yes', stranded: 'no', website: '', ...extra});
function fakeTwilio({fail = null} = {}) {
  const sent = [];
  return {sent, fromNumber: '+12395550000', async send(to, body) { sent.push({to, body}); if (fail) throw Object.assign(Error(fail), {code: fail, retryable: fail === 'rate_limited'}); return {id: 'SM' + 'a'.repeat(32)}; }};
}
async function setup(t, adapter, extra = {}) {
  const app = createLeadServers({dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'pt-ctext-')), alertWorker: false, besideToken: '', customerTextAdapter: adapter, ...extra});
  const ports = await app.start(0, 0); t.after(() => app.close());
  const send = input => fetch('http://127.0.0.1:' + ports.publicPort + '/hooks/lead/webform', {method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID()}, body: JSON.stringify(input)}).then(r => r.json());
  const admin = 'http://127.0.0.1:' + ports.adminPort;
  const inbox = async () => (await (await fetch('http://127.0.0.1:' + ports.adminPort + '/api/leads')).json()).leads;
  return {app, send, inbox, admin};
}

test('a customer who ticked text permission gets one confirmation text right away', async t => {
  const twilio = fakeTwilio(), x = await setup(t, twilio);
  const receipt = await x.send(lead(consent));
  await x.app.customerTexts?.tick?.();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(twilio.sent.length, 1);
  assert.equal(twilio.sent[0].to, '+12395550142');
  assert.match(twilio.sent[0].body, /^Perfect Timing Auto Repair: Hi Maria, Tony got your repair request for your 2012 F-150\. He'll call or text you from \(239\) 397-2048/);
  assert.match(twilio.sent[0].body, /Reply STOP to opt out, HELP for help\.$/);
  assert.equal((await x.inbox()).find(row => row.id === receipt.id).customerText.state, 'sent');
});

test('no text without permission, and at most one per phone number per day', async t => {
  const twilio = fakeTwilio(), x = await setup(t, twilio);
  const none = await x.send(lead());
  await x.send(lead(consent)); await x.send(lead({...consent, details: 'Second synthetic request.'}));
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(twilio.sent.length, 1);
  const rows = await x.inbox();
  assert.equal(rows.find(row => row.id === none.id).customerText, null);
  assert.deepEqual(rows.map(row => row.customerText?.state).filter(Boolean).sort(), ['sent', 'skipped']);
});

test('customer texts are off unless an adapter is configured', async t => {
  const x = await setup(t, null);
  const receipt = await x.send(lead(consent));
  assert.equal((await x.inbox()).find(row => row.id === receipt.id).customerText, null);
});

test('an uncertain send is never repeated; a rate limit is retried', async t => {
  const uncertain = fakeTwilio({fail: 'provider_unavailable'}), x = await setup(t, uncertain);
  const receipt = await x.send(lead(consent));
  await new Promise(resolve => setTimeout(resolve, 50));
  await x.app.db.prepare('UPDATE customer_texts SET next_attempt_ms=0').run();
  assert.equal(uncertain.sent.length, 1);
  assert.equal((await x.inbox()).find(row => row.id === receipt.id).customerText.state, 'needs_review');
  const limited = fakeTwilio({fail: 'rate_limited'}), y = await setup(t, limited);
  const second = await y.send(lead(consent));
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal((await y.inbox()).find(row => row.id === second.id).customerText.state, 'pending');
});

test('message wording, phone normalization and adapter guard rails', () => {
  assert.equal(customerNumber('239-555-0142'), '+12395550142'); assert.equal(customerNumber('1 (239) 555-0142'), '+12395550142'); assert.equal(customerNumber('+44 20 7946 0958'), '');
  assert.match(confirmationText({name: 'Al', vehicle: 'Not provided; see request details'}), /^Perfect Timing Auto Repair: Hi Al, Tony got your repair request\. /);
  assert.match(confirmationText({name: 'Al'}, {urgent: true}), /marked urgent\. If you're somewhere unsafe, call 911\./);
  assert.ok(confirmationText({name: 'A'.repeat(200), vehicle: 'V'.repeat(200)}).length < 400);
  assert.throws(() => createTwilioCustomerAdapter({accountSid: 'bad', authToken: 'x', fromNumber: '+12395550000'}), /Invalid customer text configuration/);
});

test('marking a job won schedules one Google review text two hours later, only with text permission', async t => {
  const twilio = fakeTwilio(), x = await setup(t, twilio, {reviewUrl: 'https://g.page/r/synthetic-review'});
  const won = id => fetch(`${x.admin}/api/leads/${id}/stage`, {method: 'POST', headers: {'Content-Type': 'application/json', Origin: x.admin}, body: JSON.stringify({stage: 'won'})}).then(r => r.json());
  const yes = await x.send(lead(consent)), no = await x.send(lead({phone: '2395550143'}));
  assert.equal((await won(yes.id)).reviewQueued, true); assert.equal((await won(no.id)).reviewQueued, false);
  const row = x.app.db.prepare('SELECT state, body, next_attempt_ms FROM customer_texts WHERE lead_id=?').get(yes.id + ':review');
  assert.equal(row.state, 'pending'); assert.ok(row.next_attempt_ms > Date.now() + 3600000);
  assert.match(row.body, /Thanks, Maria, for trusting Tony[\s\S]*https:\/\/g\.page\/r\/synthetic-review Reply STOP to opt out\.$/);
  x.app.db.prepare('UPDATE customer_texts SET next_attempt_ms=0 WHERE lead_id=?').run(yes.id + ':review');
  await x.app.customerTexts.tick();
  assert.equal(twilio.sent.at(-1).to, '+12395550142'); assert.match(twilio.sent.at(-1).body, /Google review/);
  assert.equal((await x.inbox()).find(r => r.id === yes.id).reviewText.state, 'sent');
});
