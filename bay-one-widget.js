/* Public Bay One assistant. No shop-admin credentials or browser-side price calculations. */
(() => {
  'use strict';
  if (document.getElementById('bay-one-widget')) return;
  const script = document.currentScript;
  const config = window.PT_BAYONE_CONFIG || {};
  const apiBase = String(config.endpoint || window.PT_CONTACT_CONFIG?.endpoint || 'https://redline.taild5f39d.ts.net:10000').replace(/\/$/, '');
  const avatarUrl = config.avatar || script?.dataset.avatar || '/assets/bay-one-original.png';
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = new URL('bay-one-widget.css?v=20260908', script?.src || location.href).href;
  document.head.append(css);
  const widget = document.createElement('aside'); widget.id = 'bay-one-widget'; widget.className = 'b1-widget';
  widget.setAttribute('aria-label', 'Bay One repair assistant');
  const portrait = '<span class="b1-avatar" aria-hidden="true"><span class="b1-monogram">B1</span></span>';
  widget.innerHTML = `
    <button class="b1-launcher" type="button" aria-label="Ask Bay One, the AI repair assistant" aria-expanded="false" aria-controls="b1-panel">
      ${portrait}<span class="b1-launcher-copy"><small><i class="b1-dot"></i> Here to help</small><strong>Ask Bay One</strong><span>Questions & rough estimates</span></span>
    </button>
    <section class="b1-panel" id="b1-panel" role="dialog" aria-label="Chat with Bay One" hidden>
      <header class="b1-header">${portrait}<div><h2 class="b1-title">Bay One</h2><p class="b1-subtitle">Perfect Timing’s AI assistant</p></div><button class="b1-close" type="button" aria-label="Close Bay One chat">×</button></header>
      <div class="b1-allowance" aria-live="polite">2 rough estimates per day · General questions welcome</div>
      <div class="b1-messages" role="log" aria-label="Conversation with Bay One" aria-live="polite" aria-relevant="additions text"></div>
      <div class="b1-suggestions"><button type="button" data-b1-suggestion="question">Ask about a symptom</button><button type="button" data-b1-suggestion="estimate">Get a rough estimate</button></div>
      <form class="b1-composer">
        <div class="b1-mode" role="group" aria-label="Conversation type"><button type="button" data-b1-mode="chat" aria-pressed="true">Ask a question</button><button type="button" data-b1-mode="estimate" aria-pressed="false">Rough estimate</button></div>
        <label class="b1-field-label" for="b1-message">What can I help you with?</label>
        <div class="b1-input-row"><textarea id="b1-message" rows="2" maxlength="1600" placeholder="Ask a general question or tell me about your car…" required></textarea><button class="b1-send" type="submit" aria-label="Send message to Bay One"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 7-7 7 7M12 5v14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
        <div class="b1-status" role="status" aria-live="polite"></div>
      </form>
      <footer class="b1-footer"><span>AI guidance and approximate ranges. The shop confirms final pricing. <a href="/privacy-policy.html">Chat privacy</a></span><a class="b1-contact" href="/#contact">Contact the shop ↗</a></footer>
    </section>`;
  document.body.append(widget);
  const $ = selector => widget.querySelector(selector);
  const launcher = $('.b1-launcher'), panel = $('.b1-panel'), input = $('#b1-message');
  const messages = $('.b1-messages'), status = $('.b1-status'), allowance = $('.b1-allowance');
  const sendButton = $('.b1-send'), estimateButton = $('[data-b1-mode="estimate"]');
  const storageKey = 'pt-bayone-visitor-v1';
  const state = { token: '', sessionReady: false, sessionPromise: null, busy: false, mode: 'chat', usage: null, failed: null, resetTimer: null };
  try { state.token = localStorage.getItem(storageKey) || ''; } catch (_) { /* The server also enforces the allowance by network. */ }
  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const n = crypto.getRandomValues(new Uint8Array(1))[0] & 15; return (c === 'x' ? n : ((n & 3) | 8)).toString(16); });

  if (avatarUrl) widget.querySelectorAll('.b1-avatar').forEach(container => {
    const img = document.createElement('img'); img.src = avatarUrl; img.alt = ''; img.decoding = 'async';
    img.addEventListener('load', () => container.classList.add('has-image'));
    img.addEventListener('error', () => img.remove()); container.append(img);
  });

  const handoffKey = 'pt-bayone-service-draft-v1';
  function prefillService(summary) {
    const details = document.getElementById('request-details');
    if (!details) return false;
    const existing = details.value.trim();
    const available = (details.maxLength > 0 ? details.maxLength : 4000) - existing.length - (existing ? 2 : 0);
    if (available > 0 && !existing.includes(summary)) {
      details.value = [existing, summary.slice(0, available)].filter(Boolean).join('\n\n');
      details.dispatchEvent(new Event('input', {bubbles:true}));
    }
    return true;
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem(handoffKey) || 'null');
    if (saved && Date.now() - saved.at < 30*60*1000 && typeof saved.summary === 'string' && prefillService(saved.summary)) sessionStorage.removeItem(handoffKey);
  } catch (_) { /* An explicit service handoff still works without storage. */ }

  function addMessage(speaker, text, estimate, requestText) {
    const row = document.createElement('div'); row.className = `b1-message b1-${speaker}`;
    const label = document.createElement('span'); label.className = 'b1-message-label'; label.textContent = speaker === 'user' ? 'YOU' : 'BAY ONE';
    const body = document.createElement('p'); body.textContent = String(text || '').slice(0, 20000);
    row.append(label, body);
    if (estimate && Number.isFinite(estimate.low) && Number.isFinite(estimate.high) && estimate.low >= 0 && estimate.high >= estimate.low) {
      const card = document.createElement('div'); card.className = 'b1-estimate';
      const kind = document.createElement('span'); kind.className = 'b1-estimate-label'; kind.textContent = 'ROUGH ESTIMATE';
      const price = document.createElement('strong'); price.className = 'b1-estimate-range';
      const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
      price.textContent = `${money.format(estimate.low)}–${money.format(estimate.high)}`;
      card.append(kind, price);
      if (Array.isArray(estimate.assumptions) && estimate.assumptions.length) {
        const list = document.createElement('ul'); estimate.assumptions.slice(0, 8).forEach(value => { const li = document.createElement('li'); li.textContent = String(value); list.append(li); }); card.append(list);
      }
      const note = document.createElement('span'); note.className = 'b1-estimate-note'; note.textContent = 'A planning range, not a final quote. The shop confirms the repair and price after assessing your vehicle.'; card.append(note);
      const service = document.createElement('a'); service.className = 'b1-request-service'; service.href = '/#contact'; service.textContent = 'Request service ↗';
      service.addEventListener('click', event => {
        const assumptions = Array.isArray(estimate.assumptions) ? estimate.assumptions.slice(0,4).map(String).join('; ') : '';
        const summary = `Bay One rough estimate: ${String(requestText || '').slice(0,1800)}\nApproximate range: ${price.textContent}. Final price requires shop assessment.${assumptions ? '\nAssumptions: '+assumptions : ''}`;
        if (prefillService(summary)) {
          event.preventDefault(); location.hash = 'contact'; document.getElementById('bookingForm').scrollIntoView({behavior:'auto',block:'center'});
        } else { try { sessionStorage.setItem(handoffKey, JSON.stringify({at:Date.now(),summary})); } catch (_) { /* The standard form remains available. */ } }
        close();
      });
      card.append(service); row.append(card);
    }
    messages.append(row); messages.scrollTop = messages.scrollHeight;
    return row;
  }

  function setUsage(usage) {
    if (!usage || !Number.isFinite(usage.remaining)) return;
    state.usage = usage;
    const remaining = Math.max(0, Math.min(2, usage.remaining));
    allowance.textContent = remaining ? `${remaining} rough estimate${remaining === 1 ? '' : 's'} left today · Questions welcome` : 'Today’s 2 rough estimates used · You can still ask questions';
    if (usage.resets_at) {
      const stamp = typeof usage.resets_at === 'number' && usage.resets_at < 1e12 ? usage.resets_at * 1000 : usage.resets_at;
      const reset = new Date(stamp);
      if (!Number.isNaN(reset.valueOf())) allowance.title = 'Allowance resets '+new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZone:usage.timezone || 'America/New_York', timeZoneName:'short' }).format(reset);
      clearTimeout(state.resetTimer);
      const untilReset = reset.valueOf() - Date.now();
      if (untilReset > 0) state.resetTimer = setTimeout(() => {
        state.sessionReady = false;
        if (!panel.hidden) session().catch(error => { status.textContent = error.message; });
      }, Math.min(untilReset+500, 2147483647));
    }
    estimateButton.disabled = remaining === 0 || state.busy;
    estimateButton.title = remaining === 0 ? 'Your rough-estimate allowance resets each day. General questions remain available.' : '';
  }

  async function request(path, body) {
    if (!apiBase) throw new Error('Bay One’s connection is not configured. You can still contact the shop.');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 35000);
    try {
      const response = await fetch(apiBase+path, { method:'POST', credentials:'omit', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:controller.signal });
      let data;
      try { data = await response.json(); } catch (_) { throw new Error('Bay One’s reply could not be confirmed. Your message is still here.'); }
      if (!response.ok || data.ok !== true) {
        const error = new Error(String(data.error || 'Bay One is unavailable at the moment. Please try again or contact the shop.'));
        error.code = data.code; error.usage = data.usage; error.retryAfter = data.retry_after; throw error;
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Bay One took too long to reply. Send again to retry the same request, or contact the shop.');
      if (error instanceof TypeError) throw new Error('The connection dropped. Your message is preserved. Send again to retry, or contact the shop.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  async function session() {
    if (state.sessionReady) return;
    if (state.sessionPromise) return state.sessionPromise;
    state.sessionPromise = request('/chat/session', { visitor_token:state.token || undefined }).then(result => {
      if (typeof result.visitor_token !== 'string' || !result.visitor_token) throw new Error('Bay One could not start this conversation. Please try again.');
      state.token = result.visitor_token; state.sessionReady = true; setUsage(result.usage);
      try { localStorage.setItem(storageKey, state.token); } catch (_) { /* Continue with the current tab’s token. */ }
    }).finally(() => { state.sessionPromise = null; });
    return state.sessionPromise;
  }

  function mode(value) {
    if (state.busy) return;
    if (value === 'estimate' && state.usage?.remaining === 0) {
      status.textContent = 'You’ve used today’s 2 rough estimates. Ask a general question, or contact the shop about this repair.'; return;
    }
    state.mode = value;
    widget.querySelectorAll('[data-b1-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.b1Mode === value)));
    $('.b1-field-label').textContent = value === 'estimate' ? 'Include the year, make, model and repair or symptom' : 'What can I help you with?';
    input.placeholder = value === 'estimate' ? 'Example: 2010 Mercedes ML350, front wheel bearing replacement…' : 'Ask a general question or tell me about your car…';
    status.textContent = '';
  }

  function busy(value) {
    state.busy = value; input.disabled = value; sendButton.disabled = value;
    widget.querySelectorAll('[data-b1-mode]').forEach(button => button.disabled = value || (button.dataset.b1Mode === 'estimate' && state.usage?.remaining === 0));
    sendButton.setAttribute('aria-label', value ? 'Waiting for Bay One' : 'Send message to Bay One');
  }

  function open() {
    if (state.usage?.resets_at && new Date(state.usage.resets_at).valueOf() <= Date.now()) state.sessionReady = false;
    panel.hidden = false; launcher.hidden = true; launcher.setAttribute('aria-expanded','true');
    $('.b1-close').focus({preventScroll:true}); viewport();
    if (!state.sessionReady) { status.textContent = 'Connecting to Bay One…'; session().then(() => { if (!state.busy) status.textContent = ''; }).catch(error => { status.textContent = error.message; }); }
  }
  function close() { panel.hidden = true; launcher.hidden = false; launcher.setAttribute('aria-expanded','false'); launcher.focus({preventScroll:true}); viewport(); }
  launcher.addEventListener('click', open); $('.b1-close').addEventListener('click', close);
  $('.b1-contact').addEventListener('click', () => { close(); });
  widget.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(); } });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('.b1-composer').requestSubmit(); } });
  widget.querySelectorAll('[data-b1-mode]').forEach(button => button.addEventListener('click', () => { mode(button.dataset.b1Mode); input.focus(); }));
  widget.querySelectorAll('[data-b1-suggestion]').forEach(button => button.addEventListener('click', () => { mode(button.dataset.b1Suggestion === 'estimate' ? 'estimate' : 'chat'); input.focus(); }));

  $('.b1-composer').addEventListener('submit', async event => {
    event.preventDefault(); if (state.busy) return;
    const text = input.value.trim(); if (!text) return;
    if (state.mode === 'estimate' && state.usage?.remaining === 0) { mode('chat'); status.textContent = 'Your 2 rough estimates are used today. You can keep asking general questions.'; return; }
    const retry = state.failed && state.failed.message === text && state.failed.mode === state.mode;
    const pending = retry ? state.failed : { request_id:uuid(), message:text, mode:state.mode };
    if (!retry) addMessage('user',text);
    $('.b1-suggestions').hidden = true; busy(true); status.textContent = 'Bay One is replying…';
    try {
      await session();
      const result = await request('/chat/message', { ...pending, visitor_token:state.token });
      setUsage(result.usage);
      if (typeof result.reply !== 'string' || !result.reply.trim()) throw new Error('Bay One’s reply was empty. Your message is preserved; send again to retry.');
      addMessage('assistant',result.reply,result.estimate,pending.message); state.failed = null; input.value = ''; status.textContent = '';
    } catch (error) {
      state.failed = !error.code || error.code === 'request_pending' ? pending : null;
      if (error.code === 'invalid_session') {
        state.sessionReady = false; state.token = '';
        try { localStorage.removeItem(storageKey); } catch (_) { /* The next request will still create a fresh session. */ }
      }
      setUsage(error.usage);
      status.textContent = error.code === 'estimate_limit' ? 'Today’s 2 rough estimates are used. General questions are still available, or contact the shop for help with this repair.' : error.message;
      if (error.code === 'rate_limit' && error.retryAfter) status.textContent += ` Try again in about ${Math.ceil(Number(error.retryAfter))} seconds.`;
    } finally {
      busy(false); if (!panel.hidden && matchMedia('(pointer:fine)').matches) input.focus({preventScroll:true});
    }
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
  addMessage('assistant', 'Hi, I’m Bay One. Ask a general question, tell me what your car’s doing, or get a rough repair price range before you contact the shop.');
})();
