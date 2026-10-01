// Zoho estimate status, read back into the Lead Desk.
// Tony links a lead to the Zoho estimate he made (by its number). Every 15 minutes the receiver reads that
// estimate's status from Zoho and moves the lead: sent -> estimate_sent, accepted/invoiced -> booked,
// declined -> lost. An expired estimate stays open and shows up in "Needs action".
// This module only ever sends GET requests to Zoho, and the OAuth token should carry only the
// estimates READ scope, so it cannot create, send or change anything in Zoho.

const DC = {com: 'com', eu: 'eu', in: 'in', au: 'com.au', jp: 'jp', ca: 'zohocloud.ca', sa: 'sa'};
const PRODUCTS = {invoice: 'invoice/v3', books: 'books/v3'};
export const ZOHO_STATUSES = ['draft', 'sent', 'accepted', 'invoiced', 'declined', 'expired'];
// Statuses that cannot change again in a way that moves the lead.
const SETTLED = ['invoiced', 'declined'];
const STOP_POLLING_DAYS = 60;
const fail = (status, message) => Object.assign(new Error(message), {status});

export function zohoConfigFromEnv(env = process.env) {
  const keys = ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN', 'ZOHO_ORG_ID'];
  const present = keys.filter(key => env[key]);
  if (!present.length) return {config: null, problem: null};
  if (present.length < keys.length) return {config: null, problem: 'missing ' + keys.filter(key => !env[key]).join(', ')};
  const product = (env.ZOHO_PRODUCT || 'invoice').toLowerCase(), dc = (env.ZOHO_DC || 'com').toLowerCase();
  if (!PRODUCTS[product]) return {config: null, problem: 'ZOHO_PRODUCT must be invoice or books'};
  if (!DC[dc]) return {config: null, problem: 'ZOHO_DC must be one of ' + Object.keys(DC).join(', ')};
  if (!/^\d{5,20}$/.test(env.ZOHO_ORG_ID)) return {config: null, problem: 'ZOHO_ORG_ID must be the numeric organization ID'};
  return {config: {clientId: env.ZOHO_CLIENT_ID, clientSecret: env.ZOHO_CLIENT_SECRET, refreshToken: env.ZOHO_REFRESH_TOKEN, orgId: env.ZOHO_ORG_ID, product, dc}, problem: null};
}

// Read-only Zoho Invoice / Books estimates client: OAuth refresh plus two GET calls.
export function createZohoReader({clientId, clientSecret, refreshToken, orgId, product = 'invoice', dc = 'com', fetch: doFetch = fetch, now = Date.now}) {
  const accounts = `https://accounts.zoho.${DC[dc]}/oauth/v2/token`, api = `https://www.zohoapis.${DC[dc]}/${PRODUCTS[product]}`;
  let token = null, expires = 0;
  async function call(url, init) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try { return await doFetch(url, {...init, signal: controller.signal}); }
    catch { throw fail(503, 'Zoho could not be reached.'); }
    finally { clearTimeout(timer); }
  }
  async function accessToken() {
    if (token && now() < expires - 60000) return token;
    const response = await call(accounts, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token'}).toString()});
    const out = await response.json().catch(() => ({}));
    if (!response.ok || !out.access_token) throw fail(502, 'Zoho sign-in failed. Check the Zoho refresh token on this computer.');
    token = out.access_token; expires = now() + (Number(out.expires_in) || 3600) * 1000;
    return token;
  }
  async function get(pathAndQuery) {
    const separator = pathAndQuery.includes('?') ? '&' : '?';
    const response = await call(`${api}${pathAndQuery}${separator}organization_id=${encodeURIComponent(orgId)}`, {method: 'GET', headers: {Authorization: 'Zoho-oauthtoken ' + await accessToken()}});
    if (response.status === 401) token = null;
    if (response.status === 429) throw fail(429, 'Zoho rate limit reached; will try again later.');
    const out = await response.json().catch(() => ({}));
    if (response.status === 404) return null;
    if (!response.ok || out.code !== 0) throw fail(502, 'Zoho returned an error' + (out.message ? ': ' + String(out.message).slice(0, 120) : '.'));
    return out;
  }
  const shape = e => e && {id: String(e.estimate_id), number: String(e.estimate_number || ''), status: String(e.status || '').toLowerCase(),
    total: Number.isFinite(Number(e.total)) ? Number(e.total) : null, customer: String(e.customer_name || '').slice(0, 120), date: /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : null};
  return {
    async findByNumber(number) {
      const out = await get('/estimates?estimate_number=' + encodeURIComponent(number));
      const match = (out?.estimates || []).filter(e => String(e.estimate_number).toLowerCase() === number.toLowerCase());
      return match.length === 1 ? shape(match[0]) : null;
    },
    async getEstimate(id) { const out = await get('/estimates/' + encodeURIComponent(id)); return shape(out?.estimate); },
  };
}

