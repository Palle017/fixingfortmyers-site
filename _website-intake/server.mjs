import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX_JSON = 48 * 1024;
const MAX_AUDIO = 8 * 1024 * 1024;
const AUDIO_TYPES = new Map([['audio/webm', 'webm'], ['audio/ogg', 'ogg'], ['audio/wav', 'wav'], ['audio/x-wav', 'wav'], ['audio/mp4', 'm4a'], ['audio/mpeg', 'mp3']]);
const CORS_HEADERS = 'Content-Type, Idempotency-Key, X-Idempotency-Key, X-Phone, X-Name, X-SMS-Consent, X-SMS-Consent-Timestamp, X-SMS-Consent-Version, X-SMS-Consent-Source, X-SMS-Consent-Page, X-SMS-Consent-Disclosure';
const sha = value => createHash('sha256').update(value).digest('hex');
const error = (status, message) => Object.assign(new Error(message), { status });
const clean = (value, max, required = false) => {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw error(400, 'Use text for the request fields.');
  const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (text.length > max) throw error(400, 'One of the request fields is too long.');
  if (required && !text) throw error(400, 'Please enter your name and phone number.');
  return text;
};

function normalize(input, kind) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw error(400, 'Invalid request.');
  if (input.website) throw error(400, 'Please leave the website field empty.');
  const phone = clean(input.phone, 40, true);
  if (!/^\+?[\d\s().-]+$/.test(phone) || !/^\d{10,15}$/.test(phone.replace(/\D/g, ''))) throw error(400, 'Please enter a valid phone number.');
  const consent = input.smsConsent === true || input.smsConsent === 'true';
  if (![undefined, false, true, '', 'true', 'false'].includes(input.smsConsent)) throw error(400, 'Invalid text message preference.');
  const timestamp = clean(input.smsConsentTimestamp, 40);
  if (consent && (!timestamp || !Number.isFinite(Date.parse(timestamp)) || Date.parse(timestamp) > Date.now() + 300000)) throw error(400, 'Please confirm your text message preference again.');
  if (consent && !['smsConsentVersion', 'smsConsentSource', 'smsConsentPage', 'smsConsentDisclosure'].every(key => typeof input[key] === 'string' && input[key].trim())) throw error(400, 'Please confirm your text message preference again.');
  return {
    kind, name: clean(input.name, 100, true), phone,
    requestId: kind === 'voicenote' ? clean(input.requestId, 36) : '',
    vehicle: clean(input.vehicle, 160), service: clean(input.service, 160),
    details: clean(input.details ?? input.message, 6000),
    smsConsent: consent, smsConsentTimestamp: consent ? timestamp : '',
    smsConsentVersion: clean(input.smsConsentVersion, 100),
    smsConsentSource: clean(input.smsConsentSource, 100),
    smsConsentPage: clean(input.smsConsentPage, 500),
    smsConsentDisclosure: clean(input.smsConsentDisclosure, 3000),
  };
}

