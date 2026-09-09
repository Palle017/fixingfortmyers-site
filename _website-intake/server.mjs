import http from 'node:http';
import {createPublicChat,routePublicChat} from './public-chat.mjs';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX_JSON = 48 * 1024;
const MAX_AUDIO = 8 * 1024 * 1024;
const MAX_METRICS_JSON = 16 * 1024;
const AUDIO_TYPES = new Map([['audio/webm', 'webm'], ['audio/ogg', 'ogg'], ['audio/wav', 'wav'], ['audio/x-wav', 'wav'], ['audio/mp4', 'm4a'], ['audio/mpeg', 'mp3']]);
const CORS_HEADERS = 'Content-Type, Idempotency-Key, X-Idempotency-Key, X-Phone, X-Name, X-SMS-Consent, X-SMS-Consent-Timestamp, X-SMS-Consent-Version, X-SMS-Consent-Source, X-SMS-Consent-Page, X-SMS-Consent-Disclosure';
const sha = value => createHash('sha256').update(value).digest('hex');
const error = (status, message) => Object.assign(new Error(message), { status });
const utcDay = value => new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const clean = (value, max, required = false) => {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw error(400, 'Use text for the request fields.');
  const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (text.length > max) throw error(400, 'One of the request fields is too long.');
  if (required && !text) throw error(400, 'Please enter your name and phone number.');
  return text;
};
const cleanText = (value, max) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw error(400, 'Invalid analytics payload.');
  const text = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (text.length > max) throw error(400, 'Analytics payload is too long.');
  return text;
};

