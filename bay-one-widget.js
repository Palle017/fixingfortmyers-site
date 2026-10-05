/* Public Bay One assistant. No shop-admin credentials or browser-side price calculations. */
(() => {
  'use strict';
  const config = window.PT_BAYONE_CONFIG || {};
  // Fail closed: no interface, assets or requests without explicit activation.
  if (config.enabled !== true) return;
  if (document.getElementById('bay-one-widget')) return;
  const script = document.currentScript;
  const apiBase = String(config.endpoint || window.PT_CONTACT_CONFIG?.endpoint || '').replace(/\/$/, '');
  if (!apiBase) return;
  // Notes carried from Bay One on another page are restored even if the server is now unreachable.
  const handoffKey = 'pt-bayone-service-draft-v1';
  function prefillService(summary, service, fields = {}) {
    const details = document.getElementById('request-details');
    if (!details) return false;
    const existing = details.value.trim();
    if (!existing.includes(summary)) {
      details.value = [existing, summary].filter(Boolean).join('\n\n');
      details.dispatchEvent(new Event('input', {bubbles:true}));
    }
    window.PT_REPAIR_CONTEXT?.applyService(service);
    for (const [name,limit] of [['vehicle',160],['city',100],['starts',7],['stranded',7]]) {
      const field = document.getElementById('request-'+name), value = fields[name];
      if (!field || field.dataset.userEdited === 'true' || typeof value !== 'string' || value.length > limit) continue;
      if (['starts','stranded'].includes(name) && !['yes','no','unknown'].includes(value)) continue;
      if (field.value && field.value !== 'unknown') continue;
      field.value = value; field.dispatchEvent(new Event('input',{bubbles:true}));
    }
    const instructions = document.getElementById('request-instructions');
    if (instructions) instructions.textContent = 'Review your Bay One notes below, add your name and callback number, and submit when ready. You can edit any detail. Nothing has been sent to Tony yet.';
    if (details.value.length > details.maxLength) {
      const note = document.getElementById('request-status');
      details.setCustomValidity('Your notes are preserved, but are longer than this form accepts. Please shorten them before sending.');
      if (note) note.textContent = 'All your notes are preserved below. This conversation is longer than the form accepts; review it and shorten the notes before sending.';
    }
    return true;
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem(handoffKey) || 'null');
    if (saved && Date.now() - saved.at < 30*60*1000 && typeof saved.summary === 'string' && prefillService(saved.summary,saved.service,saved.intake || {})) sessionStorage.removeItem(handoffKey);
  } catch (_) { /* An explicit service handoff still works without storage. */ }

  // Only offer Bay One when its server answers; otherwise the page keeps its call, text and form options.
  const controller = new AbortController(), healthTimer = setTimeout(() => controller.abort(), 6000);
  fetch(apiBase+'/healthz', { credentials:'omit', cache:'no-store', signal:controller.signal })
    .then(response => response.ok ? response.json() : null)
    .then(health => { if (health?.ok === true && health.chat !== 'unavailable' && !document.getElementById('bay-one-widget')) mount(health.media === 'ready'); })
    .catch(() => { /* Unreachable: leave the page's normal contact options as they are. */ })
    .finally(() => clearTimeout(healthTimer));

  function mount(mediaReady = false) {
    const customAvatar = config.avatar || script?.dataset.avatar;
    const avatarUrl = customAvatar || '/assets/bay-one-character-states-20260908.jpg';
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = new URL('bay-one-widget.css?v=20261001-workshop', script?.src || location.href).href;
    document.head.append(css);
    const widget = document.createElement('aside'); widget.id = 'bay-one-widget'; widget.className = 'b1-widget';
    widget.setAttribute('aria-label', 'Bay One repair assistant');
    const portrait = `<span class="b1-avatar${customAvatar ? '' : ' b1-avatar-sheet'}" aria-hidden="true"><span class="b1-monogram">B1</span></span>`;
    widget.innerHTML = `
      <button class="b1-launcher" type="button" aria-label="Ask Bay One, the AI repair assistant" aria-expanded="false" aria-controls="b1-panel">
        ${portrait}<span class="b1-launcher-copy"><small><i class="b1-dot"></i> Here to help</small><strong><img class="b1-logo" src="/assets/bay-one-b1-logo-20260908.jpg" alt="" width="438" height="329">Ask Bay One</strong><span>Describe your problem · Reach Tony</span></span>
      </button>
      <section class="b1-panel" id="b1-panel" role="dialog" aria-label="Chat with Bay One" hidden>
        <header class="b1-header">${portrait}<div class="b1-brand"><h2 class="b1-title"><img class="b1-wordmark" src="/assets/bay-one-wordmark-20260908.jpg" alt="Bay One AI" width="1280" height="960"></h2><p class="b1-subtitle">Tony’s automated repair intake</p></div><button class="b1-close" type="button" aria-label="Close Bay One chat">×</button></header>
        <div class="b1-allowance">A few quick questions · Your details go straight to Tony</div>
        <div class="b1-messages" role="log" aria-label="Conversation with Bay One" aria-live="polite" aria-relevant="additions text"></div>
        <div class="b1-suggestions"><button type="button" data-b1-suggestion="question">Describe the problem</button></div>
        <form class="b1-composer">
          <button class="b1-send-now" type="button" hidden>Ready? Send this to Tony</button>
          <label class="b1-field-label" for="b1-message">What is happening with your vehicle?</label>
          <div class="b1-input-row"><textarea id="b1-message" rows="2" maxlength="1600" placeholder="Describe the problem. Partial vehicle details are okay." required></textarea><button class="b1-send" type="submit" aria-label="Send message to Bay One"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 7-7 7 7M12 5v14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
          <div class="b1-status" role="status" aria-live="polite"></div>
        </form>
        <footer class="b1-footer"><span><a href="/privacy-policy.html">Chat privacy</a> · <a href="tel:+12393972048">Call Tony</a></span><a class="b1-contact" href="/#contact">Use the repair form ↗</a></footer>
      </section>`;
    document.body.append(widget);
    const $ = selector => widget.querySelector(selector);
    const launcher = $('.b1-launcher'), panel = $('.b1-panel'), input = $('#b1-message');
    const messages = $('.b1-messages'), status = $('.b1-status');
    const sendButton = $('.b1-send');
    let opener = launcher;
    const entryButtons = [launcher];
    const storageKey = 'pt-bayone-visitor-v1';
    const state = { token: '', sessionReady: false, sessionPromise: null, busy: false, mode: 'chat', failed: null, customerMessages:[], intake:{} };
    try { state.token = localStorage.getItem(storageKey) || ''; } catch (_) { /* The server also enforces the allowance by network. */ }
    const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const n = crypto.getRandomValues(new Uint8Array(1))[0] & 15; return (c === 'x' ? n : ((n & 3) | 8)).toString(16); });

    if (avatarUrl) widget.querySelectorAll('.b1-avatar').forEach(container => {
      const img = document.createElement('img'); img.src = avatarUrl; img.alt = ''; img.decoding = 'async';
      img.addEventListener('load', () => container.classList.add('has-image'));
      img.addEventListener('error', () => img.remove()); container.append(img);
    });

    function handoff(event) {
      const notes = [...state.customerMessages];
      const unsent = input.value.trim();
      if (unsent && notes.at(-1) !== unsent) notes.push(unsent);
      const summary = notes.length ? `Customer notes from Bay One:\n${notes.join('\n\n')}` : '';
      const service = window.PT_REPAIR_CONTEXT?.service || '';
      const samePage = summary && prefillService(summary,service,state.intake);
      close();
      if (samePage) { event.preventDefault(); location.hash = 'contact'; document.getElementById('bookingForm').scrollIntoView({behavior:'auto',block:'start'}); document.getElementById('request-name')?.focus({preventScroll:true}); }
      else if (summary) { try { sessionStorage.setItem(handoffKey,JSON.stringify({at:Date.now(),summary,service,intake:state.intake})); } catch (_) { status.textContent = 'Your browser could not carry the notes to the form. Copy the important details before switching.'; event.preventDefault(); open(); } }
    }

    function addMessage(speaker, text) {
      const row = document.createElement('div'); row.className = `b1-message b1-${speaker}`;
      const label = document.createElement('span'); label.className = 'b1-message-label'; label.textContent = speaker === 'user' ? 'YOU' : 'BAY ONE';
      const body = document.createElement('p'); body.textContent = String(text || '').slice(0, 20000);
      row.append(label, body);
      messages.append(row); messages.scrollTop = messages.scrollHeight;
      return row;
    }

    async function request(path, body) {
      if (!apiBase) throw new Error('Bay One’s connection is not configured. You can still contact the shop.');
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 35000);
      try {
        const response = await fetch(apiBase+path, { method:'POST', credentials:'omit', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:controller.signal });
        let data;
        try { data = await response.json(); } catch (_) { throw new Error(path === '/chat/session' ? 'Bay One could not connect. You can still use the repair form or call the shop.' : 'Bay One’s reply could not be confirmed. Your message is still here.'); }
        if (!response.ok || data.ok !== true) {
          const error = new Error(String(data.error || 'Bay One is unavailable at the moment. Please try again or contact the shop.'));
          error.code = data.code; error.usage = data.usage; error.retryAfter = data.retry_after; throw error;
        }
        return data;
      } catch (error) {
        if (error.name === 'AbortError') throw new Error(path === '/chat/session' ? 'Bay One could not connect in time. Try again, use the repair form or call the shop.' : 'Bay One took too long to reply. Send again to retry the same request, or contact the shop.');
        if (error instanceof TypeError) throw new Error(path === '/chat/session' ? 'Bay One could not connect. You can still use the repair form or call the shop.' : 'The connection dropped. Your message is preserved. Send again to retry, or contact the shop.');
        throw error;
      } finally { clearTimeout(timer); }
    }

    async function session() {
      if (state.sessionReady) return;
      if (state.sessionPromise) return state.sessionPromise;
      state.sessionPromise = request('/chat/session', { visitor_token:state.token || undefined }).then(result => {
        if (typeof result.visitor_token !== 'string' || !result.visitor_token) throw new Error('Bay One could not start this conversation. Please try again.');
        state.token = result.visitor_token; state.sessionReady = true;
        try { localStorage.setItem(storageKey, state.token); } catch (_) { /* Continue with the current tab’s token. */ }
      }).finally(() => { state.sessionPromise = null; });
      return state.sessionPromise;
    }

    function busy(value) {
      state.busy = value; input.disabled = value; sendButton.disabled = value;
      widget.dataset.avatarState = value ? 'thinking' : 'idle';
      sendButton.setAttribute('aria-label', value ? 'Waiting for Bay One' : 'Send message to Bay One');
    }

    function open(event) {
      opener = event?.currentTarget instanceof HTMLElement ? event.currentTarget : document.activeElement;
      panel.hidden = false; launcher.hidden = true; launcher.setAttribute('aria-expanded','true');
      entryButtons.forEach(button => button.setAttribute('aria-expanded','true'));
      $('.b1-close').focus({preventScroll:true}); viewport();
      if (!state.sessionReady) { status.textContent = 'Connecting to Bay One…'; session().then(() => { if (!state.busy) status.textContent = ''; }).catch(error => { status.textContent = error.message; }); }
    }
    function close() { panel.hidden = true; launcher.hidden = false; entryButtons.forEach(button => button.setAttribute('aria-expanded','false')); (opener?.isConnected ? opener : launcher).focus({preventScroll:true}); viewport(); }
    launcher.addEventListener('click', open); $('.b1-close').addEventListener('click', close);
    // Auto-opening is opt-in; the short repair form is the main contact path.
    $('.b1-close').addEventListener('click', () => { try { sessionStorage.setItem('pt-bayone-closed', '1'); } catch (_) { /* reopening is harmless */ } });
    let closedThisVisit = false;
    try { closedThisVisit = sessionStorage.getItem('pt-bayone-closed') === '1'; } catch (_) { /* treat as not closed */ }
    if (!closedThisVisit && config.autoOpen === true) setTimeout(() => { if (panel.hidden) open(); }, 800);
    $('.b1-contact').addEventListener('click',event => handoff(event));
    const formLauncher = document.getElementById('request-bay-one');
    if (formLauncher) { formLauncher.hidden = false; formLauncher.setAttribute('aria-controls','b1-panel'); formLauncher.setAttribute('aria-expanded','false'); entryButtons.push(formLauncher); formLauncher.addEventListener('click',open); }
    const contactBar = document.querySelector('.mobile-contact-bar');
    if (contactBar) widget.classList.add('b1-has-contact-bar');
    widget.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(); } });
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('.b1-composer').requestSubmit(); } });
    widget.querySelectorAll('[data-b1-suggestion]').forEach(button => button.addEventListener('click', () => input.focus()));

    $('.b1-composer').addEventListener('submit', async event => {
      event.preventDefault(); if (state.busy) return;
      if (pendingLead) { status.textContent = 'Retry the pending repair request below to confirm receipt before changing these details.'; return; }
      const text = input.value.trim(); if (!text) return;
      const retry = state.failed && state.failed.message === text && state.failed.mode === state.mode;
      const pending = retry ? state.failed : { request_id:uuid(), message:text, mode:state.mode };
      if (!retry) { addMessage('user',text); state.customerMessages.push(text); }
      $('.b1-contact').textContent = 'Review details for Tony ↗';
      $('.b1-suggestions').hidden = true; busy(true); status.textContent = 'Bay One is replying…';
      const slow = setTimeout(() => { if (state.busy) status.textContent = 'Still working on it. Thanks for waiting…'; }, 8000);
      try {
        await session();
        const result = await request('/chat/message', { ...pending, visitor_token:state.token });
        if (typeof result.reply !== 'string' || !result.reply.trim()) throw new Error('Bay One’s reply was empty. Your message is preserved; send again to retry.');
        if (result.intake && typeof result.intake === 'object') {
          for (const [name,limit] of [['vehicle',160],['city',100],['starts',7],['stranded',7]]) {
            const value = result.intake[name];
            if (typeof value !== 'string' || value.length > limit || (['starts','stranded'].includes(name) && !['yes','no','unknown'].includes(value))) continue;
            state.intake[name] = value;
          }
        }
        addMessage('assistant',result.reply); offerSend(true); state.failed = null; input.value = ''; status.textContent = '';
      } catch (error) {
        state.failed = !error.code || error.code === 'request_pending' ? pending : null;
        if (error.code === 'invalid_session') {
          state.sessionReady = false; state.token = '';
          try { localStorage.removeItem(storageKey); } catch (_) { /* The next request will still create a fresh session. */ }
        }
        status.textContent = error.message;
        if (error.code === 'rate_limit' && error.retryAfter) status.textContent += ` Try again in about ${Math.ceil(Number(error.retryAfter))} seconds.`;
      } finally {
        clearTimeout(slow); busy(false); if (!panel.hidden && matchMedia('(pointer:fine)').matches) input.focus({preventScroll:true});
      }
    });


    // Contact card: the customer's name and number go with the chat straight to Tony's lead inbox.
    // The exact words beside the checkbox are what gets stored as consent evidence (same text as the site form).
    const CONSENT = 'Yes, I agree to receive text messages from Perfect Timing Auto Repair LLC at the number provided about my inquiry, estimates, scheduling, and service updates. Optional; consent is not a condition of purchase. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.';
    const choice = (name, label) => `<label>${label}<select name="${name}"><option value="unknown">Not sure</option><option value="yes">Yes</option><option value="no">No</option></select></label>`;
    const sendNow = $('.b1-send-now');
    const leadForm = document.createElement('form'); leadForm.className = 'b1-lead'; leadForm.noValidate = false;
    leadForm.innerHTML = `
      <p class="b1-lead-title">Send this to Tony</p>
      <label>First name<input name="name" autocomplete="given-name" maxlength="100" required></label>
      <label>Mobile number<input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="40" required></label>
      <label>Your city or ZIP<input name="city" autocomplete="address-level2" maxlength="100" placeholder="e.g. Fort Myers or 33901" required></label>
      <label>Best time to reach you or anything else <small>(optional)</small><input name="callbackTime" maxlength="160"></label>
      ${choice('starts', 'Does the vehicle start?')}
      ${choice('stranded', 'Are you stranded right now?')}
      <label class="b1-lead-media"${mediaReady ? '' : ' hidden'}>Add photos or a short video <small>(optional, up to 6)</small><input type="file" name="media" accept="image/*,video/*" multiple></label>
      <label class="b1-lead-check"><input type="checkbox" name="sms"> <span>${CONSENT} <a href="/sms-terms">SMS terms</a> · <a href="/privacy-policy">Privacy policy</a>.</span></label>
      <button type="submit">Send to Tony</button>
      <p class="b1-lead-status" role="status" aria-live="polite"></p>`;
    const leadStatus = leadForm.querySelector('.b1-lead-status');
    // Photos and short videos go up after the request is saved, so a slow upload never loses the lead.
    const MEDIA = {image:15*1024*1024, video:100*1024*1024, files:6};
    const EXT_TYPES = {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif',mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm'};
    const OK_TYPES = new Set(Object.values(EXT_TYPES));
    const mediaInput = leadForm.querySelector('[name=media]');
    const typeOf = file => { const type = (file.type || '').toLowerCase(); return OK_TYPES.has(type) ? type : EXT_TYPES[(file.name.split('.').pop() || '').toLowerCase()] || type; };
    function pickMedia() {
      const picked = [...(mediaInput?.files || [])], keep = [], skipped = [];
      for (const file of picked) {
        const type = typeOf(file), video = type.startsWith('video/');
        if (!OK_TYPES.has(type)) skipped.push(`${file.name} (use JPG, PNG, HEIC, MP4 or MOV)`);
        else if (!video && file.size > MEDIA.image && !/jpeg|png|webp/.test(type)) skipped.push(`${file.name} (photos up to 15 MB)`);
        else if (video && file.size > MEDIA.video) skipped.push(`${file.name} (videos up to 100 MB, about 30 seconds)`);
        else if (keep.length >= MEDIA.files) skipped.push(`${file.name} (6 files max)`);
        else keep.push({file, type});
      }
      return {keep, skipped};
    }
    mediaInput?.addEventListener('change', () => {
      const {keep, skipped} = pickMedia();
      leadStatus.textContent = (keep.length ? `${keep.length} file${keep.length > 1 ? 's' : ''} will go to Tony with your request.` : '') + (skipped.length ? ` Not added: ${skipped.join(', ')}.` : '');
    });
    // Large phone photos are resized before upload: much faster on mobile data, still plenty for Tony.
    async function shrink(item) {
      if (!/^image\/(jpeg|png|webp)$/.test(item.type) || item.file.size < 2.5*1024*1024 || !window.createImageBitmap) return item;
      try {
        const bitmap = await createImageBitmap(item.file), scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width*scale); canvas.height = Math.round(bitmap.height*scale);
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close?.();
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
        return blob && blob.size < item.file.size ? {file: blob, type: 'image/jpeg'} : item;
      } catch (_) { return item.file.size <= MEDIA.image ? item : null; }
    }
    async function uploadMedia(result, items) {
      if (!items.length) return;
      const row = addMessage('assistant', `Sending ${items.length} photo/video file${items.length > 1 ? 's' : ''} to Tony…`), text = row.querySelector('p');
      if (!result.mediaToken) { text.textContent = 'Your request is saved, but photos could not be attached right now. Text them to Tony at (239) 397-2048.'; return; }
      let sent = 0; const failed = [];
      for (const [n, original] of items.entries()) {
        text.textContent = `Sending file ${n + 1} of ${items.length} to Tony… keep this page open.`;
        const item = await shrink(original);
        if (!item || (item.type.startsWith('image/') && item.file.size > MEDIA.image)) { failed.push(original.file.name + ' (too large)'); continue; }
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 300000);
        try {
          const response = await fetch(`${apiBase}/hooks/lead/media/${result.id}`, {method:'POST', credentials:'omit', headers:{'Content-Type':item.type, 'X-Media-Token':result.mediaToken}, body:item.file, signal:controller.signal});
          const reply = await response.json().catch(() => ({}));
          if (!response.ok || reply.received !== true) throw new Error(reply.error || 'not saved');
          sent++;
        } catch (error) { failed.push(original.file.name + (error.name === 'AbortError' ? ' (timed out)' : '')); }
        finally { clearTimeout(timer); }
      }
      text.textContent = (sent ? `Tony has your ${sent} file${sent > 1 ? 's' : ''}.` : '') + (failed.length ? ` ${failed.length} did not go through (${failed.join(', ')}). You can text ${failed.length > 1 ? 'them' : 'it'} to Tony at (239) 397-2048.` : '');
    }
    let leadKey = uuid(), leadBusy = false, leadSent = false, pendingLead = null;
    leadForm.addEventListener('input', () => { if (!leadBusy && !pendingLead) leadKey = uuid(); });
    function lockLeadFields(locked) { leadForm.querySelectorAll('input,select').forEach(field => { field.disabled = locked; }); }
    function showLead() {
      if (leadSent) return;
      if (!leadForm.isConnected) {
        for (const name of ['starts', 'stranded']) leadForm.querySelector(`[name=${name}]`).value = ['yes', 'no'].includes(state.intake[name]) ? state.intake[name] : 'unknown';
        if (state.intake.city) leadForm.querySelector('[name=city]').value = String(state.intake.city).slice(0, 100);
      }
      sendNow.hidden = true; messages.append(leadForm); messages.scrollTop = messages.scrollHeight;
      leadForm.querySelector('[name=name]').focus({preventScroll:true});
    }
    // The card appears after the first message; later chat answers still fill the urgency boxes the customer has not touched.
    for (const name of ['starts', 'stranded']) leadForm.querySelector(`[name=${name}]`).addEventListener('change', event => { event.target.dataset.touched = '1'; });
    function offerSend(ready) {
      if (leadForm.isConnected && !leadSent) for (const name of ['starts', 'stranded']) { const field = leadForm.querySelector(`[name=${name}]`); if (!field.dataset.touched && ['yes', 'no'].includes(state.intake[name])) field.value = state.intake[name]; }
      if (leadSent || leadForm.isConnected) return;
      if (ready) showLead(); else if (state.customerMessages.length) sendNow.hidden = false;
    }
    sendNow.addEventListener('click', showLead);
    leadForm.addEventListener('submit', async event => {
      event.preventDefault(); if (leadBusy || leadSent) return;
      const retryingPending = !!pendingLead;
      if (!pendingLead) {
        const data = new FormData(leadForm), sms = data.get('sms') === 'on';
        const body = {
        name:String(data.get('name') || '').trim(), phone:String(data.get('phone') || '').replace(/[^\d+()\s.-]/g, '').trim(), ...(window.PT_LEAD_CHANNEL ? {channel: window.PT_LEAD_CHANNEL} : {}),
        vehicle:String(state.intake.vehicle || '').slice(0,160), service:String(window.PT_REPAIR_CONTEXT?.service || '').slice(0,160),
        details:('Bay One chat on '+location.pathname+':\n'+state.customerMessages.join('\n')).slice(0,6000),
        city:String(data.get('city') || state.intake.city || '').trim().slice(0,100), starts:String(data.get('starts') || 'unknown'), stranded:String(data.get('stranded') || 'unknown'),
        callbackTime:String(data.get('callbackTime') || '').trim().slice(0,160), source:'ai', website:'',
        smsConsent:sms, smsConsentTimestamp:sms ? new Date().toISOString() : '', smsConsentVersion:'2026-09-06-v1',
        smsConsentSource:'bay-one-chat', smsConsentPage:location.origin+location.pathname, smsConsentDisclosure:sms ? CONSENT : '',
        };
        // Keep the exact payload, including consent time, for an uncertain retry.
        pendingLead = {key:leadKey,body};
      }
      const {body} = pendingLead, sms = body.smsConsent;
      lockLeadFields(true);
      leadBusy = true; leadForm.querySelector('button').disabled = true; leadStatus.textContent = 'Sending to Tony…';
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(apiBase+'/hooks/lead/webform', { method:'POST', credentials:'omit', headers:{'Content-Type':'application/json','Idempotency-Key':pendingLead.key}, body:JSON.stringify(body), signal:controller.signal });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.received !== true) {
          // Validation/refusal confirms no save; allow corrections. A timeout, 5xx or
          // key conflict can be ambiguous, so preserve the snapshot and retry key.
          if (!retryingPending && [400,403,413,422,429].includes(response.status)) { pendingLead = null; leadKey = uuid(); lockLeadFields(false); }
          throw new Error(result.error || 'Receipt could not be confirmed.');
        }
        leadSent = true; leadForm.remove(); $('.b1-composer').hidden = true;
        const urgent = body.stranded === 'yes' && body.starts === 'no';
        const row = addMessage('assistant', `Your request is saved for Tony to review. Your callback number is ${body.phone}; ${sms ? 'text or call' : 'call only'}. Booking is not confirmed.` + (urgent ? ' You said you are stranded, so your request is marked urgent. If you are somewhere unsafe, call 911.' : ' Tony gives every price himself after he looks at the problem.'));
        const call = document.createElement('a'); call.className = 'b1-request-service'; call.href = 'tel:+12393972048'; call.textContent = urgent ? 'Call Tony now' : 'Call Tony';
        row.append(call);
        uploadMedia(result, mediaInput && !mediaInput.closest('label').hidden ? pickMedia().keep : []).catch(() => {});
        try { sessionStorage.setItem('pt-last-request', JSON.stringify({ id:result.id, receivedAt:result.receivedAt, confirmed:true, smsConsent:sms })); } catch (_) { /* Confirmation is already shown in the chat. */ }
      } catch (error) {
        leadStatus.textContent = (error.name === 'AbortError' ? 'Receipt could not be confirmed.' : error.message) + (pendingLead ? ' Retry to check the same request; its details are preserved.' : ' Correct your details and try again.') + ' You can also call or text Tony at (239) 397-2048.';
      } finally { clearTimeout(timer); leadBusy = false; if (!leadSent) leadForm.querySelector('button').disabled = false; }
    });

    function viewport() {
      const vv = window.visualViewport;
      widget.style.setProperty('--b1-viewport-height', `${vv?.height || window.innerHeight}px`);
      const mobile = matchMedia('(max-width:800px)').matches;
      const keyboard = vv ? Math.max(0, window.innerHeight-vv.height-vv.offsetTop) : 0;
      widget.style.bottom = keyboard > 120 && !panel.hidden ? `${keyboard+12}px` : '';
      if (mobile && keyboard > 120) panel.style.height = `${Math.max(180,vv.height-24)}px`; else panel.style.height = '';
    }
    window.addEventListener('resize', viewport, {passive:true}); window.visualViewport?.addEventListener('resize', viewport, {passive:true}); viewport();
    const contact = document.getElementById('bookingForm');
    if (contact && 'IntersectionObserver' in window) new IntersectionObserver(entries => widget.classList.toggle('b1-near-contact', entries[0].isIntersecting), {threshold:.05}).observe(contact);
    const easternHour = Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(new Date()));
    addMessage('assistant', (easternHour >= 20 || easternHour < 8 ? 'Hi, I’m Bay One. Tony is available around the clock and I help him overnight. ' : 'Hi, I’m Bay One, Tony’s repair assistant. ') + 'Tell me what’s going on and I’ll get the details straight to Tony so he can plan the job. What is happening with your vehicle?');
  }
})();