export function createZohoEstimateSync(db, {reader = null, desk, now = Date.now, intervalMs = 15 * 60000} = {}) {
  const stamp = () => new Date(now()).toISOString();
  const inspect = id => db.prepare('SELECT estimate_number number,status,total,customer_name customer,checked_at,last_error FROM zoho_estimates WHERE lead_id=?').get(id) || null;

  function apply(id, estimate, {linking = false} = {}) {
    // An estimate linked after it was already sent counts from its Zoho date, not from when it was linked.
    const at = linking && estimate.date ? `${estimate.date}T16:00:00.000Z` : stamp();
    return desk.advanceFromZoho(id, {status: estimate.status, total: estimate.total, number: estimate.number, at});
  }

  async function link(id, rawNumber) {
    if (!reader) throw fail(503, 'Zoho is not connected on this computer yet.');
    const number = String(rawNumber ?? '').trim();
    if (!db.prepare('SELECT 1 FROM leads WHERE id=?').get(id)) throw fail(404, 'Lead not found.');
    if (!number) { db.prepare('DELETE FROM zoho_estimates WHERE lead_id=?').run(id); return {ok: true, unlinked: true}; }
    if (!/^[\w.\/-]{1,40}$/.test(number)) throw fail(400, 'Enter the estimate number as it appears in Zoho, for example EST-000123.');
    const estimate = await reader.findByNumber(number);
    if (!estimate) throw fail(404, `No Zoho estimate numbered ${number} was found.`);
    const other = db.prepare('SELECT lead_id FROM zoho_estimates WHERE estimate_id=? AND lead_id<>?').get(estimate.id, id);
    if (other) throw fail(409, `Estimate ${estimate.number} is already linked to another request.`);
    db.prepare(`INSERT INTO zoho_estimates(lead_id,estimate_id,estimate_number,status,total,customer_name,linked_at,checked_at,last_error) VALUES(?,?,?,?,?,?,?,?,NULL)
      ON CONFLICT(lead_id) DO UPDATE SET estimate_id=excluded.estimate_id,estimate_number=excluded.estimate_number,status=excluded.status,total=excluded.total,
      customer_name=excluded.customer_name,linked_at=excluded.linked_at,checked_at=excluded.checked_at,last_error=NULL`)
      .run(id, estimate.id, estimate.number, estimate.status, estimate.total, estimate.customer, stamp(), stamp());
    const moved = apply(id, estimate, {linking: true});
    return {ok: true, estimate: inspect(id), stage: moved.stage};
  }

  let running = null;
  async function tick() {
    if (!reader) return {checked: 0};
    if (running) return running;
    running = (async () => {
      const cutoff = new Date(now() - STOP_POLLING_DAYS * 86400000).toISOString();
      const rows = db.prepare(`SELECT z.lead_id, z.estimate_id, z.status FROM zoho_estimates z JOIN lead_pipeline p ON p.lead_id=z.lead_id
        WHERE p.stage NOT IN ('won','spam') AND z.status NOT IN (${SETTLED.map(() => '?').join(',')}) AND z.linked_at>=? ORDER BY z.checked_at`).all(...SETTLED, cutoff);
      let checked = 0;
      for (const row of rows) {
        try {
          const estimate = await reader.getEstimate(row.estimate_id);
          if (!estimate) { db.prepare("UPDATE zoho_estimates SET checked_at=?,last_error='not_found' WHERE lead_id=?").run(stamp(), row.lead_id); continue; }
          db.prepare('UPDATE zoho_estimates SET status=?,total=?,checked_at=?,last_error=NULL WHERE lead_id=?').run(estimate.status, estimate.total, stamp(), row.lead_id);
          if (estimate.status !== row.status) apply(row.lead_id, estimate);
          checked++;
        } catch (err) {
          db.prepare('UPDATE zoho_estimates SET checked_at=?,last_error=? WHERE lead_id=?').run(stamp(), String(err.message).slice(0, 200), row.lead_id);
          if (err.status === 429 || err.status === 502 && /sign-in/.test(err.message)) break;
        }
      }
      return {checked};
    })();
    try { return await running; } finally { running = null; }
  }

  let timer = null;
  return {
    enabled: Boolean(reader), link, tick, inspect,
    start() { if (reader && !timer) { timer = setInterval(() => { tick().catch(() => {}); }, intervalMs); timer.unref(); tick().catch(() => {}); } },
    close() { clearInterval(timer); timer = null; },
  };
}
