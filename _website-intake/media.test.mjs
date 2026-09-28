import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createLeadServers} from './server.mjs';
import {createLeadMedia, MEDIA_LIMITS} from './lead-media.mjs';

const origin = 'https://fixingfortmyers.com';
const jpeg = (n = 0) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, n)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]);
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(300, 2)]);
const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(100, 3)]);
const lead = {name: 'Synthetic Media', phone: '2395550188', vehicle: '2016 F-150', details: 'Synthetic test only. Oil leak, photos attached.', city: 'Fort Myers', starts: 'yes', stranded: 'no', website: ''};
const fakeChannel = name => { const sent = []; return {name, sent, async send(message) { sent.push(message); return {id: name}; }}; };

async function setup(t, options = {}) {
  const push = fakeChannel('push');
  const app = createLeadServers({dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'pt-media-')), alertWorker: false, besideToken: '', notifyChannels: [push], recordingDiskFreeBytes: () => 50n * 1024n ** 3n, ...options});
  const ports = await app.start(0, 0); t.after(() => app.close());
  const base = 'http://127.0.0.1:' + ports.publicPort, admin = 'http://127.0.0.1:' + ports.adminPort;
  const send = async () => (await fetch(base + '/hooks/lead/webform', {method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID()}, body: JSON.stringify(lead)})).json();
  const upload = (id, token, body, type = 'image/jpeg', headers = {}) => fetch(`${base}/hooks/lead/media/${id}`, {method: 'POST', headers: {Origin: origin, 'Content-Type': type, 'X-Media-Token': token, ...headers}, body});
  return {app, base, admin, push, send, upload};
}

test('a saved request returns an upload key; photos and video attach to it and show in the inbox', async t => {
  const x = await setup(t);
  const receipt = await x.send();
  assert.equal(receipt.received, true); assert.match(receipt.mediaToken, /^[A-Za-z0-9_-]{32}$/);
  const first = await x.upload(receipt.id, receipt.mediaToken, jpeg());
  assert.equal(first.status, 201); assert.deepEqual(await first.json(), {ok: true, received: true, index: 1, count: 1});
  // A retried upload of the same file is not stored twice.
  const again = await x.upload(receipt.id, receipt.mediaToken, jpeg());
  assert.equal(again.status, 200); assert.equal((await again.json()).index, 1);
  assert.equal((await x.upload(receipt.id, receipt.mediaToken, mp4, 'video/mp4')).status, 201);
  assert.equal((await x.upload(receipt.id, receipt.mediaToken, heic, 'image/heic')).status, 201);
  const inbox = (await (await fetch(x.admin + '/api/leads')).json()).leads.find(row => row.id === receipt.id);
  assert.deepEqual(inbox.media.map(item => [item.idx, item.type, item.bytes]), [[1, 'image/jpeg', jpeg().length], [2, 'video/mp4', mp4.length], [3, 'image/heic', heic.length]]);
  const photo = await fetch(`${x.admin}/api/leads/${receipt.id}/media/1`);
  assert.equal(photo.status, 200); assert.equal(photo.headers.get('content-type'), 'image/jpeg');
  assert.equal(photo.headers.get('x-content-type-options'), 'nosniff'); assert.match(photo.headers.get('content-security-policy'), /sandbox/);
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), jpeg());
  const part = await fetch(`${x.admin}/api/leads/${receipt.id}/media/2`, {headers: {Range: 'bytes=4-11'}});
  assert.equal(part.status, 206); assert.equal(Buffer.from(await part.arrayBuffer()).toString(), 'ftypisom');
  assert.equal((await fetch(`${x.admin}/api/leads/${receipt.id}/media/9`)).status, 404);
  // Media is never readable from the public listener.
  assert.equal((await fetch(`${x.base}/api/leads/${receipt.id}/media/1`)).status, 404);
});