const normalizeVisitorKey = (ip, agent, seed = '') => {
  const combined = String(seed || `${ip}|${agent || ''}`).trim().toLowerCase();
  return sha(`pt-web-metric|${combined}`);
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
  ); CREATE INDEX IF NOT EXISTS leads_received ON leads(received_at DESC);
  CREATE TABLE IF NOT EXISTS website_visitors (
    visitor_key TEXT PRIMARY KEY, total_visits INTEGER NOT NULL DEFAULT 1,
    first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, first_day TEXT NOT NULL, last_day TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS website_visitors_last_seen ON website_visitors(last_seen);
  CREATE TABLE IF NOT EXISTS website_visitor_daily (
    day TEXT NOT NULL, visitor_key TEXT NOT NULL,
    PRIMARY KEY(day, visitor_key)
  ); CREATE INDEX IF NOT EXISTS website_visitor_daily_day ON website_visitor_daily(day);
  CREATE TABLE IF NOT EXISTS website_visit_events (
    id INTEGER PRIMARY KEY, visitor_key TEXT NOT NULL, day TEXT NOT NULL,
    page TEXT NOT NULL, created_at TEXT NOT NULL, created_ms INTEGER NOT NULL
  ); CREATE INDEX IF NOT EXISTS website_visit_events_day ON website_visit_events(day);
  CREATE TABLE IF NOT EXISTS ai_usage (
    id INTEGER PRIMARY KEY, visitor_key TEXT NOT NULL, request_id TEXT NOT NULL,
    mode TEXT NOT NULL, day TEXT NOT NULL, created_at TEXT NOT NULL, created_ms INTEGER NOT NULL
  ); CREATE INDEX IF NOT EXISTS ai_usage_day ON ai_usage(day);
  CREATE INDEX IF NOT EXISTS ai_usage_mode_day ON ai_usage(day,mode);`);
  if (!db.prepare('PRAGMA table_info(website_visit_events)').all().some(c=>c.name==='event_id')) db.exec('ALTER TABLE website_visit_events ADD COLUMN event_id TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS website_visit_event_id ON website_visit_events(event_id)');
  const origins = new Set(options.origins ?? ['https://fixingfortmyers.com', 'https://www.fixingfortmyers.com', ...(process.env.LEAD_DEV_ORIGINS ?? '').split(',').map(x => x.trim()).filter(Boolean)]);
  let publicChat = null;
  try { publicChat = createPublicChat({dataDir:path.join(dataDir,'public-chat'),...(options.chat||{})}); }
  catch { console.error(JSON.stringify({event:'public_chat_unavailable'})); }
  const windowMs = options.rateWindowMs ?? 60000;
  const maxPerIp = options.maxPerIp ?? 12;
  const maxGlobal = options.maxGlobal ?? 120;
  const maxRecordingPerIp = options.maxRecordingPerIp ?? 4;
  const maxRecordingGlobal = options.maxRecordingGlobal ?? 24;
  const recordingDiskFreeBytes = options.recordingDiskFreeBytes ?? (() => {
    const space = fs.statfsSync(dataDir, { bigint: true });
    return space.bavail * space.bsize;
  });
  const ensureRecordingSpace = audio => {
    let available;
    try { available = BigInt(recordingDiskFreeBytes()); }
    catch { throw Object.assign(error(503, 'Recording storage is temporarily unavailable. Your recording was not saved. Please retry in a minute or call (239) 397-2048.'), { retryAfter: 60 }); }
    // Leave 1 GiB free, plus room for the recording, database, and WAL writes.
    const required = 1024n * 1024n * 1024n + 3n * BigInt(audio.length);
    if (available < required) throw Object.assign(error(503, 'Recording storage is temporarily full. Your recording was not saved. Please retry later or call (239) 397-2048.'), { retryAfter: 60 });
  };
  const rates = new Map();
  const rate = key => {
    const now = Date.now();
    for (const [k, item] of rates) if (item.until <= now) rates.delete(k);
    let entry = rates.get(key);
    if (!entry) { entry = { count: 0, until: now + windowMs }; rates.set(key, entry); }
    entry.count++;
    return entry.count;
  };
  const recordVisitor = (req, body, ip) => {
    if (rate('analytics:visitor:global') > 300 || rate('analytics:visitor:ip:' + ip) > 80) {
      const err = error(429, 'Analytics is temporarily rate limited.');
      err.retryAfter = Math.ceil(windowMs / 1000);
      throw err;
    }
    if (!body || typeof body!=='object' || Array.isArray(body)) throw error(400,'Invalid analytics payload.');
    const visitorId=cleanText(body.visitor_id,80),eventId=cleanText(body.event_id,80);
    if (![visitorId,eventId].every(v=>/^[A-Za-z0-9_-]{16,80}$/.test(v))) throw error(400,'Invalid analytics identifier.');
    const visitorKey = normalizeVisitorKey(ip, req.headers['user-agent'] || '', visitorId);
    const now = new Date().toISOString(),day=utcDay(Date.now());
    const page=cleanText(body.page,500).split(/[?#]/)[0];
    if (!page.startsWith('/') || page.startsWith('//')) throw error(400,'Invalid page path.');
    db.exec('BEGIN IMMEDIATE');
    try {
      const added=db.prepare('INSERT OR IGNORE INTO website_visit_events(visitor_key,day,page,created_at,created_ms,event_id) VALUES(?,?,?,?,?,?)').run(visitorKey,day,page,now,Date.now(),eventId);
      if (added.changes) {
        db.prepare('INSERT INTO website_visitors(visitor_key,first_seen,last_seen,first_day,last_day) VALUES(?,?,?,?,?) ON CONFLICT(visitor_key) DO UPDATE SET last_seen=excluded.last_seen,last_day=excluded.last_day,total_visits=total_visits+1').run(visitorKey,now,now,day,day);
        db.prepare('INSERT OR IGNORE INTO website_visitor_daily(day,visitor_key) VALUES(?,?)').run(day,visitorKey);
      }
      db.exec('COMMIT');
    } catch(err) { db.exec('ROLLBACK');throw err; }
  };
  const readMetrics = (chatDb) => {
    const day = utcDay(Date.now());
    const totals = db.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(total_visits),0) AS events FROM website_visitors').get() || {};
    const todayVisitsUnique = db.prepare('SELECT COUNT(*) AS total FROM website_visitor_daily WHERE day = ?').get(day) || {};
    const todayVisits = db.prepare('SELECT COUNT(*) AS total FROM website_visit_events WHERE day = ?').get(day) || {};
    const appointments = db.prepare('SELECT status, COUNT(*) AS total FROM leads GROUP BY status').all();
    const status = {};
    for (const row of appointments) status[row.status || 'unknown'] = row.total;
    const totalLeads = db.prepare('SELECT COUNT(*) AS total FROM leads').get() || {};
    let ai = { total_messages: 0, today_messages: 0, chat_messages: 0, estimate_messages: 0, today_chat_messages: 0, today_estimate_messages: 0 };
      if (chatDb) {
        const total = chatDb.prepare("SELECT SUM(messages) AS total, SUM(estimates) AS estimates FROM chat_metric_days").get() || {};
        const today = chatDb.prepare("SELECT SUM(messages) AS total, SUM(estimates) AS estimates FROM chat_metric_days WHERE day = ?").get(day) || {};
      ai = {
        total_messages: Number(total.total || 0),
        today_messages: Number(today.total || 0),
        chat_messages: Math.max(0, Number(total.total || 0) - Number(total.estimates || 0)),
        estimate_messages: Number(total.estimates || 0),
        today_chat_messages: Math.max(0, Number(today.total || 0) - Number(today.estimates || 0)),
        today_estimate_messages: Number(today.estimates || 0),
      };
    }
    return {
      ok: true,
      metrics: {
        timezone: 'America/New_York',
        visitors: { total_unique: Number(totals.total || 0), total_events: Number(totals.events || 0), today_unique: Number(todayVisitsUnique.total || 0), today_events: Number(todayVisits.total || 0), updated_at: new Date().toISOString() },
        appointments: { total: Number(totalLeads.total || 0), new: Number(status.new || 0), contacted: Number(status.contacted || 0), closed: Number(status.closed || 0), pending: Number(status.pending || 0) },
        ai: chatDb ? ai : null,
      },
    };
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
    if (audio) ensureRecordingSpace(audio);
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
      if (['/chat/session','/chat/message'].includes(url.pathname)) {
        const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',').at(-1).trim();
        const ip = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && isIP(forwarded) ? forwarded : req.socket.remoteAddress;
        await routePublicChat(publicChat,req,res,{origins,ip,readBody,json});
        return;
      }
      if (req.method === 'GET' && url.pathname === '/chat/widget.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' });
        return res.end(fs.readFileSync(path.join(HERE, 'widget.js')));
      }
      if (!['/hooks/lead/webform', '/hooks/lead/voicenote', '/hooks/analytics/visit'].includes(url.pathname)) return json(res, 404, { ok: false, error: 'Not found.' });
      const origin = req.headers.origin;
      if (!origins.has(origin)) return json(res, 403, { ok: false, error: 'This request must come from the shop website.' });
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', url.pathname.startsWith('/hooks/analytics/') ? 'Content-Type' : CORS_HEADERS);
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Max-Age': '600' }); return res.end(); }
      const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',').at(-1).trim();
      const ip = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && isIP(forwarded) ? forwarded : req.socket.remoteAddress;
      if (url.pathname === '/hooks/analytics/visit') {
        if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only.' });
        try {
          const body = await readBody(req, MAX_METRICS_JSON).then(buffer => {
            if (!buffer.length) return {};
            try { return JSON.parse(buffer.toString('utf8')); } catch { throw error(400, 'Invalid analytics payload.'); }
          });
          recordVisitor(req, body, ip);
          return json(res, 200, { ok: true });
        } catch (err) {
          if (!res.headersSent) {
            if (err.retryAfter) res.setHeader('Retry-After', String(err.retryAfter));
            return json(res, err.status ?? 503, { ok: false, error: err.status ? err.message : 'Visitor tracking is temporarily unavailable.' });
          }
          return res.end();
        }
      }
      if (!['/hooks/lead/webform', '/hooks/lead/voicenote'].includes(url.pathname)) return json(res, 404, { ok: false, error: 'Not found.' });
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only.' });
      const kind = url.pathname.endsWith('/voicenote') ? 'voicenote' : 'webform';
      const isRecording = kind === 'voicenote';
      const globalLimit = isRecording ? maxRecordingGlobal : maxGlobal;
      const ipLimit = isRecording ? maxRecordingPerIp : maxPerIp;
      if (rate(kind + ':global') > globalLimit || rate(kind + ':ip:' + ip) > ipLimit) {
        res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
        return json(res, 429, { ok: false, error: isRecording ? 'Too many recordings were sent recently. Your recording was not saved. Please retry in a minute or call (239) 397-2048.' : 'Please wait a minute before sending another request, or call (239) 397-2048.' });
      }
      const contentType = String(req.headers['content-type'] ?? '');
      let input, audio = null, audioType = '';
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
      if (!res.headersSent) {
        if (err.retryAfter) res.setHeader('Retry-After', String(err.retryAfter));
        json(res, err.status ?? 503, { ok: false, error: err.status ? err.message : 'The shop could not save your request. Please call (239) 397-2048.' });
      } else res.end();
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
        const rawLimit = url.searchParams.get('limit') ?? '200';
        if (!/^[1-9]\d{0,2}$/.test(rawLimit) || Number(rawLimit) > 200) throw error(400, 'Inbox page limit must be between 1 and 200.');
        const limit = Number(rawLimit);
        const rawCursor = url.searchParams.get('cursor');
        let cursor = null;
        if (rawCursor !== null) {
          try {
            if (!rawCursor || rawCursor.length > 256 || !/^[A-Za-z0-9_-]+$/.test(rawCursor)) throw new Error();
            cursor = JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8'));
            if (!cursor || cursor.v !== 1 || typeof cursor.received_at !== 'string'
                || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor.received_at)
                || !Number.isFinite(Date.parse(cursor.received_at))
                || new Date(cursor.received_at).toISOString() !== cursor.received_at
                || typeof cursor.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(cursor.id)) throw new Error();
          } catch { throw error(400, 'Invalid inbox cursor. Refresh the request list.'); }
        }
        const fields = 'SELECT id, received_at, kind, payload_json, status, updated_at, length(audio) AS audio_bytes, audio_type FROM leads';
        const rows = cursor
          ? db.prepare(fields + ' WHERE received_at < ? OR (received_at = ? AND id < ?) ORDER BY received_at DESC, id DESC LIMIT ?').all(cursor.received_at, cursor.received_at, cursor.id, limit + 1)
          : db.prepare(fields + ' ORDER BY received_at DESC, id DESC LIMIT ?').all(limit + 1);
        const hasMore = rows.length > limit;
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        const nextCursor = hasMore && last ? Buffer.from(JSON.stringify({ v: 1, received_at: last.received_at, id: last.id })).toString('base64url') : null;
        return json(res, 200, { ok: true, leads: page.map(({ payload_json, ...row }) => ({ ...row, ...JSON.parse(payload_json) })), next_cursor: nextCursor, has_more: hasMore, returned_count: page.length });
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
      if (req.method === 'GET' && url.pathname === '/api/metrics') {
        return json(res, 200, readMetrics(publicChat?.db));
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
      publicChat?.close();
      db.close();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const service = createLeadServers();
  service.start().then(ports => console.log(JSON.stringify({ event: 'listening', public: `127.0.0.1:${ports.publicPort}`, inbox: `http://127.0.0.1:${ports.adminPort}/` }))).catch(err => { console.error(JSON.stringify({ event: 'startup_failed', code: err.code ?? 'internal' })); process.exit(1); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => service.close().then(() => process.exit(0)));
}
