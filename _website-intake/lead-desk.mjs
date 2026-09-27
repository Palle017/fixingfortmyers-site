// Lead desk: one pipeline for every inquiry (website form, Bay One, Beside calls/texts, Facebook, referrals),
// Tony-approved estimates, and the numbers that show whether leads turn into paid work.
import {randomUUID, createHash, timingSafeEqual} from 'node:crypto';

export const STAGES = ['new', 'contacted', 'estimate_sent', 'booked', 'won', 'lost', 'spam'];
export const SOURCES = {ai: 'Bay One chat', form: 'Website form', voice: 'Website voice note', beside_call: 'Phone call (Beside)', beside_text: 'Text (Beside)',
  facebook: 'Facebook', google: 'Google', referral: 'Referral', repeat: 'Repeat customer', other: 'Other', unknown: 'Unknown'};
const LEGACY_STATUS = {new: 'new', contacted: 'contacted', estimate_sent: 'contacted', booked: 'contacted', won: 'closed', lost: 'closed', spam: 'closed'};
// Response targets. An inquiry past these shows up in "Needs action".
export const TARGETS = {firstContactMinutes: 15, estimateHours: 24, followUpDays: 3};
const TZ = 'America/New_York';
const fail = (status, message) => Object.assign(new Error(message), {status});
const money = value => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 200000) throw fail(400, 'Enter a dollar amount between 0 and 200,000.');
  return Math.round(n * 100) / 100;
};
const text = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const digits = phone => { const d = String(phone || '').replace(/\D/g, ''); return d.length === 10 ? '1' + d : d; };
const median = values => { const v = values.filter(Number.isFinite).sort((a, b) => a - b); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const round1 = n => n === null ? null : Math.round(n * 10) / 10;
const etParts = ms => Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23'}).formatToParts(new Date(ms)).map(p => [p.type, p.value]));
// Monday (Eastern) of the week containing ms, as YYYY-MM-DD.
export function weekOf(ms) {
  const p = etParts(ms), back = {Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6}[p.weekday];
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day - back));
  return d.toISOString().slice(0, 10);
}

