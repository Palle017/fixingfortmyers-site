// Customer photos and short videos attached to a saved repair request.
// The lead is always saved first; media arrives afterwards with a one-time upload key
// issued in the lead's receipt, so a slow or failed upload can never lose the lead.
import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';

const MB = 1024 * 1024;
export const MEDIA_LIMITS = Object.freeze({imageBytes: 15 * MB, videoBytes: 100 * MB, files: 6, totalBytes: 200 * MB, tokenMinutes: 120});
// Content type -> [kind, extension, check on the first bytes].
const ftypBrand = head => head.subarray(4, 8).toString('latin1') === 'ftyp' ? head.subarray(8, 12).toString('latin1') : '';
export const MEDIA_TYPES = new Map([
  ['image/jpeg', ['image', 'jpg', head => head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff]],
  ['image/png', ['image', 'png', head => head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))]],
  ['image/webp', ['image', 'webp', head => head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP']],
  ['image/heic', ['image', 'heic', head => /^(heic|heix|hevc|heim|heis|hevm|hevs|mif1|msf1)$/.test(ftypBrand(head))]],
  ['image/heif', ['image', 'heif', head => /^(heic|heix|hevc|heim|heis|hevm|hevs|mif1|msf1)$/.test(ftypBrand(head))]],
  ['video/mp4', ['video', 'mp4', head => Boolean(ftypBrand(head))]],
  ['video/quicktime', ['video', 'mov', head => Boolean(ftypBrand(head)) || /^(moov|wide|mdat|free|skip)$/.test(head.subarray(4, 8).toString('latin1'))]],
  ['video/webm', ['video', 'webm', head => head.subarray(0, 4).toString('hex') === '1a45dfa3']],
]);
const fail = (status, message) => Object.assign(new Error(message), {status});
const hash = value => createHash('sha256').update(value).digest();

