// Real loopback HTTP and abrupt-process tests against the existing Node receiver.
// Synthetic state only; no hosted API, messages, calendar or paid inference is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {readConfig, ensureStagingData, MARKER} from '../deploy/vm101/staging.mjs';
import {snapshotStaging, verifySnapshot} from '../deploy/vm101/snapshot-staging.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'http://127.0.0.1:28795';
const payload = () => ({name: 'Synthetic VM101 Migration', phone: '2395550100',
  vehicle: '2015 Honda Civic', details: 'Synthetic staging test: brakes squeal.', smsConsent: false, website: ''});
function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-vm101-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return dir;
}
async function start(t, dir, extra = {}) {
  const child = spawn(process.execPath, [path.join(ROOT, 'deploy/vm101/staging.mjs')], {
    cwd: ROOT, env: {PATH: process.env.PATH, BAYONE_STAGE_DATA_DIR: dir,
      BAYONE_STAGE_PUBLIC_PORT: '0', BAYONE_STAGE_INBOX_PORT: '0', ...extra},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '', buffer = '', ports;
  child.stderr.on('data', chunk => { errors += chunk; });
  async function stop(signal = 'SIGTERM') {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill(signal);
    await exited;
  }
  t.after(() => stop('SIGKILL'));
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Staging startup timed out: ' + errors)), 5000);
    child.once('exit', code => { clearTimeout(timeout); reject(Error(`Staging exited ${code}: ${errors}`)); });
    child.stdout.on('data', chunk => {
      buffer += chunk;
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        let value; try { value = JSON.parse(line); } catch { continue; }
        if (value.event === 'vm101_staging_ready') { ports = value; clearTimeout(timeout); resolve(); }
      }
    });
  });
  return {child, stop, dir, url: `http://127.0.0.1:${ports.publicPort}`,
    inbox: `http://127.0.0.1:${ports.adminPort}`};
}
async function post(url, endpoint, body, key) {
  return fetch(url + endpoint, {method: 'POST', headers: {Origin: ORIGIN, 'Content-Type': 'application/json',
    ...(key ? {'Idempotency-Key': key} : {})}, body: JSON.stringify(body), signal: AbortSignal.timeout(4000)});
}
const submit = (x, body, key) => post(x.url, '/hooks/lead/webform', body, key);
const rows = async x => (await (await fetch(x.inbox + '/api/leads')).json()).leads;

test('VM101 staging refuses unmarked old data and external inference targets', t => {
  const dir = directory(t);
  fs.writeFileSync(path.join(dir, 'website-leads.sqlite3'), 'do not open');
  assert.throws(() => ensureStagingData(dir), /unmarked/);
  assert.equal(fs.readFileSync(path.join(dir, 'website-leads.sqlite3'), 'utf8'), 'do not open');
  assert.throws(() => readConfig({BAYONE_STAGE_DATA_DIR: ROOT}), /outside/);
  assert.throws(() => readConfig({BAYONE_STAGE_DATA_DIR: dir, BAYONE_STAGE_OLLAMA_URL: 'https://model.example.test'}), /loopback/);
  assert.throws(() => readConfig({BAYONE_STAGE_DATA_DIR: dir, BAYONE_STAGE_PUBLIC_PORT: '0.0.0.0'}), /port/);
  const marked = directory(t); ensureStagingData(marked);
  fs.symlinkSync(path.join(dir, 'website-leads.sqlite3'), path.join(marked, 'website-leads.sqlite3'));
  assert.throws(() => ensureStagingData(marked), /symlinks/);
  assert.equal(fs.readFileSync(path.join(dir, 'website-leads.sqlite3'), 'utf8'), 'do not open');
});