export function createLeadDesk(db, {now = Date.now, besideToken = process.env.BESIDE_WEBHOOK_TOKEN || '', digest = null} = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS lead_pipeline(
    lead_id TEXT PRIMARY KEY, stage TEXT NOT NULL DEFAULT 'new', source TEXT NOT NULL DEFAULT 'unknown',
    estimate_low REAL, estimate_high REAL, estimate_note TEXT, estimate_approved_by TEXT,
    job_value REAL, lost_reason TEXT, next_step TEXT,
    contacted_at TEXT, estimate_sent_at TEXT, booked_at TEXT, closed_at TEXT, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS lead_touches(id INTEGER PRIMARY KEY, lead_id TEXT NOT NULL, at TEXT NOT NULL, channel TEXT NOT NULL, note TEXT);
  CREATE INDEX IF NOT EXISTS lead_touches_lead ON lead_touches(lead_id);
  CREATE TABLE IF NOT EXISTS desk_digests(week TEXT PRIMARY KEY, sent_at TEXT NOT NULL);`);
  const stamp = () => new Date(now()).toISOString();

  // Every lead gets a pipeline row; older website leads are backfilled from their stored status.
  function sync() {
    const missing = db.prepare('SELECT id, status, payload_json, updated_at FROM leads WHERE id NOT IN (SELECT lead_id FROM lead_pipeline)').all();
    for (const row of missing) {
      const payload = JSON.parse(row.payload_json);
      const source = SOURCES[payload.source] ? payload.source : payload.kind === 'voicenote' ? 'voice' : 'form';
      // "Closed" never said whether the job was won, so it is not counted as revenue.
      const stage = row.status === 'contacted' ? 'contacted' : row.status === 'closed' ? 'lost' : 'new';
      db.prepare('INSERT OR IGNORE INTO lead_pipeline(lead_id,stage,source,contacted_at,closed_at,lost_reason,updated_at) VALUES(?,?,?,?,?,?,?)').run(row.id, stage, source,
        stage === 'new' ? null : row.updated_at, stage === 'lost' ? row.updated_at : null, stage === 'lost' ? 'Closed before stage tracking' : null, stamp());
    }
  }

  function addManual(input, {afterInsert = null} = {}) {
    const name = text(input.name, 100), phone = text(input.phone, 40), details = text(input.details, 6000);
    if (!name && !phone) throw fail(400, 'Enter at least a name or a phone number.');
    if (phone && !/^\d{10,15}$/.test(phone.replace(/\D/g, ''))) throw fail(400, 'Enter a valid phone number.');
    const source = SOURCES[input.source] ? input.source : 'other';
    const receivedMs = input.receivedAt ? Date.parse(input.receivedAt) : now();
    if (!Number.isFinite(receivedMs) || receivedMs > now() + 300000 || receivedMs < now() - 400 * 86400000) throw fail(400, 'Enter a valid date for when the inquiry came in.');
    const stage = STAGES.includes(input.stage) ? input.stage : 'new';
    const id = randomUUID(), received = new Date(receivedMs).toISOString();
    const payload = {kind: 'manual', name: name || 'Unknown caller', phone, vehicle: text(input.vehicle, 160), service: text(input.service, 160), details, city: text(input.city, 100), source};
    const hash = createHash('sha256').update(JSON.stringify(payload) + received).digest('hex');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO leads(id,received_at,kind,idempotency_key,payload_hash,payload_json,status,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id, received, 'manual', 'manual-' + id, hash, JSON.stringify(payload), LEGACY_STATUS[stage], stamp());
      db.prepare('INSERT INTO lead_pipeline(lead_id,stage,source,updated_at) VALUES(?,?,?,?)').run(id, 'new', source, stamp());
      // A rejected stage (e.g. an estimate without Tony's approved price) rolls back the whole entry.
      if (stage !== 'new') applyStage(id, {...input, stage, at: input.stageAt || received});
      afterInsert?.(payload, id);
      db.exec('COMMIT');
    } catch (err) { db.exec('ROLLBACK'); throw err; }
    return {ok: true, id};
  }

  function setStage(id, input) {
    sync();
    return applyStage(id, input);
  }

  function applyStage(id, input) {
    const row = db.prepare('SELECT * FROM lead_pipeline WHERE lead_id=?').get(id);
    if (!row) throw fail(404, 'Lead not found.');
    const stage = input.stage;
    if (!STAGES.includes(stage)) throw fail(400, 'Unknown stage.');
    const at = input.at && Number.isFinite(Date.parse(input.at)) ? new Date(Date.parse(input.at)).toISOString() : stamp();
    const next = {...row, stage, updated_at: stamp(), next_step: input.nextStep !== undefined ? text(input.nextStep, 300) : row.next_step};
    const order = STAGES.indexOf(stage);
    if (order >= 1 && order <= 5 && !next.contacted_at) next.contacted_at = at;
    if (stage === 'estimate_sent') {
      // Tony approves every price before a customer sees it; the desk never invents one.
      const low = money(input.estimateLow), high = money(input.estimateHigh);
      if (low === null) throw fail(400, 'Enter the price Tony approved.');
      if (input.tonyApproved !== true) throw fail(400, 'Confirm that Tony approved this price.');
      if (high !== null && high < low) throw fail(400, 'The high end of the range must be at least the low end.');
      Object.assign(next, {estimate_low: low, estimate_high: high, estimate_note: text(input.estimateNote, 500), estimate_approved_by: 'Tony', estimate_sent_at: next.estimate_sent_at || at});
    }
    if (stage === 'booked' && !next.booked_at) next.booked_at = at;
    if (stage === 'won') { next.job_value = money(input.jobValue) ?? next.job_value; next.closed_at = at; if (!next.booked_at) next.booked_at = at; }
    if (stage === 'lost') { next.lost_reason = text(input.lostReason, 200) || next.lost_reason; next.closed_at = at; }
    if (stage === 'spam') next.closed_at = at;
    db.prepare(`UPDATE lead_pipeline SET stage=?,estimate_low=?,estimate_high=?,estimate_note=?,estimate_approved_by=?,job_value=?,lost_reason=?,next_step=?,
      contacted_at=?,estimate_sent_at=?,booked_at=?,closed_at=?,updated_at=? WHERE lead_id=?`).run(next.stage, next.estimate_low, next.estimate_high, next.estimate_note, next.estimate_approved_by,
      next.job_value, next.lost_reason, next.next_step, next.contacted_at, next.estimate_sent_at, next.booked_at, next.closed_at, next.updated_at, id);
    db.prepare('UPDATE leads SET status=?,updated_at=? WHERE id=?').run(LEGACY_STATUS[stage], stamp(), id);
    db.prepare('INSERT INTO lead_touches(lead_id,at,channel,note) VALUES(?,?,?,?)').run(id, stamp(), 'stage', stage);
    return {ok: true, stage};
  }

  // Beside -> Zapier "New Lead" / "Message" / "Call" webhook. Repeat contact from the same number within
  // 7 days is the same inquiry: it is logged as a touch instead of a new lead.
  function besideHook(token, input, {afterInsert = null} = {}) {
    if (!besideToken || besideToken.length < 24) throw fail(404, 'Not found.');
    const a = createHash('sha256').update(String(token)).digest(), b = createHash('sha256').update(besideToken).digest();
    if (!timingSafeEqual(a, b)) throw fail(404, 'Not found.');
    const rawPhone = text(input.phone || input.from || input.contact_phone || input.phone_number, 40);
    // A withheld or garbled number is still an inquiry: keep the event, note what was shown.
    const phone = /^\d{10,15}$/.test(rawPhone.replace(/\D/g, '')) ? rawPhone : '';
    const kind = /text|sms|message/i.test(String(input.type || input.event || '')) ? 'beside_text' : 'beside_call';
    const note = text((rawPhone && !phone ? `Caller ID shown: ${rawPhone}\n` : '') + (input.summary || input.body || input.message || input.transcript || input.text || ''), 6000);
    const key = digits(phone);
    if (key) {
      const recent = db.prepare("SELECT leads.id, leads.payload_json FROM leads JOIN lead_pipeline ON lead_pipeline.lead_id=leads.id WHERE leads.received_at>? ORDER BY leads.received_at DESC").all(new Date(now() - 7 * 86400000).toISOString())
        .find(row => digits(JSON.parse(row.payload_json).phone) === key);
      if (recent) { db.prepare('INSERT INTO lead_touches(lead_id,at,channel,note) VALUES(?,?,?,?)').run(recent.id, stamp(), kind, note.slice(0, 2000)); return {ok: true, id: recent.id, duplicate: true}; }
    }
    return {...addManual({name: input.name || input.contact_name || 'Beside caller', phone, details: note, source: kind, vehicle: input.vehicle}, {afterInsert}), duplicate: false};
  }

  function metrics() {
    sync();
    const rows = db.prepare('SELECT leads.id, leads.received_at, leads.payload_json, lead_pipeline.* FROM leads JOIN lead_pipeline ON lead_pipeline.lead_id=leads.id ORDER BY leads.received_at DESC').all();
    const real = rows.filter(row => row.stage !== 'spam');
    const nowMs = now(), thisWeek = weekOf(nowMs);
    const weeks = [];
    for (let i = 11; i >= 0; i--) weeks.push(weekOf(nowMs - i * 7 * 86400000));
    const perWeek = Object.fromEntries([...new Set(weeks)].map(week => [week, 0]));
    for (const row of real) { const week = weekOf(Date.parse(row.received_at)); if (week in perWeek) perWeek[week]++; }
    const complete = Object.entries(perWeek).filter(([week]) => week !== thisWeek);
    const firstWeekWithData = complete.findIndex(([, n]) => n > 0);
    const tracked = firstWeekWithData < 0 ? [] : complete.slice(firstWeekWithData);
    const bySource = {};
    for (const row of real) bySource[SOURCES[row.source] || row.source] = (bySource[SOURCES[row.source] || row.source] || 0) + 1;
    const minutes = (from, to) => to ? (Date.parse(to) - Date.parse(from)) / 60000 : NaN;
    const firstContact = real.map(row => minutes(row.received_at, row.contacted_at));
    const toEstimate = real.map(row => minutes(row.received_at, row.estimate_sent_at) / 60);
    // A lead counts at a step once that step happened, even if it was later lost.
    const reached = n => real.filter(row => [row.contacted_at, row.estimate_sent_at, row.booked_at][n - 1]).length;
    const won = real.filter(row => row.stage === 'won');
    const revenue = won.reduce((sum, row) => sum + (row.job_value || 0), 0);
    const need = [];
    for (const row of real) {
      const p = JSON.parse(row.payload_json), age = (nowMs - Date.parse(row.received_at)) / 60000, label = `${p.name || 'Unknown'} · ${p.vehicle || 'vehicle?'} · ${p.phone || 'no phone'}`;
      if (row.stage === 'new' && age > TARGETS.firstContactMinutes) need.push({id: row.id, label, why: `No contact yet (${Math.round(age / 60 * 10) / 10} h)`, age});
      else if (row.stage === 'contacted' && minutes(row.contacted_at, new Date(nowMs).toISOString()) / 60 > TARGETS.estimateHours) need.push({id: row.id, label, why: 'Contacted but no Tony-approved estimate yet', age});
      else if (row.stage === 'estimate_sent' && minutes(row.estimate_sent_at, new Date(nowMs).toISOString()) / 1440 > TARGETS.followUpDays) need.push({id: row.id, label, why: 'Estimate sent, no answer: follow up', age});
    }
    need.sort((a, b) => b.age - a.age);
    const total = real.length;
    const pct = (n, d) => d ? Math.round(n / d * 100) : null;
    return {
      ok: true, generatedAt: new Date(nowMs).toISOString(), targets: TARGETS,
      totals: {leads: total, spam: rows.length - total, contacted: reached(1), estimateSent: reached(2), booked: reached(3), won: won.length, lost: real.filter(row => row.stage === 'lost').length, open: real.filter(row => ['new', 'contacted', 'estimate_sent', 'booked'].includes(row.stage)).length},
      rates: {contactedPct: pct(reached(1), total), estimatePct: pct(reached(2), total), bookedPct: pct(reached(3), total), wonPct: pct(won.length, total),
        contactedWithinTargetPct: pct(firstContact.filter(m => m <= TARGETS.firstContactMinutes).length, total)},
      speed: {medianMinutesToFirstContact: round1(median(firstContact)), medianHoursToEstimate: round1(median(toEstimate))},
      money: {wonRevenue: revenue, averageJob: won.length ? Math.round(revenue / won.length) : null,
        openEstimateValue: real.filter(row => row.stage === 'estimate_sent').reduce((sum, row) => sum + (row.estimate_high || row.estimate_low || 0), 0)},
      weekly: {weeks: perWeek, thisWeek: perWeek[thisWeek] ?? 0, averagePerWeek: tracked.length ? round1(tracked.reduce((s, [, n]) => s + n, 0) / tracked.length) : null, weeksCounted: tracked.length},
      bySource, needsAction: need.slice(0, 50),
    };
  }

  function digestText(m) {
    const w = m.weekly, t = m.totals;
    return [`Leads this week so far: ${w.thisWeek}. Average per week: ${w.averagePerWeek ?? 'n/a'} (over ${w.weeksCounted} full weeks).`,
      `Pipeline: ${t.leads} leads, ${t.contacted} contacted, ${t.estimateSent} got an estimate, ${t.booked} booked, ${t.won} won, ${t.lost} lost, ${t.open} still open.`,
      `Speed: median ${m.speed.medianMinutesToFirstContact ?? 'n/a'} min to first contact; ${m.rates.contactedWithinTargetPct ?? 'n/a'}% reached within ${TARGETS.firstContactMinutes} min. Median ${m.speed.medianHoursToEstimate ?? 'n/a'} h to an estimate.`,
      `Money: $${m.money.wonRevenue.toLocaleString()} won, average job ${m.money.averageJob ? '$' + m.money.averageJob : 'n/a'}, $${m.money.openEstimateValue.toLocaleString()} in open estimates.`,
      `Sources: ${Object.entries(m.bySource).map(([k, v]) => `${k} ${v}`).join(', ') || 'none yet'}.`,
      '', `Needs action (${m.needsAction.length}):`, ...m.needsAction.slice(0, 15).map(n => `- ${n.label}: ${n.why}`)].join('\n');
  }
  // Monday 8 AM Eastern: one summary to every notification channel that carries text (email, push).
  async function maybeDigest() {
    if (!digest) return;
    const p = etParts(now());
    if (p.weekday !== 'Mon' || +p.hour < 8) return;
    const week = weekOf(now());
    if (db.prepare('SELECT 1 FROM desk_digests WHERE week=?').get(week)) return;
    db.prepare('INSERT INTO desk_digests VALUES(?,?)').run(week, stamp());
    try { await digest({title: 'Perfect Timing weekly lead report', text: digestText(metrics())}); } catch { db.prepare('DELETE FROM desk_digests WHERE week=?').run(week); }
  }
  let timer = null;
  return {
    sync, addManual, setStage, besideHook, metrics, digestText, maybeDigest,
    pipeline: id => db.prepare('SELECT * FROM lead_pipeline WHERE lead_id=?').get(id) || null,
    touches: id => db.prepare('SELECT at,channel,note FROM lead_touches WHERE lead_id=? ORDER BY at DESC LIMIT 20').all(id),
    start() { if (!timer) { timer = setInterval(() => { maybeDigest().catch(() => {}); }, 15 * 60000); timer.unref(); } },
    close() { clearInterval(timer); },
  };
}
