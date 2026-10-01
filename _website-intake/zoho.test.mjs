import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createLeadServers} from './server.mjs';
import {createZohoReader, zohoConfigFromEnv} from './zoho-estimates.mjs';

// Synthetic Zoho: estimates keyed by id; no network.
function fakeReader(estimates) {
  const calls = [];
  return {calls, estimates,
    async findByNumber(number) { calls.push(['find', number]); return Object.values(estimates).find(e => e.number.toLowerCase() === number.toLowerCase()) || null; },
    async getEstimate(id) { calls.push(['get', id]); if (estimates[id]?.fail) throw Object.assign(Error(estimates[id].fail), {status: 502}); return estimates[id] || null; }};
}
const estimate = (id, number, status, total = 450) => ({id, number, status, total, customer: 'Synthetic Customer', date: '2026-09-30'});
async function setup(t, reader) {
  const app = createLeadServers({dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'pt-zoho-')), alertWorker: false, zohoReader: reader});
  const ports = await app.start(0, 0); t.after(() => app.close());
  const admin = 'http://127.0.0.1:' + ports.adminPort;
  const lead = () => app.desk.addManual({name: 'Synthetic Zoho Lead', phone: '2395550188', vehicle: '2014 Silverado'}).id;
  const link = (id, estimateNumber) => fetch(`${admin}/api/leads/${id}/zoho-estimate`, {method: 'POST', headers: {'Content-Type': 'application/json', Origin: admin}, body: JSON.stringify({estimateNumber})});
  return {app, desk: app.desk, admin, lead, link, stage: id => app.desk.pipeline(id).stage, inbox: async () => (await (await fetch(admin + '/api/leads')).json())};
}

test('linking a sent Zoho estimate moves the lead to estimate_sent with the Zoho total as the approved price', async t => {
  const x = await setup(t, fakeReader({e1: estimate('e1', 'EST-000101', 'sent', 620)}));
  const id = x.lead();
  const response = await x.link(id, 'est-000101');
  assert.equal(response.status, 200);
  const out = await response.json();
  assert.equal(out.stage, 'estimate_sent'); assert.equal(out.estimate.number, 'EST-000101');
  const p = x.desk.pipeline(id);
  assert.deepEqual([p.estimate_low, p.estimate_approved_by, p.estimate_sent_at], [620, 'Sent from Zoho', '2026-09-30T16:00:00.000Z']);
  assert.ok(p.contacted_at, 'an estimate implies contact');
  const data = await x.inbox();
  assert.equal(data.zohoEnabled, true);
  assert.equal(data.leads.find(l => l.id === id).zohoEstimate.status, 'sent');
});

test('a draft estimate links without moving the lead; the sync moves it once Zoho shows it sent, then accepted', async t => {
  const reader = fakeReader({e2: estimate('e2', 'EST-000102', 'draft')});
  const x = await setup(t, reader);
  const id = x.lead();
  assert.equal((await (await x.link(id, 'EST-000102')).json()).stage, 'new');
  reader.estimates.e2 = {...reader.estimates.e2, status: 'sent'};
  await x.app.zoho.tick();
  assert.equal(x.stage(id), 'estimate_sent');
  reader.estimates.e2 = {...reader.estimates.e2, status: 'accepted'};
  await x.app.zoho.tick();
  assert.equal(x.stage(id), 'booked');
  assert.ok(x.desk.pipeline(id).booked_at);
  assert.deepEqual(x.desk.touches(id).filter(r => r.channel === 'zoho').map(r => r.note), ['Estimate EST-000102 accepted', 'Estimate EST-000102 sent']);
});

test('a declined estimate marks the lead lost; a later acceptance reopens it as booked', async t => {
  const reader = fakeReader({e3: estimate('e3', 'EST-000103', 'sent')});
  const x = await setup(t, reader);
  const id = x.lead();
  await x.link(id, 'EST-000103');
  reader.estimates.e3 = {...reader.estimates.e3, status: 'declined'};
  await x.app.zoho.tick();
  assert.deepEqual([x.stage(id), x.desk.pipeline(id).lost_reason], ['lost', 'Zoho: customer declined the estimate']);
  // Declined is settled: the sync stops polling it, but relinking re-reads it.
  reader.estimates.e3 = {...reader.estimates.e3, status: 'accepted'};
  assert.equal((await x.app.zoho.tick()).checked, 0);
  await x.link(id, 'EST-000103');
  assert.deepEqual([x.stage(id), x.desk.pipeline(id).lost_reason, x.desk.pipeline(id).closed_at], ['booked', null, null]);
});

test('Zoho never moves a lead backward or overrides Tony: won, spam and hand-marked lost leads stay put', async t => {
  const reader = fakeReader({w: estimate('w', 'EST-1', 'sent'), l: estimate('l', 'EST-2', 'sent')});
  const x = await setup(t, reader);
  const won = x.lead(), lost = x.lead();
  x.desk.setStage(won, {stage: 'won', jobValue: 900});
  x.desk.setStage(lost, {stage: 'lost', lostReason: 'Went elsewhere'});
  assert.equal((await (await x.link(won, 'EST-1')).json()).stage, 'won');
  await x.link(lost, 'EST-2');
  reader.estimates.l = {...reader.estimates.l, status: 'accepted'};
  await x.app.zoho.tick();
  assert.deepEqual([x.stage(won), x.stage(lost), x.desk.pipeline(lost).lost_reason], ['won', 'lost', 'Went elsewhere']);
});