export function createLeadMedia(db, {dataDir, now = Date.now, diskFree = null} = {}) {
  const root = path.join(dataDir, 'media');
  fs.mkdirSync(root, {recursive: true});
  db.exec(`CREATE TABLE IF NOT EXISTS lead_media_tokens(lead_id TEXT PRIMARY KEY, token_hash BLOB NOT NULL, expires_ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS lead_media(lead_id TEXT NOT NULL, idx INTEGER NOT NULL, type TEXT NOT NULL, bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL, file TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(lead_id, idx));`);
  // Leftover partial uploads from a crash are never valid media.
  for (const dir of fs.readdirSync(root)) for (const name of fs.readdirSync(path.join(root, dir)).filter(n => n.startsWith('.upload-'))) fs.rmSync(path.join(root, dir, name), {force: true});

  function issueToken(leadId) {
    const token = randomBytes(24).toString('base64url');
    db.prepare('INSERT INTO lead_media_tokens(lead_id,token_hash,expires_ms) VALUES(?,?,?) ON CONFLICT(lead_id) DO UPDATE SET token_hash=excluded.token_hash,expires_ms=excluded.expires_ms')
      .run(leadId, hash(token), now() + MEDIA_LIMITS.tokenMinutes * 60000);
    return token;
  }
  function tokenValid(leadId, token) {
    const row = db.prepare('SELECT token_hash, expires_ms FROM lead_media_tokens WHERE lead_id=?').get(leadId);
    return Boolean(row && typeof token === 'string' && token.length <= 200 && row.expires_ms > now() && timingSafeEqual(Buffer.from(row.token_hash), hash(token)));
  }
  const list = leadId => db.prepare('SELECT idx, type, bytes, created_at FROM lead_media WHERE lead_id=? ORDER BY idx').all(leadId);

  // Streams one file to disk with hard size caps, checks it really is the declared photo or video
  // format, then records it. Returns {index, count, duplicate}.
  async function save(leadId, token, type, stream, {declaredBytes = NaN} = {}) {
    if (!tokenValid(leadId, token)) throw fail(403, 'This upload link has expired. Your request is saved; text photos to (239) 397-2048 instead.');
    const spec = MEDIA_TYPES.get(type);
    if (!spec) throw fail(415, 'Send photos (JPG, PNG, WebP, HEIC) or videos (MP4, MOV, WebM).');
    const [kind, ext, looksRight] = spec, max = kind === 'video' ? MEDIA_LIMITS.videoBytes : MEDIA_LIMITS.imageBytes;
    if (declaredBytes > max) throw fail(413, kind === 'video' ? 'That video is too large. Please send a clip under 100 MB (about 30 seconds).' : 'That photo is too large (15 MB max).');
    const used = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(bytes),0) total FROM lead_media WHERE lead_id=?').get(leadId);
    if (used.n >= MEDIA_LIMITS.files) throw fail(409, `Up to ${MEDIA_LIMITS.files} photos or videos can be added to one request.`);
    if (diskFree) { const free = BigInt(diskFree()); if (free < 1024n * BigInt(MB) + 2n * BigInt(max)) throw fail(503, 'Photo storage is temporarily full. Your request is saved; text photos to (239) 397-2048.'); }
    const dir = path.join(root, leadId);
    fs.mkdirSync(dir, {recursive: true});
    const temp = path.join(dir, '.upload-' + randomUUID());
    const digest = createHash('sha256');
    let size = 0, head = Buffer.alloc(0);
    try {
      const out = fs.createWriteStream(temp, {flags: 'wx'});
      const done = new Promise((resolve, reject) => { out.on('finish', resolve); out.on('error', reject); });
      for await (const chunk of stream) {
        size += chunk.length;
        if (size > max) throw fail(413, kind === 'video' ? 'That video is too large. Please send a clip under 100 MB (about 30 seconds).' : 'That photo is too large (15 MB max).');
        if (head.length < 16) head = Buffer.concat([head, chunk.subarray(0, 16 - head.length)]);
        digest.update(chunk);
        if (!out.write(chunk)) await new Promise(resolve => out.once('drain', resolve));
      }
      out.end(); await done;
      if (size < 16 || !looksRight(head)) throw fail(415, 'That file does not look like the photo or video it claims to be.');
      const sha = digest.digest('hex');
      // A retried upload of the same file is the same attachment, not a new one.
      const existing = db.prepare('SELECT idx FROM lead_media WHERE lead_id=? AND sha256=?').get(leadId, sha);
      if (existing) { fs.rmSync(temp, {force: true}); return {index: existing.idx, count: used.n, duplicate: true}; }
      db.exec('BEGIN IMMEDIATE');
      try {
        const now2 = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(bytes),0) total, COALESCE(MAX(idx),0) last FROM lead_media WHERE lead_id=?').get(leadId);
        if (now2.n >= MEDIA_LIMITS.files) throw fail(409, `Up to ${MEDIA_LIMITS.files} photos or videos can be added to one request.`);
        if (now2.total + size > MEDIA_LIMITS.totalBytes) throw fail(413, 'These files add up to more than 200 MB. Send the most important ones, or text them to (239) 397-2048.');
        const index = now2.last + 1, file = `${index}.${ext}`;
        fs.renameSync(temp, path.join(dir, file));
        db.prepare('INSERT INTO lead_media(lead_id,idx,type,bytes,sha256,file,created_at) VALUES(?,?,?,?,?,?,?)').run(leadId, index, type, size, sha, file, new Date(now()).toISOString());
        db.exec('COMMIT');
        return {index, count: now2.n + 1, duplicate: false};
      } catch (err) { db.exec('ROLLBACK'); throw err; }
    } finally { fs.rmSync(temp, {force: true}); }
  }

  function file(leadId, index) {
    const row = db.prepare('SELECT type, bytes, file FROM lead_media WHERE lead_id=? AND idx=?').get(leadId, index);
    return row ? {...row, path: path.join(root, leadId, row.file)} : null;
  }
  return {issueToken, tokenValid, save, list, file};
}