async function readBody(req, max) {
  if (Number(req.headers['content-length']) > max) throw error(413, 'This request is too large.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw error(413, 'This request is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function verifyAudio(audio, type) {
  if (!AUDIO_TYPES.has(type)) throw error(415, 'Use a WebM, Ogg, WAV, M4A, or MP3 recording.');
  if (audio.length < 16) throw error(400, 'The recording is empty or incomplete.');
  if (audio.length > MAX_AUDIO) throw error(413, 'The recording is too large. Please keep it under one minute.');
  const hex = audio.subarray(0, 4).toString('hex');
  const valid = type === 'audio/webm' ? hex === '1a45dfa3' : type === 'audio/ogg' ? audio.subarray(0, 4).toString() === 'OggS' : type.includes('wav') ? audio.subarray(0, 4).toString() === 'RIFF' && audio.subarray(8, 12).toString() === 'WAVE' : type === 'audio/mp4' ? audio.subarray(4, 8).toString() === 'ftyp' : audio.subarray(0, 3).toString() === 'ID3' || audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0;
  if (!valid) throw error(415, 'The recording format does not match its content.');
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}

export function createLeadServers(options = {}) {
  const dataDir = path.resolve(options.dataDir ?? process.env.LEAD_DATA_DIR ?? path.join(HERE, 'data'));
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'website-leads.sqlite3'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;');
  db.exec(`CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY, received_at TEXT NOT NULL, kind TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE, payload_hash TEXT NOT NULL,
    payload_json TEXT NOT NULL, audio_type TEXT, audio BLOB,
    status TEXT NOT NULL DEFAULT 'new', updated_at TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS leads_received ON leads(received_at DESC);`);
  const origins = new Set(options.origins ?? ['https://fixingfortmyers.com', 'https://www.fixingfortmyers.com', ...(process.env.LEAD_DEV_ORIGINS ?? '').split(',').map(x => x.trim()).filter(Boolean)]);
  const windowMs = options.rateWindowMs ?? 60000;
  const maxPerIp = options.maxPerIp ?? 12;
  const maxGlobal = options.maxGlobal ?? 120;
  const rates = new Map();
  const rate = key => {
    const now = Date.now();
    for (const [k, item] of rates) if (item.until <= now) rates.delete(k);
    let entry = rates.get(key);
    if (!entry) { entry = { count: 0, until: now + windowMs }; rates.set(key, entry); }
    entry.count++;
    return entry.count;
  };
  const writeLead = (payload, audio, type, suppliedKey) => {
    if (payload.requestId) {
      if (!/^[a-f0-9-]{36}$/.test(payload.requestId)) throw error(400, 'Invalid repair request reference.');
      const parent = db.prepare('SELECT kind, payload_json FROM leads WHERE id = ?').get(payload.requestId);
      const canonicalPhone = value => { const digits = value.replace(/\D/g, ''); return digits.length === 10 ? '1' + digits : digits; };
      if (!parent || parent.kind !== 'webform' || canonicalPhone(JSON.parse(parent.payload_json).phone) !== canonicalPhone(payload.phone)) throw error(400, 'The recording could not be linked to that repair request. Please check your phone number.');
    }
    const hash = sha(JSON.stringify(payload) + ':' + (audio ? sha(audio) : ''));
    const key = suppliedKey || 'auto-' + hash;
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,120}$/.test(key)) throw error(400, 'Invalid request identifier. Please reload and try again.');
    const existing = db.prepare('SELECT id, received_at, payload_hash FROM leads WHERE idempotency_key = ?').get(key);
    if (existing) {
      if (existing.payload_hash !== hash) throw error(409, 'This request changed. Please try sending it again.');
      return { ok: true, received: true, id: existing.id, receivedAt: existing.received_at, duplicate: true };
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    // SQLite FULL synchronous commit completes before acknowledgement. The audio
    // and consent evidence live in the same transaction as the lead record.
    db.prepare('INSERT INTO leads (id, received_at, kind, idempotency_key, payload_hash, payload_json, audio_type, audio, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, now, payload.kind, key, hash, JSON.stringify(payload), type || null, audio || null, now);
    console.log(JSON.stringify({ event: 'lead_received', id, kind: payload.kind, receivedAt: now }));
    return { ok: true, received: true, id, receivedAt: now };
  };

  const publicServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { ok: true, service: 'Perfect Timing website requests' });
      if (req.method === 'GET' && url.pathname === '/chat/widget.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' });
        return res.end(fs.readFileSync(path.join(HERE, 'widget.js')));
      }
      if (!['/hooks/lead/webform', '/hooks/lead/voicenote'].includes(url.pathname)) return json(res, 404, { ok: false, error: 'Not found.' });
      const origin = req.headers.origin;
      if (!origins.has(origin)) return json(res, 403, { ok: false, error: 'This request must come from the shop website.' });
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', CORS_HEADERS);
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Max-Age': '600' }); return res.end(); }
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only.' });
      // Trust only the final proxy-appended address on loopback. A separate global
      // cap protects the receiver even if an upstream proxy changes its headers.
      const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',').at(-1).trim();
      const ip = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && isIP(forwarded) ? forwarded : req.socket.remoteAddress;
      if (rate('global') > maxGlobal || rate('ip:' + ip) > maxPerIp) { res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000))); return json(res, 429, { ok: false, error: 'Please wait a minute before sending another request, or call (239) 397-2048.' }); }
      const contentType = String(req.headers['content-type'] ?? '');
      let input, audio = null, audioType = '';
      const kind = url.pathname.endsWith('/voicenote') ? 'voicenote' : 'webform';
      if (kind === 'webform') {
        if (contentType.split(';')[0] !== 'application/json') throw error(415, 'Use JSON for repair requests.');
        const body = await readBody(req, MAX_JSON);
        try { input = JSON.parse(body.toString('utf8')); } catch { throw error(400, 'Invalid request.'); }
      } else if (contentType.toLowerCase().startsWith('multipart/form-data;')) {
        const body = await readBody(req, MAX_AUDIO + MAX_JSON);
        let form;
        try { form = await new Response(body, { headers: { 'Content-Type': contentType } }).formData(); } catch { throw error(400, 'Invalid recording upload.'); }
        input = {};
        for (const [key, value] of form) {
          if (typeof value === 'string') input[key] = value;
          else {
            if (audio || !['recording', 'audio'].includes(key)) throw error(400, 'Attach one recording only.');
            audio = Buffer.from(await value.arrayBuffer()); audioType = value.type.split(';')[0].toLowerCase();
          }
        }
        if (!audio) throw error(400, 'Attach a recording.');
      } else {
        audio = await readBody(req, MAX_AUDIO);
        audioType = contentType.split(';')[0].toLowerCase();
        input = { name: req.headers['x-name'], phone: req.headers['x-phone'], smsConsent: req.headers['x-sms-consent'], smsConsentTimestamp: req.headers['x-sms-consent-timestamp'], smsConsentVersion: req.headers['x-sms-consent-version'], smsConsentSource: req.headers['x-sms-consent-source'], smsConsentPage: req.headers['x-sms-consent-page'], smsConsentDisclosure: req.headers['x-sms-consent-disclosure'] };
      }
      if (audio) verifyAudio(audio, audioType);
      const payload = normalize(input, kind);
      const result = writeLead(payload, audio, audioType, req.headers['idempotency-key'] ?? req.headers['x-idempotency-key'] ?? input.idempotencyKey);
      json(res, result.duplicate ? 200 : 201, result);
    } catch (err) {
      if (!res.headersSent) json(res, err.status ?? 503, { ok: false, error: err.status ? err.message : 'The shop could not save your request. Please call (239) 397-2048.' });
      else res.end();
      if (!err.status) console.error(JSON.stringify({ event: 'receiver_error', code: err.code ?? 'internal' }));
    }
  });
  publicServer.requestTimeout = 30000;
  publicServer.headersTimeout = 10000;
  publicServer.maxConnections = 40;

  const adminServer = http.createServer(async (req, res) => {
    try {
      const boundPort = adminServer.address()?.port;
      const host = req.headers.host;
      if (![ `127.0.0.1:${boundPort}`, `localhost:${boundPort}`, `[::1]:${boundPort}` ].includes(host)) return json(res, 403, { ok: false, error: 'Open this inbox on the shop computer.' });
      if (req.headers.origin && ![`http://127.0.0.1:${boundPort}`, `http://localhost:${boundPort}`, `http://[::1]:${boundPort}`].includes(req.headers.origin)) return json(res, 403, { ok: false, error: 'Local inbox only.' });
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
      res.setHeader('Referrer-Policy', 'no-referrer');
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/api/leads') {
        const rows = db.prepare('SELECT id, received_at, kind, payload_json, status, updated_at, length(audio) AS audio_bytes, audio_type FROM leads ORDER BY received_at DESC LIMIT 200').all();
        return json(res, 200, { ok: true, leads: rows.map(({ payload_json, ...row }) => ({ ...row, ...JSON.parse(payload_json) })) });
      }
      const audioMatch = url.pathname.match(/^\/api\/leads\/([a-f0-9-]{36})\/audio$/);
      if (req.method === 'GET' && audioMatch) {
        const row = db.prepare('SELECT audio, audio_type FROM leads WHERE id = ?').get(audioMatch[1]);
        if (!row?.audio) return json(res, 404, { ok: false, error: 'Recording not found.' });
        const bytes = Buffer.from(row.audio);
        const headers = { 'Content-Type': row.audio_type, 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `inline; filename="recording.${AUDIO_TYPES.get(row.audio_type) || 'bin'}"`, 'Accept-Ranges': 'bytes' };
        if (req.headers.range) {
          const match = req.headers.range.match(/^bytes=(\d+)-(\d*)$/);
          if (!match) { res.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }); return res.end(); }
          const start = Number(match[1]), end = match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
          if (start > end || start >= bytes.length) { res.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }); return res.end(); }
          res.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${bytes.length}` }); return res.end(bytes.subarray(start, end + 1));
        }
        res.writeHead(200, headers); return res.end(bytes);
      }
      const statusMatch = url.pathname.match(/^\/api\/leads\/([a-f0-9-]{36})\/status$/);
      if (req.method === 'POST' && statusMatch) {
        if (req.headers['content-type']?.split(';')[0] !== 'application/json' || !req.headers.origin) throw error(403, 'Use the local inbox to update a request.');
        let input;
        try { input = JSON.parse((await readBody(req, 2048)).toString()); } catch { throw error(400, 'Invalid update.'); }
        if (!['new', 'contacted', 'closed'].includes(input.status)) throw error(400, 'Invalid status.');
        const result = db.prepare('UPDATE leads SET status = ?, updated_at = ? WHERE id = ?').run(input.status, new Date().toISOString(), statusMatch[1]);
        return json(res, result.changes ? 200 : 404, { ok: Boolean(result.changes) });
      }
      const assets = { '/': ['inbox.html', 'text/html'], '/inbox.js': ['inbox.js', 'application/javascript'], '/inbox.css': ['inbox.css', 'text/css'] };
      if (req.method === 'GET' && assets[url.pathname]) {
        const [file, type] = assets[url.pathname];
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        return res.end(fs.readFileSync(path.join(HERE, file)));
      }
      return json(res, 404, { ok: false, error: 'Not found.' });
    } catch (err) { if (!res.headersSent) json(res, err.status ?? 503, { ok: false, error: err.status ? err.message : 'The inbox is temporarily unavailable.' }); else res.end(); }
  });
  adminServer.requestTimeout = 10000;
  adminServer.headersTimeout = 5000;
  return {
    publicServer, adminServer, db, dataDir,
    async start(publicPort = Number(process.env.LEAD_PUBLIC_PORT || 18795), adminPort = Number(process.env.LEAD_INBOX_PORT || 18798)) {
      await new Promise((resolve, reject) => { publicServer.once('error', reject); publicServer.listen(publicPort, '127.0.0.1', resolve); });
      try { await new Promise((resolve, reject) => { adminServer.once('error', reject); adminServer.listen(adminPort, '127.0.0.1', resolve); }); } catch (err) { await new Promise(resolve => publicServer.close(resolve)); throw err; }
      return { publicPort: publicServer.address().port, adminPort: adminServer.address().port };
    },
    async close() {
      await Promise.all([publicServer, adminServer].map(server => new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); })));
      db.close();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const service = createLeadServers();
  service.start().then(ports => console.log(JSON.stringify({ event: 'listening', public: `127.0.0.1:${ports.publicPort}`, inbox: `http://127.0.0.1:${ports.adminPort}/` }))).catch(err => { console.error(JSON.stringify({ event: 'startup_failed', code: err.code ?? 'internal' })); process.exit(1); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => service.close().then(() => process.exit(0)));
}