test('uploads are refused without the right key, origin, type or content', async t => {
  const x = await setup(t);
  const receipt = await x.send();
  assert.equal((await x.upload(receipt.id, 'wrong-token-wrong-token-wrong-tok', jpeg())).status, 403);
  assert.equal((await x.upload(randomUUID(), receipt.mediaToken, jpeg())).status, 403);
  assert.equal((await x.upload(receipt.id, receipt.mediaToken, jpeg(), 'image/png')).status, 415, 'declared PNG but JPEG bytes');
  assert.equal((await x.upload(receipt.id, receipt.mediaToken, Buffer.from('<svg onload=alert(1)></svg>'.padEnd(64)), 'image/svg+xml')).status, 415);
  assert.equal((await x.upload(receipt.id, receipt.mediaToken, Buffer.from('<html><script>x</script></html>'.padEnd(64)), 'video/mp4')).status, 415);
  const noOrigin = await fetch(`${x.base}/hooks/lead/media/${receipt.id}`, {method: 'POST', headers: {'Content-Type': 'image/jpeg', 'X-Media-Token': receipt.mediaToken}, body: jpeg()});
  assert.equal(noOrigin.status, 403);
  const preflight = await fetch(`${x.base}/hooks/lead/media/${receipt.id}`, {method: 'OPTIONS', headers: {Origin: origin, 'Access-Control-Request-Headers': 'content-type,x-media-token'}});
  assert.equal(preflight.status, 204); assert.match(preflight.headers.get('access-control-allow-headers'), /X-Media-Token/);
  assert.equal((await (await fetch(x.admin + '/api/leads')).json()).leads[0].media.length, 0);
});

test('one request holds at most six attachments, and Tony gets one grouped follow-up alert', async t => {
  const x = await setup(t);
  const receipt = await x.send();
  for (let i = 0; i < MEDIA_LIMITS.files; i++) assert.equal((await x.upload(receipt.id, receipt.mediaToken, i === 5 ? png : jpeg(i), i === 5 ? 'image/png' : 'image/jpeg')).status, 201);
  const extra = await x.upload(receipt.id, receipt.mediaToken, jpeg(99));
  assert.equal(extra.status, 409); assert.match((await extra.json()).error, /Up to 6/);
  const row = x.app.db.prepare('SELECT state, message_json, next_attempt_ms FROM lead_notifications WHERE lead_id=?').get(receipt.id + ':media');
  assert.equal(row.state, 'pending'); assert.ok(row.next_attempt_ms > Date.now() + 30000, 'waits so several uploads share one alert');
  const message = JSON.parse(row.message_json);
  assert.match(message.title, /^Photos\/video added: 2016 F-150$/); assert.match(message.text, /added 6 photos to their repair request/);
  assert.equal(x.app.db.prepare("SELECT COUNT(*) n FROM lead_notifications WHERE lead_id LIKE '%:media'").get().n, 1);
});

test('a resent request gets a fresh upload key, and the old one stops working', async t => {
  const x = await setup(t);
  const key = randomUUID(), post = () => fetch(x.base + '/hooks/lead/webform', {method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': key}, body: JSON.stringify(lead)}).then(r => r.json());
  const first = await post(), second = await post();
  assert.equal(second.duplicate, true); assert.equal(second.id, first.id); assert.notEqual(second.mediaToken, first.mediaToken);
  assert.equal((await x.upload(first.id, first.mediaToken, jpeg())).status, 403);
  assert.equal((await x.upload(first.id, second.mediaToken, jpeg())).status, 201);
});

test('media module: expiry, size caps, full disk and leftover partial uploads', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-media-unit-')), db = new DatabaseSync(':memory:');
  t.after(() => { db.close(); fs.rmSync(dir, {recursive: true, force: true}); });
  let now = 1_000_000, free = 50n * 1024n ** 3n;
  const media = createLeadMedia(db, {dataDir: dir, now: () => now, diskFree: () => free});
  const id = randomUUID(), token = media.issueToken(id);
  await assert.rejects(media.save(id, token, 'image/jpeg', Readable.from([jpeg()]), {declaredBytes: MEDIA_LIMITS.imageBytes + 1}), err => err.status === 413);
  await assert.rejects(media.save(id, token, 'image/jpeg', Readable.from([jpeg(), Buffer.alloc(MEDIA_LIMITS.imageBytes)])), err => err.status === 413);
  assert.equal(fs.readdirSync(path.join(dir, 'media', id)).length, 0, 'an oversized upload leaves nothing behind');
  free = 1024n ** 3n;
  await assert.rejects(media.save(id, token, 'image/jpeg', Readable.from([jpeg()])), err => err.status === 503);
  free = 50n * 1024n ** 3n;
  assert.equal((await media.save(id, token, 'image/jpeg', Readable.from([jpeg()]))).index, 1);
  now += MEDIA_LIMITS.tokenMinutes * 60000 + 1;
  await assert.rejects(media.save(id, token, 'image/jpeg', Readable.from([jpeg(5)])), err => err.status === 403);
  fs.writeFileSync(path.join(dir, 'media', id, '.upload-stale'), 'partial');
  createLeadMedia(db, {dataDir: dir});
  assert.deepEqual(fs.readdirSync(path.join(dir, 'media', id)), ['1.jpg']);
});
