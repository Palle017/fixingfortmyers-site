// Private inbox behavior only: synthetic records, mocked browser HTTP, and loopback servers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {JSDOM} from 'jsdom';
import {createLeadServers} from './server.mjs';

const html = fs.readFileSync(new URL('./inbox.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('./inbox.js', import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 3; i++) await new Promise(setImmediate); };
const record = () => ({id: '11111111-1111-4111-8111-111111111111', name: 'Synthetic customer', phone: '2395550100', kind: 'webform', status: 'new', received_at: '2026-10-11T10:00:00Z', updated_at: '2026-10-11T10:00:00Z', details: 'Synthetic brake request', notifications: []});

async function inbox(t, initialData) {
  let data = initialData;
  const dom = new JSDOM(html, {url: 'http://127.0.0.1:18798/', runScripts: 'outside-only'});
  t.after(() => dom.window.close());
  dom.window.fetch = async (url, options) => {
    assert.equal(url, '/api/leads');
    assert.equal(options?.method, undefined, 'viewing status must not resend alerts');
    return {ok: true, json: async () => structuredClone(data)};
  };
  dom.window.eval(script);
  await settle();
  return {document: dom.window.document, async update(next) { data = next; dom.window.document.getElementById('refresh').click(); await settle(); }};
}

test('private inbox shows routine notification failures and refreshes even when the lead timestamp is unchanged', async t => {
  const lead = record();
  lead.notifications = [{channel: 'push', state: 'pending', attempts: 1, last_error: 'private-provider-token-secret'}];
  const data = {leads: [lead], notificationStatus: {channels: ['push'], urgentAlertsEnabled: false}};
  const view = await inbox(t, data);
  assert.match(view.document.querySelector('.notification-state').textContent, /Push notification: queued for another attempt/);
  assert.doesNotMatch(view.document.body.textContent, /private-provider-token-secret/);
  lead.notifications[0] = {...lead.notifications[0], state: 'failed', attempts: 6};
  await view.update(data);
  assert.match(view.document.querySelector('.notification-state').textContent, /Push notification: failed; follow up and check this channel.*6 attempt/);
  assert.doesNotMatch(view.document.body.textContent, /private-provider-token-secret/);
  assert.ok(![...view.document.querySelectorAll('button')].some(button => /retry|resend/i.test(button.textContent)), 'no notification resend action is introduced');
});

test('private inbox distinguishes accepted and uncertain alerts from receipt and exposes missing configuration', async t => {
  const lead = record();
  lead.notifications = [
    {channel: 'email', state: 'sent', attempts: 1},
    {channel: 'desktop', state: 'sent', attempts: 1},
    {channel: 'sms', state: 'needs_review', attempts: 1},
  ];
  const data = {leads: [lead], notificationStatus: {channels: [], urgentAlertsEnabled: false}};
  const view = await inbox(t, data);
  assert.match(view.document.getElementById('notification-status').textContent, /No routine request alerts are configured/);
  const states = [...view.document.querySelectorAll('.notification-state')].map(el => el.textContent).join('\n');
  assert.match(states, /Email: accepted by provider; receipt not verified/);
  assert.match(states, /Laptop notification: submitted to this computer; viewing not verified/);
  assert.match(states, /Text alert: delivery uncertain; check the provider before any new send/);
  await view.update({...data, notificationStatus: {channels: [], urgentAlertsEnabled: true}});
  assert.match(view.document.getElementById('notification-status').textContent, /Urgent alerts are enabled separately/);
  await view.update({leads: [lead]});
  assert.match(view.document.getElementById('notification-status').textContent, /configuration is unavailable from this receiver/);
});

test('receiver exposes only notification capability names in the private inbox and preserves public and origin boundaries', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-inbox-notifications-'));
  const app = createLeadServers({dataDir, alertWorker: false, besideToken: '', notifyChannels: [
    {name: 'email', credential: 'never-expose-this', async send() { assert.fail('No provider send expected'); }},
    {name: 'private-provider-token-secret', async send() { assert.fail('No provider send expected'); }},
  ]});
  const ports = await app.start(0, 0);
  t.after(async () => { await app.close(); fs.rmSync(dataDir, {recursive: true, force: true}); });
  const admin = 'http://127.0.0.1:' + ports.adminPort;
  const base = 'http://127.0.0.1:' + ports.publicPort;
  const response = await fetch(admin + '/api/leads');
  const body = await response.json();
  assert.deepEqual(body.notificationStatus, {channels: ['email'], urgentAlertsEnabled: false});
  assert.doesNotMatch(JSON.stringify(body), /never-expose-this|private-provider-token-secret/);
  assert.equal((await fetch(admin + '/api/leads', {headers: {Origin: 'https://unrelated.invalid'}})).status, 403);
  assert.equal((await fetch(base + '/api/leads')).status, 404);
  const health = await (await fetch(base + '/healthz')).json();
  assert.equal(health.notificationStatus, undefined);
});