test('VM101 staging is isolated from website origins and inherited provider/integration settings', async t => {
  const x = await start(t, directory(t), {DEEPSEEK_API_KEY: 'synthetic-ignored',
    BAYONE_PROVIDER: 'ollama', OLLAMA_HOST: 'https://must-not-contact.example.test',
    LEAD_CUSTOMER_TEXTS: 'true', LEAD_ALERTS_ENABLED: 'true', BESIDE_WEBHOOK_TOKEN: 'synthetic-disabled-token-0123456789'});
  const health = await (await fetch(x.url + '/healthz')).json();
  assert.equal(health.ok, true);
  const denied = await fetch(x.url + '/hooks/lead/webform', {method: 'POST',
    headers: {Origin: 'https://fixingfortmyers.com', 'Content-Type': 'application/json'}, body: JSON.stringify(payload())});
  assert.equal(denied.status, 403);
  assert.equal((await fetch(x.url + '/api/leads')).status, 404);
  const session = await (await post(x.url, '/chat/session', {})).json();
  assert.equal(session.capabilities.modelStatus, 'unavailable');
  assert.equal(session.usage.limit, null);
  assert.equal((await rows(x)).length, 0);
  assert.equal(fs.existsSync(path.join(x.dir, MARKER)), true);
});

test('VM101 model outage preserves reviewed intake and never fabricates a price or booking', async t => {
  const x = await start(t, directory(t));
  const session = await (await post(x.url, '/chat/session', {})).json();
  const answer = await (await post(x.url, '/chat/message', {visitor_token: session.visitor_token,
    request_id: randomUUID(), message: 'How much to replace front brake pads on a 2015 Honda Civic?'})).json();
  assert.equal(answer.ok, true);
  assert.equal(answer.assist, 'scripted');
  assert.equal(answer.estimate, undefined);
  assert.equal((await rows(x)).length, 0, 'chat alone cannot create a submitted lead');
  const result = await submit(x, payload(), randomUUID());
  const receipt = await result.json();
  assert.equal(result.status, 201);
  assert.equal(receipt.received, true);
  assert.equal(receipt.appointment, undefined);
  assert.equal((await rows(x)).length, 1);
});

test('VM101 response lost after commit retries to the original receipt', async t => {
  const x = await start(t, directory(t)), body = payload(), key = randomUUID();
  // Fault proxy consumes the committed upstream response and then drops the client connection.
  const proxy = http.createServer((request, response) => {
    const upstream = http.request(x.url + request.url, {method: request.method, headers: request.headers}, incoming => {
      incoming.resume(); incoming.on('end', () => response.destroy());
    });
    upstream.on('error', () => response.destroy()); request.pipe(upstream);
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { proxy.close(resolve); proxy.closeAllConnections(); }));
  await assert.rejects(post(`http://127.0.0.1:${proxy.address().port}`, '/hooks/lead/webform', body, key));
  const stored = await rows(x); assert.equal(stored.length, 1);
  const retry = await submit(x, body, key); assert.equal(retry.status, 200);
  assert.equal((await retry.json()).id, stored[0].id);
  assert.equal((await rows(x)).length, 1);
});

test('VM101 interrupted body cannot acknowledge or save a partial inquiry', async t => {
  const x = await start(t, directory(t)), key = randomUUID();
  const target = new URL(x.url);
  await new Promise((resolve, reject) => {
    const socket = net.connect(Number(target.port), '127.0.0.1', () => {
      socket.write(`POST /hooks/lead/webform HTTP/1.1\r\nHost: ${target.host}\r\nOrigin: ${ORIGIN}\r\nContent-Type: application/json\r\nIdempotency-Key: ${key}\r\nContent-Length: 500\r\n\r\n{"name":"Synthetic`);
      socket.end();
    });
    let response = ''; socket.on('data', data => { response += data; });
    socket.on('error', error => { if (error.code !== 'ECONNRESET') reject(error); });
    socket.on('close', () => { assert.doesNotMatch(response, /"received":true/); resolve(); });
  });
  assert.equal((await rows(x)).length, 0);
  assert.equal((await submit(x, payload(), key)).status, 201);
  assert.equal((await rows(x)).length, 1);
});

