/* Public Bay One assistant. No shop-admin credentials or browser-side price calculations. */
(() => {
  'use strict';
  const config = window.PT_BAYONE_CONFIG || {};
  // Fail closed: no interface, assets or requests without explicit activation.
  if (config.enabled !== true) return;
  if (document.getElementById('bay-one-widget')) return;
  const script = document.currentScript;
  const apiBase = String(config.endpoint || window.PT_CONTACT_CONFIG?.endpoint || '').replace(/\/$/, '');
  const leadBase = String(window.PT_CONTACT_CONFIG?.endpoint || apiBase).replace(/\/$/, '');
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
    for (const [name,limit] of [['vehicle',160],['city',100],['starts',7],['stranded',7],['name',100],['phone',30]]) {
      const field = document.getElementById('request-'+name), value = fields[name];
      if (!field || field.dataset.userEdited === 'true' || typeof value !== 'string' || value.length > limit) continue;
      if (['starts','stranded'].includes(name) && !['yes','no','unknown'].includes(value)) continue;
      if (field.value && field.value !== 'unknown') continue;
      field.value = value; field.dispatchEvent(new Event('input',{bubbles:true}));
    }
    const instructions = document.getElementById('request-instructions');
    if (instructions) instructions.textContent = 'Review your Bay One notes below, add your name and callback number, and submit when ready. You can edit any detail. Nothing has been sent to the shop yet.';
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

  // A small optional entry stays visible when the receiver is offline.
  // Connect only when opened; unavailable AI never looks like an answered chat.
  const markDown = () => { try { sessionStorage.setItem('pt-bayone-down',String(Date.now())); } catch (_) { /* Optional outage marker. */ } };
  mount();

  function mount(mediaReady = false) {
    const customAvatar = config.avatar || script?.dataset.avatar;
    const avatarUrl = customAvatar || '/assets/bay-one-character-states-20260908.jpg';
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = new URL('bay-one-widget.css?v=20261016-unified', script?.src || location.href).href;
    document.head.append(css);
    const widget = document.createElement('aside'); widget.id = 'bay-one-widget'; widget.className = 'b1-widget';
    widget.setAttribute('aria-label', 'Bay One repair assistant');
    const portrait = `<span class="b1-avatar${customAvatar ? '' : ' b1-avatar-sheet'}" aria-hidden="true"><span class="b1-monogram">B1</span></span>`;
    widget.innerHTML = `
      <button class="b1-launcher" type="button" aria-label="Ask Bay One, the AI repair assistant" aria-expanded="false" aria-controls="b1-panel">
        ${portrait}<span class="b1-launcher-copy"><small><i class="b1-dot"></i> AI assistant</small><strong><img class="b1-logo" data-b1-src="/assets/bay-one-b1-logo-20260908.jpg" alt="" width="438" height="329">Ask Bay One</strong><span>Questions · repair help</span></span>
      </button>
      <section class="b1-panel" id="b1-panel" role="dialog" aria-label="Chat with Bay One" hidden>
        <header class="b1-header">${portrait}<div class="b1-brand"><h2 class="b1-title"><img class="b1-wordmark" data-b1-src="/assets/bay-one-wordmark-20260908.jpg" alt="Bay One AI" width="1280" height="960"></h2><p class="b1-subtitle">Questions, rough estimates & repair help</p></div><button class="b1-close" type="button" aria-label="Close Bay One chat">×</button></header>
        <div class="b1-disclaimer">Ask questions and discuss repair costs naturally. Any price range is preliminary, not a written repair estimate or repair authorization.</div>
        <div class="b1-messages" role="log" aria-label="Conversation with Bay One" aria-live="polite" aria-relevant="additions text"></div>
        <form class="b1-composer">
          <button class="b1-send-now" type="button" hidden>Review and send to the shop</button>
          <label class="b1-field-label" for="b1-message">What do you need help with?</label>
          <div class="b1-input-row"><textarea id="b1-message" rows="2" maxlength="1600" placeholder="Describe a repair, ask a question, or ask what it might cost…" required></textarea><button class="b1-send" type="submit" aria-label="Send message to Bay One"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 7-7 7 7M12 5v14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
          <div class="b1-status" role="status" aria-live="polite"></div>
          <div class="b1-fallback" hidden><p>Bay One is unavailable right now. Your notes are kept, so review them with the repair form or call.</p><a class="b1-fallback-link b1-fallback-form" href="/#contact">Review with the repair form</a> <a class="b1-fallback-link" href="tel:+12393972048">Call (239) 397-2048</a></div>
        </form>
        <footer class="b1-footer"><span>Planning ranges only. The shop confirms scope and pricing before work begins. <a href="/privacy-policy">Chat privacy</a> · <a href="tel:+12393972048">Call — AI intake</a></span><a class="b1-contact" href="/#contact">Use the repair form ↗</a></footer>
      </section>`;
    document.body.append(widget);
    const $ = selector => widget.querySelector(selector);
    const launcher = $('.b1-launcher'), panel = $('.b1-panel'), input = $('#b1-message');
    const messages = $('.b1-messages'), status = $('.b1-status');
    const sendButton = $('.b1-send');
    let opener = launcher;
    const entryButtons = [launcher];
    const storageKey = 'pt-bayone-visitor-v1';
    const state = { token: '', sessionReady: false, sessionPromise: null, busy: false, failed: null, customerMessages:[], estimateSummaries:[], intake:{}, capabilities:null };
    try { state.token = localStorage.getItem(storageKey) || ''; } catch (_) { /* The server independently rate-limits chat requests. */ }
    const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const n = crypto.getRandomValues(new Uint8Array(1))[0] & 15; return (c === 'x' ? n : ((n & 3) | 8)).toString(16); });

    let artLoaded = false;
    function loadArtwork() {
      if (artLoaded) return; artLoaded = true; widget.classList.add('b1-art-loaded');
      widget.querySelectorAll('[data-b1-src]').forEach(img => { img.src = img.dataset.b1Src; img.decoding = 'async'; });
      if (avatarUrl) widget.querySelectorAll('.b1-avatar').forEach(container => {
        const img = document.createElement('img'); img.src = avatarUrl; img.alt = ''; img.decoding = 'async';
        img.addEventListener('load', () => container.classList.add('has-image'));
        img.addEventListener('error', () => img.remove()); container.append(img);
      });
    }

    function conversationNotes() {
      const notes = [...state.customerMessages,...state.estimateSummaries];
      const unsent = input.value.trim();
      if (unsent && !state.customerMessages.includes(unsent)) notes.push(unsent);
      return notes.join('\n\n');
    }

    function handoff(event) {
      if (pendingLead) { event.preventDefault(); status.textContent = 'Retry the pending repair request to confirm receipt before starting another request. Its details are preserved.'; return; }
      const card = widget.querySelector('.b1-lead'), typed = {};
      const notes = card ? card.querySelector('[name=details]').value.trim() : conversationNotes();
      const summary = notes ? `Customer notes from Bay One:\n${notes}` : '';
      const service = window.PT_REPAIR_CONTEXT?.service || '';
      for (const name of ['name','phone','city','vehicle','starts','stranded']) { const field = card?.querySelector(`[name=${name}]`); if (field) typed[name] = field.value.trim(); }
      const fields = {...state.intake, ...typed};
      const samePage = summary && prefillService(summary,service,fields);
      close();
      if (samePage) { event.preventDefault(); location.hash = 'contact'; document.getElementById('bookingForm').scrollIntoView({behavior:'auto',block:'start'}); document.getElementById('request-name')?.focus({preventScroll:true}); }
      else if (summary) { try { sessionStorage.setItem(handoffKey,JSON.stringify({at:Date.now(),summary,service,intake:fields})); } catch (_) { status.textContent = 'Your browser could not carry the notes to the form. Copy the important details before switching.'; event.preventDefault(); open(); } }
    }

    function addMessage(speaker, text, estimate) {
      const row = document.createElement('div'); row.className = `b1-message b1-${speaker}`;
      const label = document.createElement('span'); label.className = 'b1-message-label'; label.textContent = speaker === 'user' ? 'YOU' : 'BAY ONE';
      const body = document.createElement('p'); body.textContent = String(text || '').slice(0, 20000);
      row.append(label, body);
      if (estimate && Number.isFinite(estimate.low) && Number.isFinite(estimate.high) && estimate.low > 0 && estimate.high > estimate.low) {
        const card = document.createElement('div'); card.className = 'b1-estimate';
        const title = document.createElement('span'); title.className = 'b1-estimate-label'; title.textContent = 'ROUGH PLANNING RANGE';
        const price = document.createElement('strong'); price.className = 'b1-estimate-range';
        const money = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
        price.textContent = money.format(estimate.low)+'–'+money.format(estimate.high); card.append(title,price);
        const list = document.createElement('ul');
        for (const assumption of (estimate.assumptions || []).slice(0,4)) { const li=document.createElement('li'); li.textContent=String(assumption); list.append(li); }
        card.append(list);
        const note=document.createElement('p'); note.className='b1-estimate-note'; note.textContent='AI planning range, not a shop quote. Parts, labor and the actual repair need confirmation.'; card.append(note);
        row.append(card);
        state.estimateSummaries.push('Bay One AI planning range (not a shop quote): '+price.textContent+' for '+String(estimate.repair || 'the requested repair')+'. '+(estimate.assumptions || []).slice(0,4).join('; '));
      }
      messages.append(row); messages.scrollTop = messages.scrollHeight;
      return row;
    }

    // A dropped or unreachable server (laptop off, timeout, 5xx) gets the form and call instead of a dead end.
    function fallback(error) {
      if (!error?.offline && !['invalid_answer','estimate_unavailable','chat_unavailable','intake_only'].includes(error?.code)) return;
      $('.b1-fallback').hidden = false; markDown();
    }

    async function request(path, body) {
      if (!apiBase) throw new Error('Bay One’s connection is not configured. You can still contact the shop.');
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 35000);
      try {
        const response = await fetch(apiBase+path, { method:'POST', credentials:'omit', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:controller.signal });
        let data;
        try { data = await response.json(); } catch (_) { throw Object.assign(new Error(path === '/chat/session' ? 'Bay One could not connect. You can still use the repair form or call the shop.' : 'Bay One’s reply could not be confirmed. Your message is still here.'), {offline:true}); }
        if (!response.ok || data?.ok !== true) {
          const error = new Error(String(data?.error || 'Bay One is unavailable at the moment. Please try again or contact the shop.'));
          error.code = data?.code; error.usage = data?.usage; error.retryAfter = data?.retry_after; error.offline = response.status >= 500; throw error;
        }
        return data;
      } catch (error) {
        if (error.name === 'AbortError') throw Object.assign(new Error(path === '/chat/session' ? 'Bay One could not connect in time. Try again, use the repair form or call the shop.' : 'Bay One took too long to reply. Send again to retry the same request, or contact the shop.'), {offline:true});
        if (error instanceof TypeError) throw Object.assign(new Error(path === '/chat/session' ? 'Bay One could not connect. You can still use the repair form or call the shop.' : 'The connection dropped. Your message is preserved. Send again to retry, or contact the shop.'), {offline:true});
        throw error;
      } finally { clearTimeout(timer); }
    }

    function updateAvailability(result = {}) {
      if (result.capabilities) state.capabilities = result.capabilities;
    }
    async function session() {
      if (state.sessionReady) return;
      if (state.sessionPromise) return state.sessionPromise;
      state.sessionPromise = (async () => {
        const probe = new AbortController(), timer=setTimeout(()=>probe.abort(),6000);
        let health;
        try {
          const response=await fetch(apiBase+'/healthz',{credentials:'omit',cache:'no-store',signal:probe.signal});
          health=await response.json();
          if(!response.ok || health?.ok!==true || health.chat==='unavailable')throw new Error('down');
        } catch (_) { throw Object.assign(new Error('Bay One is offline right now. Use the repair form or call the shop; your notes stay here.'),{offline:true}); }
        finally { clearTimeout(timer); }
        mediaReady=health.media==='ready' && leadBase===apiBase;
        if(leadBase!==apiBase) {
          const mediaProbe=new AbortController(), mediaTimer=setTimeout(()=>mediaProbe.abort(),6000);
          fetch(leadBase+'/healthz',{credentials:'omit',cache:'no-store',signal:mediaProbe.signal})
            .then(response=>response.ok?response.json():null)
            .then(result=>{mediaReady=result?.ok===true&&result.media==='ready';mediaInput.closest('label').hidden=!mediaReady;})
            .catch(()=>{}).finally(()=>clearTimeout(mediaTimer));
        }
        mediaInput.closest('label').hidden=!mediaReady;
        const result=await request('/chat/session',{visitor_token:state.token || undefined});
        if(typeof result.visitor_token!=='string'||!result.visitor_token)throw Object.assign(new Error('Bay One could not start this conversation. Please use the repair form or try again.'),{offline:true});
        state.token=result.visitor_token; state.sessionReady=true; updateAvailability(result); $('.b1-fallback').hidden=state.capabilities?.questions!==false;
        $('.b1-fallback p').textContent=state.capabilities?.questions===true
          ? 'Prefer to speak to the shop? Send your details with the repair form or call.'
          : 'AI responses are unavailable on this receiver. You can still send your repair details to the shop.';
        try { localStorage.setItem(storageKey,state.token); } catch (_) { /* Current tab token still works. */ }
      })().finally(()=>{state.sessionPromise=null;});
      return state.sessionPromise;
    }

    function busy(value) {
      state.busy = value; input.disabled = value; sendButton.disabled = value;
      widget.dataset.avatarState = value ? 'thinking' : 'idle';
      sendButton.setAttribute('aria-label', value ? 'Waiting for Bay One' : 'Send message to Bay One');
      updateAvailability();
    }

    function open(event) {
      const trigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : document.activeElement;
      const repairDialog = document.getElementById('repair-request-dialog');
      if (repairDialog?.open) {
        // Native modals make siblings inert. Wait for the repair dialog to restore
        // the same form and finish returning focus before opening this body-level panel.
        repairDialog.addEventListener('close', () => open({currentTarget:trigger}), {once:true});
        repairDialog.close();
        return;
      }
      opener = trigger;
      loadArtwork(); panel.hidden = false; launcher.hidden = true; launcher.setAttribute('aria-expanded','true');
      entryButtons.forEach(button => button.setAttribute('aria-expanded','true'));
      $('.b1-close').focus({preventScroll:true}); viewport();
      if (!state.sessionReady) { status.textContent = 'Connecting to Bay One…'; session().then(() => { if (!state.busy) status.textContent = ''; }).catch(error => { status.textContent = error.message; fallback(error); }); }
    }
    function close() { panel.hidden = true; launcher.hidden = false; entryButtons.forEach(button => button.setAttribute('aria-expanded','false')); (opener?.isConnected ? opener : launcher).focus({preventScroll:true}); viewport(); }
    launcher.addEventListener('click', open); $('.b1-close').addEventListener('click', close);
    // Auto-opening is opt-in; the short repair form is the main contact path.
    $('.b1-close').addEventListener('click', () => { try { sessionStorage.setItem('pt-bayone-closed', '1'); } catch (_) { /* reopening is harmless */ } });
    let closedThisVisit = false;
    try { closedThisVisit = sessionStorage.getItem('pt-bayone-closed') === '1'; } catch (_) { /* treat as not closed */ }
    if (!closedThisVisit && config.autoOpen === true) setTimeout(() => { if (panel.hidden) open(); }, 800);
    $('.b1-contact').addEventListener('click',event => handoff(event));
    $('.b1-fallback-form').addEventListener('click',event => handoff(event));
    const formLauncher = document.getElementById('request-bay-one');
    if (formLauncher) { formLauncher.hidden = false; formLauncher.setAttribute('aria-controls','b1-panel'); formLauncher.setAttribute('aria-expanded','false'); entryButtons.push(formLauncher); formLauncher.addEventListener('click',open); }
    const contactBar = document.querySelector('.mobile-contact-bar');
    if (contactBar) widget.classList.add('b1-has-contact-bar');
    widget.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(); } });
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('.b1-composer').requestSubmit(); } });

    $('.b1-composer').addEventListener('submit', async event => {
      event.preventDefault(); if (state.busy) return;
      if (pendingLead) { status.textContent = 'Retry the pending repair request below to confirm receipt before changing these details.'; return; }
      const text = input.value.trim(); if (!text) return;
      const retry = state.failed && state.failed.message === text && state.failed.mode === 'chat';
      const pending = retry ? state.failed : { request_id:uuid(), message:text, mode:'chat' };
      if (!retry) { addMessage('user',text); state.customerMessages.push(text); }
      $('.b1-contact').textContent = 'Review details for the shop ↗';
      busy(true); status.textContent = 'Bay One is replying…';
      const slow = setTimeout(() => { if (state.busy) status.textContent = 'Still working on it. Thanks for waiting…'; }, 8000);
      try {
        await session();
        const result = await request('/chat/message', { ...pending, visitor_token:state.token });
        if (typeof result.reply !== 'string' || !result.reply.trim()) throw Object.assign(new Error('Bay One’s reply was empty. Your message is preserved; send again to retry.'), {code:'invalid_answer'});
        if (result.intake && typeof result.intake === 'object') {
          for (const [name,limit] of [['vehicle',160],['city',100],['starts',7],['stranded',7]]) {
            const value = result.intake[name];
            if (typeof value !== 'string' || value.length > limit || (['starts','stranded'].includes(name) && !['yes','no','unknown'].includes(value))) continue;
            state.intake[name] = value;
          }
        }
        const estimatedVehicle=result.estimate?.vehicle;
        if(typeof estimatedVehicle==='string'&&estimatedVehicle.length<=160&&state.customerMessages.some(message=>message.toLowerCase().includes(estimatedVehicle.toLowerCase())))state.intake.vehicle=estimatedVehicle;
        updateAvailability(result); addMessage('assistant',result.reply,result.estimate); offerSend(result.kind==='intake'||(!result.kind&&Boolean(result.intake))); state.failed = null; input.value = ''; status.textContent = '';
        if(result.assist==='scripted') { $('.b1-fallback').hidden=false; $('.b1-fallback p').textContent='AI answers are unavailable right now. You can still send a repair request for shop review.'; }
      } catch (error) {
        state.failed = !error.code || error.offline || ['request_pending','invalid_answer'].includes(error.code) ? pending : null;
        if (error.code === 'invalid_session') {
          state.sessionReady = false; state.token = '';
          try { localStorage.removeItem(storageKey); } catch (_) { /* The next request will still create a fresh session. */ }
        }
        if(error.usage)updateAvailability({usage:error.usage}); status.textContent = error.message; fallback(error);
        if (error.offline || error.code === 'invalid_answer') {
          status.textContent = 'Bay One’s reply is unavailable right now. Your message is preserved. Try again or review and send your repair details.';
          $('.b1-fallback p').textContent = 'Your message has not been answered. You can review your own words and send a repair request; the shop will review it.';
        }
        offerSend(false);
        if (error.code === 'rate_limit' && error.retryAfter) status.textContent += ` Try again in about ${Math.ceil(Number(error.retryAfter))} seconds.`;
      } finally {
        clearTimeout(slow); busy(false); if (!panel.hidden && matchMedia('(pointer:fine)').matches) input.focus({preventScroll:true});
      }
    });


    // Contact card: the customer's name and number go with the chat straight to the shop's lead inbox.
    // The exact words beside the checkbox are what gets stored as consent evidence (same text as the site form).
    const CONSENT = 'Yes, I agree to receive text messages from Perfect Timing Auto Repair LLC at the number provided about my inquiry, estimates, scheduling, and service updates. Optional; consent is not a condition of purchase. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.';
    const choice = (name, label) => `<label>${label}<select name="${name}"><option value="unknown">Not sure</option><option value="yes">Yes</option><option value="no">No</option></select></label>`;
    const sendNow = $('.b1-send-now');
    const leadForm = document.createElement('form'); leadForm.className = 'b1-lead'; leadForm.noValidate = false;
    leadForm.innerHTML = `
      <p class="b1-lead-title">Review and send to the shop</p>
      <p class="b1-lead-note">Check and edit these details. Nothing is sent to the shop until you choose Send to the shop.</p>
      <label>Vehicle <small>(year, make, model, if known)</small><input name="vehicle" maxlength="160" placeholder="e.g. 2018 Ford F-150"></label>
      <label>Repair details<textarea name="details" rows="5" maxlength="6000" required></textarea></label>
      <label>First name<input name="name" autocomplete="given-name" maxlength="100" required></label>
      <label>Mobile number<input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="40" required></label>
      <label>Your city or ZIP<input name="city" autocomplete="address-level2" maxlength="100" placeholder="e.g. Fort Myers or 33901" required></label>
      <label>Best time to reach you or anything else <small>(optional)</small><input name="callbackTime" maxlength="160"></label>
      ${choice('starts', 'Does the vehicle start?')}
      ${choice('stranded', 'Are you stranded right now?')}
      <label class="b1-lead-media"${mediaReady ? '' : ' hidden'}>Add photos or a short video <small>(optional, up to 6)</small><input type="file" name="media" accept="image/*,video/*" multiple></label>
      <label class="b1-lead-check"><input type="checkbox" name="sms"> <span>${CONSENT} <a href="/sms-terms">SMS terms</a> · <a href="/privacy-policy">Privacy policy</a>.</span></label>
      <button type="submit">Send to the shop</button>
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
      leadStatus.textContent = (keep.length ? `${keep.length} file${keep.length > 1 ? 's' : ''} will go to the shop with your request.` : '') + (skipped.length ? ` Not added: ${skipped.join(', ')}.` : '');
    });
    // Large phone photos are resized before upload: much faster on mobile data, still plenty for the shop.
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
      const row = addMessage('assistant', `Sending ${items.length} photo/video file${items.length > 1 ? 's' : ''} to the shop…`), text = row.querySelector('p');
      if (!result.mediaToken) { text.textContent = 'Your request is saved, but photos could not be attached right now. Text them to the shop at (239) 397-2048.'; return; }
      let sent = 0; const failed = [];
      for (const [n, original] of items.entries()) {
        text.textContent = `Sending file ${n + 1} of ${items.length} to the shop… keep this page open.`;
        const item = await shrink(original);
        if (!item || (item.type.startsWith('image/') && item.file.size > MEDIA.image)) { failed.push(original.file.name + ' (too large)'); continue; }
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 300000);
        try {
          const response = await fetch(`${leadBase}/hooks/lead/media/${result.id}`, {method:'POST', credentials:'omit', headers:{'Content-Type':item.type, 'X-Media-Token':result.mediaToken}, body:item.file, signal:controller.signal});
          const reply = await response.json().catch(() => ({}));
          if (!response.ok || reply?.ok !== true || reply.received !== true) throw new Error(reply?.error || 'not saved');
          sent++;
        } catch (error) { failed.push(original.file.name + (error.name === 'AbortError' ? ' (timed out)' : '')); }
        finally { clearTimeout(timer); }
      }
      text.textContent = (sent ? `The shop has your ${sent} file${sent > 1 ? 's' : ''}.` : '') + (failed.length ? ` ${failed.length} did not go through (${failed.join(', ')}). You can text ${failed.length > 1 ? 'them' : 'it'} to the shop at (239) 397-2048.` : '');
    }
    let leadKey = uuid(), leadBusy = false, leadSent = false, pendingLead = null;
    leadForm.addEventListener('input', event => {
      event.target.dataset.touched = '1';
      if (event.target.name === 'details') event.target.setCustomValidity('');
      if (!leadBusy && !pendingLead) leadKey = uuid();
    });
    function lockLeadFields(locked) { leadForm.querySelectorAll('input,select,textarea').forEach(field => { field.disabled = locked; }); }
    function refreshReview() {
      if (leadSent || pendingLead) return;
      const values = {vehicle:state.intake.vehicle || document.getElementById('request-vehicle')?.value || '', details:conversationNotes(), city:state.intake.city || '', starts:state.intake.starts || 'unknown', stranded:state.intake.stranded || 'unknown'};
      for (const [name,value] of Object.entries(values)) {
        const field = leadForm.querySelector(`[name=${name}]`);
        if (!field.dataset.touched) field.value = value;
      }
    }
    function showLead() {
      if (leadSent) return;
      refreshReview();
      sendNow.hidden = true; messages.append(leadForm); leadForm.scrollIntoView({behavior:'auto',block:'start'});
      leadForm.querySelector('[name=vehicle]').focus({preventScroll:true});
    }
    // The card appears after the first message; later chat answers still fill the urgency boxes the customer has not touched.
    for (const name of ['starts', 'stranded']) leadForm.querySelector(`[name=${name}]`).addEventListener('change', event => { event.target.dataset.touched = '1'; });
    function offerSend(ready) {
      if (leadForm.isConnected) refreshReview();
      if (leadSent || leadForm.isConnected) return;
      if (ready) showLead(); else if (state.customerMessages.length) sendNow.hidden = false;
    }
    sendNow.addEventListener('click', showLead);
    const leadCity = leadForm.querySelector('[name=city]');
    leadCity.addEventListener('input', () => { leadCity.dataset.touched = '1'; leadCity.setCustomValidity(''); });
    leadForm.addEventListener('submit', async event => {
      event.preventDefault(); if (leadBusy || leadSent) return;
      if (!pendingLead) {
        leadCity.setCustomValidity(leadCity.value.trim() ? '' : 'Enter your city or ZIP.');
        const details = leadForm.querySelector('[name=details]');
        details.setCustomValidity(!details.value.trim() ? 'Add the repair details you want the shop to review.' : details.value.length > details.maxLength ? 'Your notes are preserved. Shorten the repair details to 6,000 characters before sending.' : '');
        if (!leadForm.reportValidity()) return;
      }
      const retryingPending = !!pendingLead;
      if (!pendingLead) {
        const data = new FormData(leadForm), sms = data.get('sms') === 'on';
        const body = {
        name:String(data.get('name') || '').trim(), phone:String(data.get('phone') || '').replace(/[^\d+()\s.-]/g, '').trim(), ...(window.PT_LEAD_CHANNEL ? {channel: window.PT_LEAD_CHANNEL} : {}),
        vehicle:String(data.get('vehicle') || '').trim().slice(0,160), service:String(window.PT_REPAIR_CONTEXT?.service || '').slice(0,160),
        details:String(data.get('details') || '').trim(),
        city:String(data.get('city') || state.intake.city || '').trim().slice(0,100), starts:String(data.get('starts') || 'unknown'), stranded:String(data.get('stranded') || 'unknown'),
        callbackTime:String(data.get('callbackTime') || '').trim().slice(0,160), source:'ai', locationContract:'sender-v1', website:'',
        smsConsent:sms, smsConsentTimestamp:sms ? new Date().toISOString() : '', smsConsentVersion:'2026-09-06-v1',
        smsConsentSource:'bay-one-chat', smsConsentPage:location.origin+location.pathname, smsConsentDisclosure:sms ? CONSENT : '',
        };
        // Keep the exact payload, including consent time, for an uncertain retry.
        pendingLead = {key:leadKey,body};
      }
      const {body} = pendingLead, sms = body.smsConsent;
      lockLeadFields(true);
      leadBusy = true; leadForm.querySelector('button').disabled = true; leadStatus.textContent = 'Sending to the shop…';
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
      let leadStatusCode = 0;
      try {
        const response = await fetch(leadBase+'/hooks/lead/webform', { method:'POST', credentials:'omit', headers:{'Content-Type':'application/json','Idempotency-Key':pendingLead.key}, body:JSON.stringify(body), signal:controller.signal });
        const result = await response.json().catch(() => ({}));
        leadStatusCode = response.status;
        if (!response.ok || result?.ok !== true || result.received !== true || typeof result.id !== 'string' || !result.id.trim()) {
          // Validation/refusal confirms no save; allow corrections. A timeout, 5xx or
          // key conflict can be ambiguous, so preserve the snapshot and retry key.
          if (!retryingPending && [400,403,413,422,429].includes(response.status)) { pendingLead = null; leadKey = uuid(); lockLeadFields(false); }
          throw new Error(result?.error || 'Receipt could not be confirmed.');
        }
        leadSent = true; pendingLead = null; leadForm.remove(); $('.b1-composer').hidden = true;
        const urgent = body.stranded === 'yes' && body.starts === 'no';
        const row = addMessage('assistant', `Your request is saved for the shop to review. Your callback number is ${body.phone}; ${sms ? 'text or call' : 'call only'}. Booking is not confirmed.` + (urgent ? ' You said you are stranded, so your request is marked urgent. If you are somewhere unsafe, call 911.' : ' Your mechanic confirms pricing after reviewing the problem.'));
        const reference = document.createElement('p'); reference.className = 'b1-receipt-reference'; reference.textContent = `Reference: ${result.id}`; row.append(reference);
        const call = document.createElement('a'); call.className = 'b1-request-service'; call.href = 'tel:+12393972048'; call.textContent = urgent ? 'Call — AI intake' : 'Call — AI intake';
        row.append(call);
        uploadMedia(result, mediaInput && !mediaInput.closest('label').hidden ? pickMedia().keep : []).catch(() => {});
        try { sessionStorage.setItem('pt-last-request', JSON.stringify({ id:result.id, receivedAt:result.receivedAt, confirmed:true, smsConsent:sms })); } catch (_) { /* Confirmation is already shown in the chat. */ }
      } catch (error) {
        fallback({offline: error.name === 'AbortError' || error instanceof TypeError || leadStatusCode >= 500});
        leadStatus.textContent = (error.name === 'AbortError' || error instanceof TypeError ? 'Receipt could not be confirmed.' : error.message) + (pendingLead ? ' Retry to check the same request; its details are preserved.' : ' Correct your details and try again.') + ' You can also call or text the shop at (239) 397-2048.';
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
    addMessage('assistant', 'Hi, I’m Bay One. Tell me about your vehicle, ask a question, or ask what a repair might cost. I’ll ask for missing details before offering a preliminary range. The shop confirms the actual repair and price.');
  }
})();

