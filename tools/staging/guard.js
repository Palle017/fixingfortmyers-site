(() => {
  'use strict';
  const prefix = '/__staging/mock';
  const calls = [];
  const receipts = new Map();
  const blocked = message => new TypeError('STAGING blocked: ' + message);
  const lock = (target, key, value) => Object.defineProperty(target, key, {value, writable:false, configurable:false});
  const config = Object.freeze({endpoint:location.origin + prefix, ga4MeasurementId:'', googleClientId:'', staging:true});
  lock(window, 'PT_CONTACT_CONFIG', config);
  lock(window, 'PT_STAGING', Object.freeze({syntheticOnly:true, analytics:false, get calls() { return calls.map(item => ({...item})); }}));
  const reply = (body, status = 200) => Object.freeze({
    ok:status >= 200 && status < 300, status,
    json:async () => JSON.parse(JSON.stringify(body)), text:async () => JSON.stringify(body)
  });
  lock(window, 'fetch', async (input, options = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    const method = String(options.method || input?.method || 'GET').toUpperCase();
    if (url.origin !== location.origin || !url.pathname.startsWith(prefix + '/') || url.search || url.hash)
      throw blocked('network destination');
    const route = url.pathname.slice(prefix.length);
    calls.push({path:route, method}); // No fields, tokens, attachments or customer data.
    if (method === 'GET' && route === '/healthz') return reply({ok:true,media:'ready',environment:'staging',synthetic:true});
    if (method === 'POST' && route === '/careers') return reply({success:true,synthetic:true,message:'STAGING simulation only'});
    if (method === 'POST' && ['/hooks/lead/webform','/hooks/lead/voicenote'].includes(route)) {
      const key = new Headers(options.headers || {}).get('Idempotency-Key') || crypto.randomUUID();
      if (!receipts.has(key)) receipts.set(key, {ok:true,received:true,id:crypto.randomUUID(),receivedAt:new Date().toISOString(),mediaToken:'synthetic-only',synthetic:true});
      return reply(receipts.get(key), 201);
    }
    if (method === 'POST' && /^\/hooks\/lead\/media\/[0-9a-f-]{36}$/.test(route)) return reply({ok:true,received:true,synthetic:true},201);
    if (method === 'GET' && /^\/hooks\/calendar\/status\/[0-9a-f-]{36}$/.test(route))
      return reply({ok:true,status:'staging_simulation',calendarPlaced:false,calendarConfirmed:false,synthetic:true});
    throw blocked('unrecognized mock route or method');
  });
  const deniedTransport = function () { throw blocked('transport disabled'); };
  for (const name of ['XMLHttpRequest','WebSocket','EventSource','Worker','SharedWorker','RTCPeerConnection','webkitRTCPeerConnection'])
    lock(window, name, deniedTransport);
  lock(navigator, 'sendBeacon', () => false);
  lock(window, 'open', () => null);
  lock(navigator, 'geolocation', Object.freeze({
    getCurrentPosition(_success, error) { error?.({code:1,message:'STAGING uses synthetic locations only'}); },
    watchPosition(_success, error) { error?.({code:1,message:'STAGING location disabled'}); return 0; },
    clearWatch() {}
  }));
  lock(navigator, 'mediaDevices', Object.freeze({getUserMedia:async () => { throw blocked('microphone and camera disabled'); }}));
  lock(navigator, 'serviceWorker', Object.freeze({register:async () => { throw blocked('service worker disabled'); }}));
  try { lock(document, 'modelContext', undefined); } catch (_) { /* Origin-trial and declarative tools are removed by the build. */ }
  const unsafeHref = raw => {
    if (!raw) return false;
    try { const url = new URL(raw, location.href); return url.origin !== location.origin || !['http:','https:'].includes(url.protocol); }
    catch (_) { return true; }
  };
  const disableLink = link => {
    if (unsafeHref(link.getAttribute('href'))) {
      link.setAttribute('data-staging-blocked', 'External contact/navigation disabled in staging');
      link.setAttribute('aria-disabled', 'true');
      link.setAttribute('href', '#staging-notice');
      link.removeAttribute('target');
      link.removeAttribute('ping');
    }
  };
  const sanitize = node => {
    if (node.nodeType !== 1 && node.nodeType !== 9) return;
    if (node.matches?.('a[href],area[href]')) disableLink(node);
    node.querySelectorAll?.('a[href],area[href]').forEach(disableLink);
  };
  const stopNavigation = event => {
    const link = event.target.closest?.('a[href],area[href]');
    if (link && (link.hasAttribute('data-staging-blocked') || unsafeHref(link.getAttribute('href')))) {
      event.preventDefault(); event.stopImmediatePropagation(); disableLink(link);
    }
  };
  for (const type of ['click','auxclick','contextmenu']) document.addEventListener(type, stopNavigation, true);
  document.addEventListener('submit', event => { event.preventDefault(); }, true);
  const originalClick = HTMLAnchorElement.prototype.click;
  lock(HTMLAnchorElement.prototype, 'click', function () {
    if (this.hasAttribute('data-staging-blocked') || unsafeHref(this.getAttribute('href'))) { disableLink(this); return; }
    return originalClick.call(this);
  });
  lock(HTMLFormElement.prototype, 'submit', deniedTransport);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') sanitize(record.target);
      else record.addedNodes.forEach(sanitize);
    }
  }).observe(document.documentElement, {subtree:true,childList:true,attributes:true,attributeFilter:['href']});
  sanitize(document);
})();