test('VM101 concurrent duplicate retries create one inquiry and reject changed content', async t => {
  const x = await start(t, directory(t)), body = payload(), key = randomUUID();
  const responses = await Promise.all(Array.from({length: 8}, () => submit(x, body, key)));
  const receipts = await Promise.all(responses.map(response => response.json()));
  assert.equal(responses.filter(response => response.status === 201).length, 1);
  assert.ok(responses.every(response => [200, 201].includes(response.status)));
  assert.equal(new Set(receipts.map(receipt => receipt.id)).size, 1);
  assert.equal((await rows(x)).length, 1);
  assert.equal((await submit(x, {...body, details: 'Changed synthetic scope'}, key)).status, 409);
});

test('VM101 abrupt process death preserves receipt, owner state, chat identity and cached answer', async t => {
  const dir = directory(t), x = await start(t, dir), body = payload(), key = randomUUID();
  const receipt = await (await submit(x, body, key)).json();
  const changed = await fetch(x.inbox + `/api/leads/${receipt.id}/status`, {method: 'POST',
    headers: {Origin: x.inbox, 'Content-Type': 'application/json'}, body: JSON.stringify({status: 'contacted'})});
  assert.equal(changed.status, 200);
  const session = await (await post(x.url, '/chat/session', {})).json();
  const message = {visitor_token: session.visitor_token, request_id: randomUUID(), message: 'Synthetic car will not start'};
  const answer = await (await post(x.url, '/chat/message', message)).json();
  const signingKey = fs.readFileSync(path.join(dir, 'public-chat/public-chat-signing.key'));
  await x.stop('SIGKILL');
  await assert.rejects(fetch(x.url + '/healthz'));
  const reopened = await start(t, dir);
  const retry = await submit(reopened, body, key); assert.equal(retry.status, 200);
  assert.equal((await retry.json()).id, receipt.id);
  assert.equal((await rows(reopened))[0].status, 'contacted');
  const cached = await (await post(reopened.url, '/chat/message', message)).json();
  assert.equal(cached.duplicate, true);
  assert.equal(cached.reply, answer.reply);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'public-chat/public-chat-signing.key')), signingKey);
});

test('VM101 failed durable transaction cannot return a success receipt', async t => {
  const x = await start(t, directory(t));
  const db = new DatabaseSync(path.join(x.dir, 'website-leads.sqlite3'));
  t.after(() => db.close());
  db.exec("CREATE TRIGGER staging_failure BEFORE INSERT ON leads BEGIN SELECT RAISE(ABORT, 'synthetic storage failure'); END");
  const result = await submit(x, payload(), randomUUID());
  assert.equal(result.status, 503); assert.equal((await result.json()).ok, false);
  assert.equal(db.prepare('SELECT count(*) n FROM leads').get().n, 0);
});

test('VM101 offline checkpoint restores the same receipt and signing identity into separate state', async t => {
  const dir = directory(t), x = await start(t, dir), body = payload(), key = randomUUID();
  const receipt = await (await submit(x, body, key)).json();
  await post(x.url, '/chat/session', {});
  const secret = fs.readFileSync(path.join(dir, 'public-chat/public-chat-signing.key'));
  await x.stop();
  const parent = directory(t), snapshot = path.join(parent, 'snapshot');
  const manifest = await snapshotStaging(dir, snapshot);
  assert.equal(manifest.offHostBackup, false);
  assert.ok(manifest.files.some(file => file.path === 'website-leads.sqlite3'));
  await verifySnapshot(snapshot);
  // Restore to another new directory; the original state is untouched.
  const restored = path.join(parent, 'restored'); fs.cpSync(snapshot, restored, {recursive: true});
  const y = await start(t, restored);
  const retry = await submit(y, body, key); assert.equal(retry.status, 200);
  assert.equal((await retry.json()).id, receipt.id);
  assert.deepEqual(fs.readFileSync(path.join(restored, 'public-chat/public-chat-signing.key')), secret);
  await y.stop();
  const nextSnapshot = path.join(parent, 'next-snapshot');
  await snapshotStaging(restored, nextSnapshot);
  await verifySnapshot(nextSnapshot);
  await assert.rejects(snapshotStaging(dir, snapshot), /must be new/);
  fs.appendFileSync(path.join(snapshot, 'public-chat/public-chat-signing.key'), 'damaged');
  await assert.rejects(verifySnapshot(snapshot), /checksum/);
});