test('an expired Zoho estimate shows in Needs action instead of waiting out the 3-day timer', async t => {
  const reader = fakeReader({e5: estimate('e5', 'EST-000105', 'sent')});
  const x = await setup(t, reader);
  const id = x.lead();
  await x.link(id, 'EST-000105');
  x.app.db.prepare("UPDATE lead_pipeline SET estimate_sent_at=? WHERE lead_id=?").run(new Date().toISOString(), id);
  assert.equal(x.desk.metrics().needsAction.find(n => n.id === id), undefined);
  reader.estimates.e5 = {...reader.estimates.e5, status: 'expired'};
  await x.app.zoho.tick();
  assert.equal(x.desk.metrics().needsAction.find(n => n.id === id).why, 'Zoho estimate expired: follow up or close');
});

test('link errors: unknown number, an estimate already on another lead, bad input, unlink, and Zoho not connected', async t => {
  const x = await setup(t, fakeReader({e6: estimate('e6', 'EST-000106', 'sent')}));
  const a = x.lead(), b = x.lead();
  let r = await x.link(a, 'EST-404'); assert.equal(r.status, 404); assert.match((await r.json()).error, /No Zoho estimate numbered EST-404/);
  r = await x.link(a, 'EST 1; DROP'); assert.equal(r.status, 400);
  assert.equal((await x.link(a, 'EST-000106')).status, 200);
  r = await x.link(b, 'EST-000106'); assert.equal(r.status, 409);
  r = await x.link(a, ''); assert.deepEqual(await r.json(), {ok: true, unlinked: true});
  assert.equal(x.app.zoho.inspect(a), null);
  r = await fetch(`${x.admin}/api/leads/${a}/zoho-estimate`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{"estimateNumber":"EST-000106"}'});
  assert.equal(r.status, 403, 'requires the local inbox origin');
  const off = await setup(t, null);
  r = await off.link(off.lead(), 'EST-000106'); assert.equal(r.status, 503);
  assert.equal((await off.inbox()).zohoEnabled, false);
});

test('a failed Zoho check is recorded on the estimate and does not change the lead', async t => {
  const reader = fakeReader({e7: estimate('e7', 'EST-000107', 'sent')});
  const x = await setup(t, reader);
  const id = x.lead();
  await x.link(id, 'EST-000107');
  reader.estimates.e7 = {...reader.estimates.e7, fail: 'Zoho returned an error.'};
  await x.app.zoho.tick();
  assert.deepEqual([x.stage(id), x.app.zoho.inspect(id).last_error], ['estimate_sent', 'Zoho returned an error.']);
});

test('reader only signs in and reads: one token POST to Zoho accounts, then GETs with the organization ID', async () => {
  const requests = [];
  const fakeFetch = async (url, init) => {
    requests.push([init.method, url]);
    const body = url.includes('/oauth/v2/token') ? {access_token: 'synthetic-access', expires_in: 3600}
      : url.includes('estimate_number=') ? {code: 0, estimates: [{estimate_id: '77', estimate_number: 'EST-000777', status: 'sent', total: 1200.5, customer_name: 'Synthetic', date: '2026-09-29'}, {estimate_id: '78', estimate_number: 'EST-0007770', status: 'draft'}]}
      : {code: 0, estimate: {estimate_id: '77', estimate_number: 'EST-000777', status: 'accepted', total: 1200.5, date: '2026-09-29'}};
    return new Response(JSON.stringify(body), {status: 200, headers: {'Content-Type': 'application/json'}});
  };
  const reader = createZohoReader({clientId: 'c', clientSecret: 's', refreshToken: 'r', orgId: '123456', fetch: fakeFetch});
  assert.deepEqual(await reader.findByNumber('EST-000777'), {id: '77', number: 'EST-000777', status: 'sent', total: 1200.5, customer: 'Synthetic', date: '2026-09-29'});
  assert.equal((await reader.getEstimate('77')).status, 'accepted');
  assert.deepEqual(requests.map(([method, url]) => [method, url.replace(/\?.*/, '')]), [
    ['POST', 'https://accounts.zoho.com/oauth/v2/token'],
    ['GET', 'https://www.zohoapis.com/invoice/v3/estimates'],
    ['GET', 'https://www.zohoapis.com/invoice/v3/estimates/77']]);
  assert.ok(requests.slice(1).every(([, url]) => url.endsWith('organization_id=123456')));
});

test('Zoho settings: off when absent, a clear problem when partial, Books and other data centers supported', () => {
  assert.deepEqual(zohoConfigFromEnv({}), {config: null, problem: null});
  assert.match(zohoConfigFromEnv({ZOHO_CLIENT_ID: 'c'}).problem, /missing ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID/);
  const full = {ZOHO_CLIENT_ID: 'c', ZOHO_CLIENT_SECRET: 's', ZOHO_REFRESH_TOKEN: 'r', ZOHO_ORG_ID: '123456'};
  assert.equal(zohoConfigFromEnv(full).config.product, 'invoice');
  assert.equal(zohoConfigFromEnv({...full, ZOHO_PRODUCT: 'Books', ZOHO_DC: 'eu'}).config.dc, 'eu');
  assert.match(zohoConfigFromEnv({...full, ZOHO_PRODUCT: 'crm'}).problem, /invoice or books/);
  assert.match(zohoConfigFromEnv({...full, ZOHO_ORG_ID: 'org'}).problem, /numeric/);
});
