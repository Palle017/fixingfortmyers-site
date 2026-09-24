let initial = true;
let known = new Set();
let loading = false;
let fingerprint = '';
const el = (tag, text, className) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; if (className) item.className = className; return item; };
const date = value => new Date(value).toLocaleString();
const operatorToken=el('input');operatorToken.type='password';operatorToken.autocomplete='off';operatorToken.placeholder='Operator token for alert recovery';operatorToken.setAttribute('aria-label','Operator token for alert recovery');operatorToken.maxLength=256;
document.querySelector('.actions').append(operatorToken);
async function alertAction(route,body={}){
  const response=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+operatorToken.value},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Alert action failed.');return result;
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
  header.append(title, select); card.append(header);
  const facts = el('div', undefined, 'facts');
  const digits = lead.phone.replace(/\D/g,'');
  const call = el('a', lead.phone); call.href = 'tel:+' + (digits.length === 10 ? '1' : '') + digits; facts.append(call);
  if (lead.vehicle) facts.append(el('span', lead.vehicle));
  if (lead.service) facts.append(el('span', lead.service));
  card.append(facts, el('p', lead.details || 'No written details supplied.', 'details'));
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
    const signature = data.leads.map(item => item.id + ':' + item.updated_at+':'+JSON.stringify(item.alerts||[])).join('|');
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
