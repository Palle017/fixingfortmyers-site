// Instant confirmation text to the customer after a saved web request: speed-to-lead.
// Sent only when the customer ticked text permission, customer texts are switched on
// (LEAD_CUSTOMER_TEXTS=true) and Twilio is configured. Twilio has no idempotency key, so an
// uncertain send is never repeated; only an explicit rate-limit answer is retried.
import {createHash} from 'node:crypto';
import {TONY_ALERT_NUMBER} from './lead-routing.mjs';

const SHOP_NUMBER_TEXT = '(239) 397-2048';
const issue = (code, {retryable = false} = {}) => Object.assign(new Error(code), {code, retryable});
export const customerNumber = phone => { const d = String(phone || '').replace(/\D/g, ''); return d.length === 10 ? '+1' + d : d.length === 11 && d[0] === '1' ? '+' + d : ''; };

export function confirmationText(lead, {urgent = false} = {}) {
  const first = String(lead.name || '').trim().split(/\s+/)[0].replace(/[^\p{L}'-]/gu, '').slice(0, 30);
  const vehicle = String(lead.vehicle || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60);
  return [`Perfect Timing Auto Repair: Hi${first ? ' ' + first : ''}, Tony got your repair request${vehicle && !/^Not provided/i.test(vehicle) ? ' for your ' + vehicle : ''}.`,
    urgent ? `You said you're stranded, so it's marked urgent. If you're somewhere unsafe, call 911.` : `He'll call or text you from ${SHOP_NUMBER_TEXT} to go over it.`,
    `Questions or photos? Text Tony at ${SHOP_NUMBER_TEXT}. Reply STOP to opt out, HELP for help.`].join(' ');
}

export function createTwilioCustomerAdapter({accountSid, authToken, fromNumber, fetchImpl = fetch} = {}) {
  if (!/^AC[a-f0-9]{32}$/i.test(accountSid || '') || !authToken || !/^\+[1-9]\d{9,14}$/.test(fromNumber || '') || fromNumber === TONY_ALERT_NUMBER) throw Error('Invalid customer text configuration.');
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const headers = {Authorization: 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded'};
  return {fromNumber, async send(to, body) {
    let response;
    try { response = await fetchImpl(url, {method: 'POST', headers, body: new URLSearchParams({To: to, From: fromNumber, Body: body}).toString(), signal: AbortSignal.timeout(10000)}); }
    catch { throw issue('provider_unavailable'); }
    if (response.status === 429) throw issue('rate_limited', {retryable: true});
    if (response.status >= 500) throw issue('provider_unavailable');
    if (!response.ok) throw issue('request_rejected');
    const result = await response.json().catch(() => ({}));
    if (!/^SM[a-f0-9]{32}$/i.test(result.sid || '')) throw issue('provider_response');
    return {id: result.sid};
  }};
}

export function createCustomerTexts(db, {adapter = null, now = Date.now, maxPerDay = 60} = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS customer_texts(lead_id TEXT PRIMARY KEY, phone_key TEXT NOT NULL, state TEXT NOT NULL, body TEXT, attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_ms INTEGER NOT NULL, provider_id TEXT, last_error TEXT, created_ms INTEGER NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS customer_texts_due ON customer_texts(state, next_attempt_ms);`);
  // A crash mid-send may already have delivered: never resend, flag it instead.
  db.prepare("UPDATE customer_texts SET state='needs_review',last_error='interrupted' WHERE state='sending'").run();
  const stamp = () => new Date(now()).toISOString();
  let timer = null, busy = null, closing = false;

  // Called inside the lead's own transaction, so the text row commits with the lead.
  function enqueue(lead, id, {urgent = false} = {}) {
    if (!adapter || lead.smsConsent !== true) return;
    const to = customerNumber(lead.phone);
    if (!to) return;
    const phoneKey = createHash('sha256').update(to).digest('hex');
    const recent = db.prepare("SELECT 1 FROM customer_texts WHERE phone_key=? AND created_ms>? AND state NOT IN ('skipped')").get(phoneKey, now() - 86400000);
    const today = db.prepare("SELECT COUNT(*) n FROM customer_texts WHERE created_ms>? AND state NOT IN ('skipped')").get(now() - 86400000).n;
    const skip = recent ? 'already_texted_today' : today >= maxPerDay ? 'daily_cap' : null;
    db.prepare('INSERT OR IGNORE INTO customer_texts(lead_id,phone_key,state,body,next_attempt_ms,last_error,created_ms,updated_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, phoneKey, skip ? 'skipped' : 'pending', skip ? null : confirmationText(lead, {urgent}), now(), skip, now(), stamp());
  }
  async function run() {
    if (!adapter || closing) return;
    const rows = db.prepare("SELECT customer_texts.*, leads.payload_json FROM customer_texts JOIN leads ON leads.id=customer_texts.lead_id WHERE state='pending' AND next_attempt_ms<=? ORDER BY next_attempt_ms LIMIT 10").all(now());
    for (const row of rows) {
      if (closing) break;
      db.prepare("UPDATE customer_texts SET state='sending',attempts=attempts+1,updated_at=? WHERE lead_id=?").run(stamp(), row.lead_id);
      try {
        const result = await adapter.send(customerNumber(JSON.parse(row.payload_json).phone), row.body);
        db.prepare("UPDATE customer_texts SET state='sent',provider_id=?,last_error=NULL,updated_at=? WHERE lead_id=?").run(result.id, stamp(), row.lead_id);
      } catch (err) {
        const retry = err.retryable && row.attempts < 3, state = retry ? 'pending' : err.code === 'request_rejected' ? 'failed' : 'needs_review';
        db.prepare('UPDATE customer_texts SET state=?,last_error=?,next_attempt_ms=?,updated_at=? WHERE lead_id=?').run(state, String(err.code || 'failed').slice(0, 40), now() + 60000 * (row.attempts + 1), stamp(), row.lead_id);
      }
    }
  }
  const tick = () => { if (busy) return busy; busy = run().finally(() => { busy = null; }); return busy; };
  return {
    enqueue, tick, enabled: Boolean(adapter),
    inspect: id => db.prepare('SELECT state, last_error, updated_at FROM customer_texts WHERE lead_id=?').get(id) || null,
    start() { if (adapter && !timer) { timer = setInterval(() => { tick().catch(() => {}); }, 5000); timer.unref(); } },
    async close() { closing = true; clearInterval(timer); if (busy) await busy; },
  };
}
