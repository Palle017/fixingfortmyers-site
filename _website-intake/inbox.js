let initial = true;
let known = new Set();
let loading = false;
let fingerprint = '';
const el = (tag, text, className) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; if (className) item.className = className; return item; };
const date = value => new Date(value).toLocaleString();
function render(lead) {
  const card = el('article', undefined, 'lead ' + lead.status);
  card.id = 'lead-' + lead.id;
  const header = el('header'), title = el('div');
  title.append(el('h2', lead.name || 'Voice message'), el('div', date(lead.received_at) + ' · ' + (lead.kind === 'voicenote' ? 'Recording' : 'Repair request'), 'meta'));
  const select = el('select'); select.setAttribute('aria-label', 'Status for ' + (lead.name || lead.phone));
  for (const [value, label] of [['new','New'],['contacted','Contacted'],['closed','Closed']]) { const option = el('option', label); option.value = value; select.append(option); }
  select.value = lead.status;
  select.addEventListener('change', async () => {
    select.disabled = true;
    try { const r = await fetch('/api/leads/' + lead.id + '/status', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:select.value})}); if (!r.ok) throw new Error(); fingerprint = ''; await refresh(); }
    catch { document.getElementById('status').textContent = 'Status was not saved. Please try again.'; select.value = lead.status; }
    finally { select.disabled = false; }
  });
  header.append(title, select); card.append(header);
  const facts = el('div', undefined, 'facts');
  const digits = lead.phone.replace(/\D/g,'');
  const call = el('a', lead.phone); call.href = 'tel:+' + (digits.length === 10 ? '1' : '') + digits; facts.append(call);
  if (lead.vehicle) facts.append(el('span', lead.vehicle));
  if (lead.service) facts.append(el('span', lead.service));
  card.append(facts, el('p', lead.details || 'No written details supplied.', 'details'));
  if (lead.requestId) { const related = el('a', 'View related repair request'); related.href = '#lead-' + lead.requestId; card.append(related); }
  if (lead.audio_bytes) { const audio = el('audio'); audio.controls = true; audio.preload = 'none'; audio.src = '/api/leads/' + lead.id + '/audio'; card.append(audio); }
  card.append(el('p', lead.smsConsent ? 'Customer opted in to service-related text follow-up.' : 'Call follow-up requested; no text permission selected.', 'tag'));
  const detail = el('details'); detail.append(el('summary','Request and consent record'));
  detail.append(el('p','Request ID: ' + lead.id + '\nReceived: ' + date(lead.received_at) + '\nConsent recorded: ' + (lead.smsConsentTimestamp || 'Not selected') + '\nVersion: ' + lead.smsConsentVersion + '\nSource: ' + lead.smsConsentSource + '\nPage: ' + lead.smsConsentPage + '\nDisclosure: ' + lead.smsConsentDisclosure)); card.append(detail);
  return card;
}
async function refresh() {
  if (loading) return; loading = true;
  try {
    const r = await fetch('/api/leads', {cache:'no-store'}); if (!r.ok) throw new Error(); const data = await r.json();
    const fresh = data.leads.filter(item => !known.has(item.id));
    if (!initial && fresh.length && 'Notification' in window && Notification.permission === 'granted') new Notification('Perfect Timing: new website request', {body: fresh.length + ' new request(s). Open your website inbox to review them.'});
    known = new Set(data.leads.map(item => item.id)); initial = false;
    const signature = data.leads.map(item => item.id + ':' + item.updated_at).join('|');
    if (signature !== fingerprint || !document.getElementById('leads').children.length) { const list = document.getElementById('leads'); list.replaceChildren(...(data.leads.length ? data.leads.map(render) : [el('div','No requests yet. New website messages will appear here automatically.','empty')])); fingerprint = signature; }
    const count = data.leads.filter(item => item.status === 'new').length;
    document.title = (count ? '(' + count + ') ' : '') + 'Website Requests · Perfect Timing';
    document.getElementById('count').textContent = count + ' new · ' + data.leads.length + ' latest requests';
    document.getElementById('status').textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch { document.getElementById('status').textContent = 'Inbox offline. Check that the Website Requests service is running.'; }
  finally { loading = false; }
}
document.getElementById('refresh').addEventListener('click', refresh);
document.getElementById('notify').addEventListener('click', async () => { const button = document.getElementById('notify'); if (!('Notification' in window)) { button.textContent = 'Desktop alerts unavailable'; return; } const permission = await Notification.requestPermission(); button.textContent = permission === 'granted' ? 'Alerts enabled while inbox is open' : 'Alerts not enabled'; });
refresh(); setInterval(refresh, 15000);
