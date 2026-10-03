let initial = true;
let known = new Set();
let loading = false;
let fingerprint = '';
let zohoEnabled = false;
const el = (tag, text, className) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; if (className) item.className = className; return item; };
const date = value => new Date(value).toLocaleString();
const operatorToken=el('input');operatorToken.type='password';operatorToken.autocomplete='off';operatorToken.placeholder='Operator token for alert recovery';operatorToken.setAttribute('aria-label','Operator token for alert recovery');operatorToken.maxLength=256;
document.querySelector('.actions').append(operatorToken);
async function alertAction(route,body={}){
  const response=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+operatorToken.value},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Alert action failed.');return result;
}
const dayKey = value => new Date(value).toLocaleDateString('en-CA');
function renderSummary(leads) {
  const box = document.getElementById('summary'), today = dayKey(Date.now()), weekAgo = Date.now() - 7 * 86400000;
  const tiles = [['New', leads.filter(l => l.status === 'new').length, 'accent'], ['Today', leads.filter(l => dayKey(l.received_at) === today).length], ['Last 7 days', leads.filter(l => Date.parse(l.received_at) >= weekAgo).length],
    ['Big jobs', leads.filter(l => l.bigJob).length, 'hot'], ['With photos', leads.filter(l => l.media?.length).length], ['Won', leads.filter(l => l.pipeline?.stage === 'won').length, 'good']];
  const grid = el('div', undefined, 'tiles');
  for (const [label, value, tone] of tiles) { const tile = el('div', undefined, 'tile' + (tone ? ' ' + tone : '')); tile.append(el('strong', String(value)), el('span', label)); grid.append(tile); }
  const days = [...Array(14)].map((_, i) => dayKey(Date.now() - (13 - i) * 86400000)), counts = days.map(d => leads.filter(l => dayKey(l.received_at) === d).length), max = Math.max(1, ...counts);
  const chart = el('div', undefined, 'chart'); chart.setAttribute('role', 'img'); chart.setAttribute('aria-label', 'Requests per day, last 14 days: ' + counts.join(', '));
  days.forEach((d, i) => { const col = el('div', undefined, 'bar'); const fill = el('i'); fill.style.height = Math.max(3, counts[i] / max * 100) + '%'; col.title = d + ': ' + counts[i]; col.append(el('b', counts[i] ? String(counts[i]) : ''), fill, el('span', d.slice(8))); chart.append(col); });
  const wrap = el('div', undefined, 'chart-wrap'); wrap.append(el('p', 'Requests per day · last 14 days', 'chart-title'), chart);
  box.replaceChildren(grid, wrap);
}
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
  const badges = el('div', undefined, 'badges');
  if (lead.routing?.priority === 'first') badges.append(el('span', 'URGENT', 'badge hot'));
  if (lead.bigJob) badges.append(el('span', 'BIG JOB', 'badge big'));
  if (lead.channel) badges.append(el('span', 'From ' + (lead.channel === 'google' ? 'Google' : lead.channel), 'badge'));
  if (lead.media?.length) badges.append(el('span', lead.media.length + ' photo/video', 'badge'));
  if (lead.pipeline?.stage && lead.pipeline.stage !== 'new') badges.append(el('span', lead.pipeline.stage.replaceAll('_', ' '), 'badge' + (lead.pipeline.stage === 'won' ? ' good' : '')));
  title.append(badges);
  header.append(title, select); card.append(header);
  const facts = el('div', undefined, 'facts');
  const digits = lead.phone.replace(/\D/g,'');
  const call = el('a', lead.phone); call.href = 'tel:+' + (digits.length === 10 ? '1' : '') + digits; facts.append(call);
  if (lead.vehicle) facts.append(el('span', lead.vehicle));
  if (lead.service) facts.append(el('span', lead.service));
  card.append(facts, el('p', lead.details || 'No written details supplied.', 'details'));
  const locationLine = (lead.details || '').match(/^Car location: (.+)$/m)?.[1];
  if (locationLine) {
    const location = el('div'); location.append(el('p', 'Car location: ' + locationLine, 'tag'));
    const mapQuery = (lead.details || '').match(/^Map: https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=([^\s]+)$/m)?.[1];
    if (mapQuery) { const map = el('a', 'Open car location in Maps'); map.href = 'https://www.google.com/maps/search/?api=1&query=' + mapQuery; map.target='_blank'; map.rel='noreferrer'; location.append(map); }
    card.append(location);
  }
  if(lead.routing){
    card.append(el('p',lead.routing.priority==='first'?'FIRST PRIORITY — stranded and no start, any hour':'Normal follow-up','tag'));
    if(lead.routing.needsReview)card.append(el('p','Urgency needs review: an answer is unknown. The inquiry is saved.','tag'));
    card.append(el('p','Starts: '+(lead.starts||'unknown')+' · Stranded: '+(lead.stranded||'unknown')+' · City/ZIP: '+(lead.city||'not provided'),'tag'));
  }
  for(const alert of lead.alerts||[]){
    const line=el('div');line.append(el('p',(alert.channel==='notify_call'?'Phone call':'Text alert')+': '+alert.state.replaceAll('_',' ')+(alert.last_error?' · '+alert.last_error.replaceAll('_',' '):''),'tag'));
    if(['disabled','pending','accepted','failed','suppressed'].includes(alert.state)){
      const retry=el('button',alert.state==='accepted'?'Check existing alert':'Retry alert');retry.addEventListener('click',async()=>{retry.disabled=true;try{await alertAction('/api/leads/'+lead.id+'/alerts/retry',{channel:alert.channel});await alertAction('/api/alerts/check');fingerprint='';await refresh();}catch(err){document.getElementById('status').textContent=err.message;}finally{retry.disabled=false;}});line.append(retry);
    }
    if(alert.state==='needs_review')line.append(el('p','Check the provider record before any new send. A prior attempt may have succeeded.','tag'));
    if(alert.state==='completed')line.append(el('p','Provider reports a completed phone connection; this does not prove Tony heard it.','tag'));
    card.append(line);
  }
  if (lead.requestId) { const related = el('a', 'View related repair request'); related.href = '#lead-' + lead.requestId; card.append(related); }
  if (lead.media?.length) {
    const gallery = el('div', undefined, 'media');
    for (const item of lead.media) {
      const src = '/api/leads/' + lead.id + '/media/' + item.idx, size = Math.max(1, Math.round(item.bytes / 1048576)) + ' MB';
      if (item.type.startsWith('video/')) { const video = el('video'); video.controls = true; video.preload = 'metadata'; video.src = src; video.setAttribute('aria-label', 'Customer video ' + item.idx); gallery.append(video); }
      else if (['image/heic', 'image/heif'].includes(item.type)) { const link = el('a', 'Open HEIC photo ' + item.idx + ' (' + size + ')'); link.href = src; link.target = '_blank'; gallery.append(link); }
      else { const link = el('a'); link.href = src; link.target = '_blank'; const img = el('img'); img.src = src; img.alt = 'Customer photo ' + item.idx; img.loading = 'lazy'; link.append(img); gallery.append(link); }
    }
    card.append(el('p', lead.media.length + ' photo/video attachment' + (lead.media.length > 1 ? 's' : ''), 'tag'), gallery);
  }
  if (lead.audio_bytes) { const audio = el('audio'); audio.controls = true; audio.preload = 'none'; audio.src = '/api/leads/' + lead.id + '/audio'; card.append(audio); }
  card.append(el('p', lead.smsConsent ? 'Customer opted in to service-related text follow-up.' : 'Call follow-up requested; no text permission selected.', 'tag'));
  if (!['won', 'lost', 'spam'].includes(lead.pipeline?.stage)) {
    const done = el('button', 'Job done · ask for a review', 'done'); done.type = 'button';
    done.addEventListener('click', async () => { done.disabled = true; try { const r = await fetch('/api/leads/' + lead.id + '/stage', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({stage:'won'})}); const out = await r.json(); if (!r.ok) throw Error(out.error || 'Not saved.'); document.getElementById('status').textContent = out.reviewQueued ? 'Marked won. A Google review request will be texted in 2 hours.' : 'Marked won. No review text queued (needs text permission, Twilio and GOOGLE_REVIEW_URL).'; fingerprint = ''; await refresh(); } catch (err) { document.getElementById('status').textContent = err.message; done.disabled = false; } });
    card.append(done);
  }
  if (lead.zohoEstimate) {
    const z = lead.zohoEstimate, label = {draft:'draft, not sent yet', sent:'sent, waiting on the customer', accepted:'accepted', invoiced:'invoiced', declined:'declined', expired:'expired, follow up'}[z.status] || z.status;
    card.append(el('p', 'Zoho estimate ' + z.number + ': ' + label + (z.total !== null ? ' · $' + z.total.toLocaleString() : '') + (z.last_error ? ' · last check failed: ' + z.last_error : ''), 'tag'));
  }
  if (zohoEnabled && !['won', 'spam'].includes(lead.pipeline?.stage)) {
    const form = el('form', undefined, 'zoho-link'), input = el('input'), button = el('button', lead.zohoEstimate ? 'Change estimate' : 'Link Zoho estimate');
    input.name = 'estimate'; input.maxLength = 40; input.placeholder = 'EST-000123'; input.value = lead.zohoEstimate?.number || ''; input.setAttribute('aria-label', 'Zoho estimate number for ' + (lead.name || lead.phone));
    button.type = 'submit';
    form.addEventListener('submit', async event => {
      event.preventDefault(); button.disabled = true;
      try { const r = await fetch('/api/leads/' + lead.id + '/zoho-estimate', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({estimateNumber:input.value})}); const out = await r.json(); if (!r.ok) throw Error(out.error || 'Not linked.'); document.getElementById('status').textContent = out.unlinked ? 'Zoho estimate unlinked.' : 'Linked Zoho estimate ' + out.estimate.number + ' (' + out.estimate.status + ').'; fingerprint = ''; await refresh(); }
      catch (err) { document.getElementById('status').textContent = err.message; button.disabled = false; }
    });
    form.append(input, button); card.append(form);
  }
  if (lead.reviewText) card.append(el('p', 'Review request text: ' + ({pending:'scheduled', sending:'sending', sent:'sent', failed:'rejected by the carrier', needs_review:'may not have gone out'}[lead.reviewText.state] || lead.reviewText.state), 'tag'));
  if (lead.customerText) card.append(el('p', 'Confirmation text to customer: ' + ({sent:'sent', pending:'sending', sending:'sending', skipped:'not sent (' + (lead.customerText.last_error === 'already_texted_today' ? 'already texted today' : 'daily limit') + ')', failed:'rejected by the carrier', needs_review:'may not have gone out; check Twilio before resending'}[lead.customerText.state] || lead.customerText.state), 'tag'));
  const detail = el('details'); detail.append(el('summary','Request and consent record'));
  detail.append(el('p','Request ID: ' + lead.id + '\nReceived: ' + date(lead.received_at) + '\nConsent recorded: ' + (lead.smsConsentTimestamp || 'Not selected') + '\nVersion: ' + lead.smsConsentVersion + '\nSource: ' + lead.smsConsentSource + '\nPage: ' + lead.smsConsentPage + '\nDisclosure: ' + lead.smsConsentDisclosure)); card.append(detail);
  return card;
}
async function refresh() {
  if (loading) return; loading = true;
  try {
    const r = await fetch('/api/leads', {cache:'no-store'}); if (!r.ok) throw new Error(); const data = await r.json(); zohoEnabled = Boolean(data.zohoEnabled);
    const fresh = data.leads.filter(item => !known.has(item.id));
    if (!initial && fresh.length && 'Notification' in window && Notification.permission === 'granted') new Notification('Perfect Timing: new website request', {body: fresh.length + ' new request(s). Open your website inbox to review them.'});
    known = new Set(data.leads.map(item => item.id)); initial = false;
    renderSummary(data.leads);
    const signature = data.leads.map(item => item.id + ':' + item.updated_at+':'+JSON.stringify(item.alerts||[])+':'+(item.media||[]).length+':'+(item.pipeline?.stage||'')+':'+(item.reviewText?.state||'')+':'+(item.zohoEstimate?.status||'')+(item.zohoEstimate?.last_error||'')).join('|');
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
