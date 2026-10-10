(() => {
  'use strict';
  // Anonymous browser counts; never include form values or URL query strings.
  const metricsEndpoint = (window.PT_CONTACT_CONFIG?.endpoint || '').replace(/\/$/, '');
  if (metricsEndpoint && /^(www\.)?fixingfortmyers\.com$/.test(location.hostname)) {
    const makeId = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
    let visitor = makeId();
    try {
      const saved = localStorage.getItem('pt-website-visitor-v1');
      if (saved && /^[A-Za-z0-9_-]{16,80}$/.test(saved)) visitor = saved;
      else localStorage.setItem('pt-website-visitor-v1', visitor);
    } catch (_) { /* A blocked storage browser can still record this visit. */ }
    const event = JSON.stringify({visitor_id:visitor,event_id:makeId(),page:location.pathname.slice(0,500)});
    const reportVisit = () => fetch(metricsEndpoint + '/hooks/analytics/visit', {
      method:'POST',headers:{'Content-Type':'application/json'},body:event,credentials:'omit',keepalive:true
    }).then(response => { if (response.status >= 500) throw new Error('retry'); });
    reportVisit().catch(() => setTimeout(() => reportVisit().catch(() => {}), 3000));
  }
  const byId = id => document.getElementById(id);
  // Keep the existing lead-channel contract; only known campaign codes enter message drafts.
  const validChannel = value => typeof value === 'string' && /^[a-z0-9_-]{2,30}$/.test(value);
  const draftChannels = new Set(['google','nextdoor','referral','trade_referral','gbp_no_start','gbp_walnut','gbp_major','nextdoor_no_start','nextdoor_walnut','nextdoor_major']);
  const landedChannel = (new URLSearchParams(location.search).get('utm_source') || '').toLowerCase();
  let leadChannel = validChannel(landedChannel) ? landedChannel : '';
  try {
    if (leadChannel) sessionStorage.setItem('pt-lead-channel', leadChannel);
    else {
      const saved = sessionStorage.getItem('pt-lead-channel');
      if (validChannel(saved)) leadChannel = saved;
    }
  } catch (_) { /* A blocked session store still permits attribution from this page's URL. */ }
  window.PT_LEAD_CHANNEL = leadChannel;
  const draftChannel = draftChannels.has(leadChannel) ? leadChannel : '';
  // Service attribution is a fixed category, never arbitrary query text.
  const services = Object.freeze({diagnostics:'Diagnosis / not sure yet',ac:'A/C repair',brakes:'Brakes',electrical:'Electrical / no-start','no-start':'Electrical / no-start',battery:'Electrical / no-start',cooling:'Engine',engine:'Engine',transmission:'Transmission',programming:'Module programming',diesel:'Diesel',maintenance:'Oil change / maintenance',walnut:'Walnut blasting / carbon cleaning'});
  const servicePages = {'auto-diagnostics-fort-myers':'diagnostics','check-engine-light-diagnosis-fort-myers':'diagnostics','ac-repair-fort-myers':'ac','brake-repair-fort-myers':'brakes','auto-electrical-repair-fort-myers':'electrical','no-start-diagnosis-fort-myers':'no-start','battery-replacement-fort-myers':'battery','engine-repair-fort-myers':'engine','transmission-repair-fort-myers':'engine','module-programming-fort-myers':'programming','diesel-repair-fort-myers':'diesel','oil-change-fort-myers':'maintenance','repair-guide-car-wont-start':'no-start','repair-guide-ac-warm-at-idle':'ac','repair-guide-battery-keeps-dying':'battery'};
  Object.assign(servicePages,{'repair-guide-ecu-tcm-programming':'programming','cooling-system-repair-fort-myers':'cooling','repair-guide-car-overheating':'cooling','repair-guide-flashing-check-engine-light':'diagnostics','walnut-blasting-fort-myers':'walnut','engine-rebuild-vs-replacement-fort-myers':'engine','transmission-repair-fort-myers':'transmission'});
  const validService = key => typeof key === 'string' && Object.hasOwn(services,key);
  const requestedService = new URLSearchParams(location.search).get('service');
  const pageService = servicePages[location.pathname.replace(/^\//,'').replace(/\.html$/,'')];
  const serviceKey = validService(requestedService) ? requestedService : validService(pageService) ? pageService : '';
  // Carry a known guide/service page into the customer's editable text draft.
  // Never copy arbitrary URLs, search queries, referrers or ad parameters.
  const sourcePages = new Set(['repair-guides', ...Object.keys(servicePages)]);
  const currentSource = location.pathname.replace(/^\//,'').replace(/\.html$/,'');
  let sourcePage = sourcePages.has(currentSource) ? currentSource : '';
  try {
    if (sourcePage) sessionStorage.setItem('pt-repair-source',sourcePage);
    else if (location.pathname === '/' || location.pathname === '/index.html') {
      const saved = sessionStorage.getItem('pt-repair-source');
      if (sourcePages.has(saved)) sourcePage = saved;
    }
  } catch (_) { /* A blocked session store does not block contacting Tony. */ }
  window.PT_REPAIR_CONTEXT = {service:serviceKey,applyService(key){const field=byId('request-service');if(field&&validService(key)&&field.selectedIndex===0)field.value=services[key];}};
  const toggle = byId('mobileToggle');
  const menu = byId('mobileMenu');
  if (toggle && menu) {
    const close = () => { menu.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open menu'); };
    toggle.addEventListener('click', () => { const open = menu.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); });
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('open')) { close(); toggle.focus(); } });
  }
  const nav = byId('nav');
  if (nav) { const update = () => nav.classList.toggle('nav--scrolled', window.scrollY > 60); update(); window.addEventListener('scroll', update, { passive: true }); }
  const quickCall = document.querySelector('.mobile-contact-bar[aria-label="Quick contact"] a[href="tel:+12393972048"], .mobile-contact-bar[aria-label^="Engine or transmission"] a[href="tel:+12393972048"]');
  if (quickCall) { quickCall.textContent = 'Call'; quickCall.setAttribute('aria-label', 'Call Perfect Timing Auto Repair at (239) 397-2048'); }
  const brandVideo = document.querySelector('.bang-video-wrap video');
  if (brandVideo) {
    brandVideo.removeAttribute('autoplay');
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
      new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) brandVideo.play().catch(() => {}); else brandVideo.pause(); }), { threshold: .25 }).observe(brandVideo);
    } else { brandVideo.pause(); brandVideo.controls = true; }
  }
  const form = byId('bookingForm');
  if (!form) return;
  window.PT_REPAIR_CONTEXT.applyService(serviceKey);
  const problemField = byId('request-details');
  if (problemField) problemField.addEventListener('input',()=>problemField.setCustomValidity(problemField.maxLength>0&&problemField.value.length>problemField.maxLength?'Your notes are preserved. Please shorten them to fit the form before sending.':''));
  for (const id of ['request-vehicle','request-city','request-starts','request-stranded']) {
    const field = byId(id);
    if (field) field.addEventListener('input',()=>{field.dataset.userEdited='true';});
  }
  const configuredEndpoint = (window.PT_CONTACT_CONFIG?.endpoint || '').replace(/\/$/, '');
  let endpoint = configuredEndpoint;
  const status = byId('request-status');
  const submit = byId('request-submit');
  const backup = byId('request-backup');
  const preview = byId('request-preview');
  const textDraft = byId('request-text');
  const phoneField = byId('request-phone');
  const cleanPhone = value => value.replace(/[^\d+()\s.-]/g, '').trim();
  const validPhone = value => /^\+?[\d\s().-]+$/.test(value) && /^\d{10,15}$/.test(value.replace(/\D/g, ''));
  const locationChoice = byId('request-location-choice');
  const carAddress = byId('request-car-address');
  const locationButton = byId('request-use-location');
  const locationStatus = byId('request-location-status');
  let deviceLocation = null, locationAttempt = 0;
  const updateCarLocation = () => {
    if (!locationChoice) return;
    const atLocation = locationChoice.value === 'location';
    byId('request-car-location').hidden = !atLocation;
    carAddress.disabled = !atLocation;
    carAddress.required = atLocation;
    const dropoff = locationChoice.value === 'dropoff';
    byId('request-dropoff').hidden = !dropoff;
    byId('request-dropoff-time').disabled = !dropoff;
  };
  locationChoice?.addEventListener('change', () => {
    locationAttempt++;
    deviceLocation = null;
    if (carAddress.value.startsWith('Current location: ')) carAddress.value = '';
    locationStatus.textContent = '';
    locationButton.disabled = false;
    locationButton.textContent = 'Use current location';
    updateCarLocation();
  });
  carAddress?.addEventListener('input', () => {
    locationAttempt++;
    deviceLocation = null;
    locationStatus.textContent = '';
    locationButton.disabled = false;
    locationButton.textContent = 'Use current location';
    carAddress.setCustomValidity('');
  });
  locationButton?.addEventListener('click', () => {
    if (locationChoice.value !== 'location') return;
    if (!navigator.geolocation) {
      locationStatus.textContent = 'Current location is unavailable. Please type the car’s address.';
      carAddress.focus();
      return;
    }
    const attempt = ++locationAttempt;
    locationButton.disabled = true;
    locationButton.textContent = 'Finding location…';
    locationStatus.textContent = 'Allow location access when your browser asks, or type the car’s address.';
    const finish = () => { locationButton.disabled = false; locationButton.textContent = 'Use current location'; };
    const fail = () => {
      if (attempt !== locationAttempt) return;
      finish();
      locationStatus.textContent = 'Could not get your location. Please type the car’s address instead.';
      carAddress.focus();
    };
    try {
      navigator.geolocation.getCurrentPosition(position => {
        if (attempt !== locationAttempt || locationChoice.value !== 'location') return;
        const {latitude, longitude, accuracy} = position.coords;
        if (![latitude,longitude,accuracy].every(Number.isFinite) || Math.abs(latitude)>90 || Math.abs(longitude)>180 || accuracy<0 || !Number.isFinite(position.timestamp)) { fail(); return; }
        deviceLocation = {type:'device',latitude,longitude,accuracyMeters:accuracy,capturedAt:new Date(position.timestamp).toISOString(),carAtDevice:true};
        carAddress.value = `Current location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        carAddress.setCustomValidity('');
        finish();
        locationStatus.textContent = `Location added (within about ${Math.max(1,Math.round(accuracy))} metres). Check that your car is here before sending.`;
      }, fail, {enableHighAccuracy:true,timeout:15000,maximumAge:0});
    } catch (_) { fail(); }
  });
  updateCarLocation();
  const applyMode = () => {
  phoneField.required = Boolean(endpoint);
  byId('request-phone-label').textContent = endpoint ? 'Phone number' : 'Callback number, if different (optional)';
  byId('request-sms-consent').closest('.request-consent').hidden = !endpoint;
  byId('request-direct-consent').hidden = Boolean(endpoint);
  const media = byId('request-media'); if (media) media.closest('label').hidden = !(endpoint && mediaReady);
  const voice = document.querySelector('.request-voice'); if (voice) voice.hidden = !endpoint;
  const heading = byId('request-heading'); if (heading) heading.textContent = endpoint ? 'Tell the shop what’s going on' : 'Prepare a repair message';
  if (!sending && !sentRequestId) submit.textContent = endpoint ? 'Send repair request' : 'Prepare text to the shop';
  // Preserve the current page's guidance (and any Bay One handoff) while online.
  if (!endpoint) byId('request-instructions').textContent = 'Online requests are unavailable right now. Fill in what you know to prepare a text or email, then send it yourself. Nothing is sent from this page.';
  };
  let mediaReady = false;
  // Messages uses a different body separator on Apple mobile devices. Keep copy/email
  // available because support still depends on the device's registered texting app.
  const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const smsBodySeparator = appleMobile ? '&' : '?';
  const refreshDraftLinks = () => {
    if (textDraft) textDraft.href = `sms:+12393972048${smsBodySeparator}body=${encodeURIComponent(preview.value)}`;
    byId('request-email').href = `mailto:fixingfortmyers@gmail.com?subject=${encodeURIComponent('Repair inquiry for Perfect Timing Auto Repair')}&body=${encodeURIComponent(preview.value)}`;
  };
  preview.addEventListener('input',refreshDraftLinks);
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let requestKey = uid();
  let sentRequestId = '';
  let sending = false;
  let requestPayload = null, voicePayload = null;
  // Stored as consent evidence, so it must be the exact wording shown beside the checkbox in index.html.
  const consentDisclosure = 'Yes, I agree to receive text messages from Perfect Timing Auto Repair LLC at the number provided about my inquiry, estimates, scheduling, and service updates. Optional; consent is not a condition of purchase. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.';
  const readRequest = () => {
    const data = new FormData(form);
    const consent = byId('request-sms-consent').checked;
    const city = String(data.get('city') || '').trim();
    const starts = ['yes','no'].includes(data.get('starts')) ? data.get('starts') : 'unknown';
    const stranded = ['yes','no'].includes(data.get('stranded')) ? data.get('stranded') : 'unknown';
    const symptoms = String(data.get('details') || '').trim();
    const callbackTime = String(data.get('timing') || '').trim();
    if (deviceLocation && carAddress.value !== `Current location: ${deviceLocation.latitude.toFixed(6)}, ${deviceLocation.longitude.toFixed(6)}`) deviceLocation = null;
    const carLocation = locationChoice?.value === 'dropoff'
      ? {type:'dropoff',preferredTime:String(data.get('dropoffTime') || '').trim()}
      : deviceLocation || {type:'address',address:String(data.get('carAddress') || '').trim()};
    const carLocationText = carLocation.type === 'dropoff'
      ? `Car location: Shop drop-off requested${carLocation.preferredTime ? '; preferred time: ' + carLocation.preferredTime : ''}. Shop to confirm.`
      : carLocation.type === 'device'
        ? `Car location: Current device location (${carLocation.latitude.toFixed(6)}, ${carLocation.longitude.toFixed(6)}; accuracy about ${Math.max(1,Math.round(carLocation.accuracyMeters))} metres)\nMap: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(carLocation.latitude + ',' + carLocation.longitude)}`
        : `Car location: ${carLocation.address}\nMap: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(carLocation.address)}`;
    // Keep these details useful to the existing receiver during a staged rollout.
    const context = [carLocationText,city ? `City / ZIP: ${city}` : '',`Does it drive: ${starts}`,`Stranded: ${stranded}`,callbackTime ? `Preferred timing: ${callbackTime}` : ''].filter(Boolean).join('\n');
    return { name: String(data.get('name') || '').trim(), phone: String(data.get('phone') || '').replace(/[^\d+()\s.-]/g, '').trim(), ...(window.PT_LEAD_CHANNEL ? {channel: window.PT_LEAD_CHANNEL} : {}), vehicle: String(data.get('vehicle') || '').trim() || 'Not provided; see request details', service: String(data.get('service') || ''), details: symptoms ? `${symptoms}\n\n${context}` : '', ...(locationChoice ? {carLocation} : {}), city, starts, stranded, callbackTime, source:'form', website: String(data.get('website') || ''), smsConsent: consent, smsConsentTimestamp: consent ? new Date().toISOString() : '', smsConsentVersion: '2026-09-06-v1', smsConsentSource: 'website-repair-request', smsConsentPage: location.origin + location.pathname, smsConsentDisclosure: consentDisclosure };
  };
  const makeBackup = data => {
    const callback = data.phone || 'Please reply to this text';
    const consent = !endpoint ? 'Please reply about this repair inquiry.' : data.smsConsent ? `Text-message consent: Yes\n${consentDisclosure}` : 'Text-message consent: No; please call';
    const message = `Repair inquiry for Perfect Timing Auto Repair\n\nName: ${data.name}\nCallback: ${callback}\nVehicle: ${data.vehicle}\nService: ${data.service}\n\n${data.details}\n\n${consent}${draftChannel ? '\nWebsite source: ' + draftChannel : ''}\nWebsite page context: /${sourcePage}${sourcePage ? ' (last guide or service viewed)' : ''}`;
    preview.value = message;
    refreshDraftLinks();
    backup.hidden = false;
  };
  const send = async (path, body, key, json = true) => {
    if (!endpoint) throw new Error('unavailable');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(endpoint + path, { method: 'POST', body: json ? JSON.stringify(body) : body, headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), 'Idempotency-Key': key }, signal: controller.signal, credentials: 'omit' });
      const result = await response.json();
      if (!response.ok || result.ok !== true || result.received !== true || typeof result.id !== 'string') throw new Error('unconfirmed');
      return result;
    } finally { clearTimeout(timer); }
  };
  applyMode();
  // Online only while the shop's receiver answers; otherwise the form keeps preparing a text draft.
  if (configuredEndpoint) {
    const probe = new AbortController(), probeTimer = setTimeout(() => probe.abort(), 6000);
    fetch(configuredEndpoint + '/healthz', {credentials:'omit', cache:'no-store', signal:probe.signal})
      .then(response => response.ok ? response.json() : null)
      .then(health => { if (health?.ok !== true) throw new Error('down'); mediaReady = health.media === 'ready'; applyMode(); })
      .catch(() => { if (!sentRequestId && !submit.disabled) { endpoint = ''; applyMode(); } })
      .finally(() => clearTimeout(probeTimer));
  }
  const mediaTypes = {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif',mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm'};
  const uploadMedia = async result => {
    const items = !(mediaReady && result.mediaToken) ? [] : [...(byId('request-media')?.files || [])]
      .map(file => ({file, type: Object.values(mediaTypes).includes((file.type||'').toLowerCase()) ? file.type.toLowerCase() : mediaTypes[(file.name.split('.').pop()||'').toLowerCase()] || ''}))
      .filter(item => item.type && item.file.size <= (item.type.startsWith('video/') ? 100 : 15) * 1024 * 1024).slice(0, 6);
    let sent = 0;
    for (const [n, item] of items.entries()) {
      status.textContent = `Request received. Sending photo/video ${n + 1} of ${items.length}… keep this page open.`;
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 300000);
      try { const response = await fetch(`${endpoint}/hooks/lead/media/${result.id}`, {method:'POST', credentials:'omit', headers:{'Content-Type':item.type,'X-Media-Token':result.mediaToken}, body:item.file, signal:controller.signal}); if (response.ok) sent++; }
      catch (_) { /* The request is saved; the customer can text the file instead. */ }
      finally { clearTimeout(timer); }
    }
    return {sent, total: items.length};
  };
  form.addEventListener('input', () => { requestKey = uid(); requestPayload = null; voicePayload = null; voiceKey = uid(); sentRequestId = ''; status.textContent = ''; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending) return;
    // Browser autofill can insert invisible characters without an input event.
    phoneField.value = cleanPhone(phoneField.value);
    if (carAddress && !carAddress.disabled) carAddress.setCustomValidity(carAddress.value.trim() ? '' : 'Enter the car’s address or use current location.');
    if (!form.reportValidity()) return;
    const currentData = readRequest();
    const sameContent = data => JSON.stringify({...data,smsConsentTimestamp:''});
    if (requestPayload && sameContent(currentData) !== sameContent(requestPayload)) { requestKey = uid(); requestPayload = null; sentRequestId = ''; }
    const data = requestPayload || currentData;
    if (data.website) return;
    if ((endpoint || data.phone) && !validPhone(data.phone)) { status.textContent = endpoint ? 'Please include a valid phone number with its area code.' : 'Please include a valid phone number with its area code, or leave the optional callback field blank when texting.'; phoneField.focus(); return; }
    if (!data.name || !data.details) { status.textContent = 'Please enter your name and a description of the problem. Incomplete vehicle details are okay.'; return; }
    makeBackup(data);
    requestPayload = data;
    if (!endpoint) { status.textContent = 'Your text draft is ready below. Review it, open your texting app, attach photos or a short video of the problem if you have them, and tap Send. Nothing has been sent yet. You can also copy the text, email it or call the shop.'; backup.scrollIntoView({behavior:'auto',block:'nearest'}); return; }
    const submittedKey = requestKey;
    sending = true; submit.disabled = true; submit.textContent = 'Sending…'; status.textContent = 'Sending your repair request…';
    try {
      const result = await send('/hooks/lead/webform', data, submittedKey);
      if (submittedKey !== requestKey) { status.textContent = 'The earlier request was received. Your edited details have not been sent; send again to share this update.'; submit.textContent = 'Send updated request'; return; }
      sentRequestId = result.id;
      const sentMedia = await uploadMedia(result);
      if (sentMedia.sent < sentMedia.total) { status.textContent = `Repair request received (reference ${result.id}). ${sentMedia.total - sentMedia.sent} photo/video file(s) did not go through; text them to the shop at (239) 397-2048.`; submit.textContent = 'Request received'; backup.hidden = true; return; }
      status.textContent = `Repair request received. Reference: ${result.id}. Opening your confirmation…`;
      backup.hidden = true;
      submit.textContent = 'Request received';
      // Receipt evidence contains no name, phone number, vehicle or message contents.
      try { sessionStorage.setItem('pt-last-request', JSON.stringify({ id: result.id, receivedAt: result.receivedAt || new Date().toISOString(), confirmed:true,smsConsent:data.smsConsent })); } catch (_) { status.textContent = `Repair request received and saved. Reference: ${result.id}. Keep this reference; no appointment is confirmed yet.`; return; }
      location.assign('/request-received.html');
    } catch (_) {
      status.textContent = 'We could not confirm receipt. Your details are preserved below. Retry, call (239) 397-2048, or open the text/email draft and send it yourself.';
      submit.textContent = 'Retry repair request';
    } finally { sending = false; submit.disabled = false; }
  });
  // With scripts unavailable the disabled control cannot navigate away with an unsent form.
  submit.disabled = false;
  byId('request-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(preview.value); status.textContent = 'Request copied. Paste it into your email or text message and send it to the shop.'; }
    catch (_) { preview.focus(); preview.select(); status.textContent = 'Select and copy the message above, then paste it into your email or text.'; }
  });
  let recorder, stream, chunks = [], recording, recordingUrl, stopTimer, voiceKey;
  const start = byId('voice-start'), stop = byId('voice-stop'), voiceSend = byId('voice-send'), voiceStatus = byId('voice-status');
  const releaseMic = () => { clearTimeout(stopTimer); stream?.getTracks().forEach(track => track.stop()); stream = null; };
  start.addEventListener('click', async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { voiceStatus.textContent = 'Recording is unavailable in this browser. Type your symptoms above, or record with your phone and attach the file to an email or text.'; return; }
    start.disabled = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      chunks = []; recording = null; voiceKey = uid(); voicePayload = null;
      voiceSend.hidden = true; byId('voice-preview').hidden = true; byId('voice-download').hidden = true;
      recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
      recorder.addEventListener('error', () => { releaseMic(); start.disabled = false; stop.disabled = true; voiceStatus.textContent = 'Recording failed. Please type your request or call the shop.'; });
      recorder.addEventListener('stop', () => {
        releaseMic(); start.disabled = false; stop.disabled = true;
        recording = new Blob(chunks, { type: recorder.mimeType });
        if (!recording.size) { voiceStatus.textContent = 'No audio was recorded. Try again or type your request.'; return; }
        if (recordingUrl) URL.revokeObjectURL(recordingUrl);
        recordingUrl = URL.createObjectURL(recording);
        const audio = byId('voice-preview'); audio.src = recordingUrl; audio.hidden = false;
        const download = byId('voice-download'); download.href = recordingUrl; download.download = 'perfect-timing-repair-note.' + (recording.type.includes('mp4') ? 'm4a' : recording.type.includes('ogg') ? 'ogg' : 'webm'); download.hidden = false;
        voiceSend.hidden = !endpoint; voiceStatus.textContent = 'Recording ready. Listen to it before sending, or download it to attach to an email or text.';
      });
      recorder.start(); stop.disabled = false; voiceStatus.textContent = 'Recording… stops automatically after 60 seconds.';
      stopTimer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 60000);
    } catch (_) { releaseMic(); start.disabled = false; voiceStatus.textContent = 'Microphone access was unavailable. You can type your request above or use your phone recorder.'; }
  });
  stop.addEventListener('click', () => { if (recorder?.state === 'recording') recorder.stop(); });
  voiceSend.addEventListener('click', async () => {
    if (carAddress && !carAddress.disabled) carAddress.setCustomValidity(carAddress.value.trim() ? '' : 'Enter the car’s address or use current location.');
    if ((locationChoice && !locationChoice.reportValidity()) || (carAddress && !carAddress.disabled && !carAddress.reportValidity())) { voiceStatus.textContent = 'Choose the car location or shop drop-off above before sending your recording.'; return; }
    const data = voicePayload || { ...readRequest(), source:'voice', requestId: sentRequestId };
    if (!data.name || data.phone.replace(/\D/g, '').length < 10 || !data.vehicle) { voiceStatus.textContent = 'Enter your name, phone number, and vehicle in the form above so we can respond to your recording.'; byId('request-name').focus(); return; }
    if (!recording) return;
    voicePayload = data;
    voiceSend.disabled = true; start.disabled = true; voiceStatus.textContent = 'Sending recording…';
    const upload = new FormData();
    upload.append('audio', recording, byId('voice-download').download);
    Object.entries(data).forEach(([key, value]) => upload.append(key, key === 'carLocation' ? JSON.stringify(value) : String(value)));
    try { const result = await send('/hooks/lead/voicenote', upload, voiceKey, false); voiceStatus.textContent = `Recording received. Reference: ${result.id}. Our team will follow up; your appointment is not confirmed yet.`; }
    catch (_) { voiceStatus.textContent = 'We could not confirm receipt. Retry, or download the recording and attach it to your email or text. You can also call (239) 397-2048.'; }
    finally { voiceSend.disabled = false; start.disabled = false; }
  });
  window.addEventListener('pagehide', () => { if (recorder?.state === 'recording') recorder.stop(); releaseMic(); if (recordingUrl) URL.revokeObjectURL(recordingUrl); });

  // Agent assistance fills the visible form. The customer reviews and submits it
  // through the same handler above; this tool never contacts the receiver.
  const repairToolFields = {
    details: ['request-details', 'The repair problem in the customer’s own words. Required before sending.'],
    service: ['request-service', 'The type of repair, or Diagnosis / not sure yet.'],
    starts: ['request-starts', 'Whether the vehicle can be driven: yes, no, or unknown.'],
    vehicle: ['request-vehicle', 'Vehicle year, make and model, if known.'],
    locationChoice: ['request-location-choice', 'location means the car is at an address; dropoff means asking the shop to arrange a drop-off.'],
    carAddress: ['request-car-address', 'Street address, city and parking details when locationChoice is location.'],
    dropoffTime: ['request-dropoff-time', 'Preferred time when locationChoice is dropoff; the shop must confirm it.'],
    name: ['request-name', 'The customer’s name. Required before sending.'],
    phone: ['request-phone', 'The customer’s callback number, including area code. Required for online requests.'],
    city: ['request-city', 'City or ZIP code, if known.'],
    stranded: ['request-stranded', 'Whether the customer is stranded: yes, no, or unknown.'],
    timing: ['request-timing', 'Preferred repair timing or callback time, in the customer’s words.']
  };
  const repairToolProperties = Object.fromEntries(Object.entries(repairToolFields).map(([name, [id, description]]) => {
    const field = byId(id), property = {type:'string', description};
    if (field.tagName === 'SELECT') property.enum = [...field.options].filter(option => option.value && !option.hidden).map(option => option.value);
    else if (field.maxLength > 0) property.maxLength = field.maxLength;
    return [name, property];
  }));
  const prepareRepairRequest = input => {
    const failure = (code, message, fields = []) => ({status:code, submitted:false, reviewRequired:true, message, fields});
    if (sending) return failure('busy', 'A request is being sent. Wait for its result before editing.');
    if (!input || typeof input !== 'object' || Array.isArray(input)) return failure('invalid_input', 'Provide an object containing repair form fields.');
    // Validate the entire update before changing the customer’s existing entries.
    for (const [name, value] of Object.entries(input)) {
      if (!Object.hasOwn(repairToolFields, name)) return failure('invalid_input', 'Use only the listed repair form fields.', [name]);
      const property = repairToolProperties[name];
      if (typeof value !== 'string' || (property.maxLength && value.length > property.maxLength) || (property.enum && !property.enum.includes(value))) return failure('invalid_input', `Provide a valid value for ${name}.`, [name]);
      if (name === 'phone' && value.trim() && !validPhone(cleanPhone(value))) return failure('invalid_input', 'Include a valid callback number with its area code.', [name]);
    }
    const chosenLocation = input.locationChoice ?? locationChoice.value;
    if (Object.hasOwn(input, 'carAddress') && chosenLocation !== 'location') return failure('invalid_input', 'Choose location when providing the car’s address.', ['locationChoice']);
    if (Object.hasOwn(input, 'dropoffTime') && chosenLocation !== 'dropoff') return failure('invalid_input', 'Choose dropoff when providing a preferred drop-off time.', ['locationChoice']);
    if (Object.hasOwn(input, 'locationChoice') && locationChoice.value !== input.locationChoice) {
      locationChoice.value = input.locationChoice;
      locationChoice.dispatchEvent(new Event('input', {bubbles:true}));
      locationChoice.dispatchEvent(new Event('change', {bubbles:true}));
    }
    for (const [name, value] of Object.entries(input)) {
      if (name === 'locationChoice') continue;
      const field = byId(repairToolFields[name][0]);
      const nextValue = name === 'phone' ? cleanPhone(value) : value;
      // Repeating a preparation must retain an uncertain submission’s retry key.
      if (field.value === nextValue) continue;
      field.value = nextValue;
      field.dispatchEvent(new Event('input', {bubbles:true}));
      field.dispatchEvent(new Event('change', {bubbles:true}));
      const options = field.closest('details');
      if (options) options.open = true;
    }
    // Native constraints plus the same phone/address rules used on human submit.
    if (!carAddress.disabled) carAddress.setCustomValidity(carAddress.value.trim() ? '' : 'Enter the car’s address or use current location.');
    const incomplete = Object.entries(repairToolFields).filter(([, [id]]) => {
      const field = byId(id);
      return !field.disabled && ((!field.value.trim() && field.required) || !field.checkValidity());
    }).map(([name]) => name);
    if ((endpoint || phoneField.value.trim()) && !validPhone(cleanPhone(phoneField.value)) && !incomplete.includes('phone')) incomplete.push('phone');
    const ready = incomplete.length === 0;
    const message = ready
      ? endpoint ? 'Review the form and choose Send repair request. The shop must confirm appointments.' : 'Review the form and choose Prepare text to the shop, then send the draft yourself.'
      : 'Complete the listed fields, then review the form before sending.';
    status.textContent = `${message} Nothing has been sent by the agent.`;
    form.scrollIntoView({behavior:'auto', block:'nearest'});
    (ready ? submit : byId(repairToolFields[incomplete[0]][0])).focus();
    return {status:ready ? 'ready_for_review' : 'needs_details', submitted:false, reviewRequired:true, message, fields:incomplete};
  };
  let repairToolRegistration;
  const registerRepairTool = () => {
    const context = document.modelContext;
    if (repairToolRegistration || typeof context?.registerTool !== 'function') return;
    const controller = new AbortController();
    repairToolRegistration = controller;
    try {
      Promise.resolve(context.registerTool({
        name:'prepare_repair_request',
        description:'Fill the visible Perfect Timing Auto Repair intake form with customer-provided repair and contact details. Preserves omitted fields and returns missing fields or readiness for customer review and manual submission.',
        inputSchema:{type:'object', properties:repairToolProperties, additionalProperties:false},
        execute:prepareRepairRequest,
        annotations:{readOnlyHint:false, consequentialHint:false, untrustedContentHint:false}
      }, {signal:controller.signal})).catch(() => { if (repairToolRegistration === controller) repairToolRegistration = null; });
    } catch (_) { repairToolRegistration = null; /* Ordinary form use remains available. */ }
  };
  registerRepairTool();
  window.addEventListener('pagehide', () => { repairToolRegistration?.abort(); repairToolRegistration = null; });
  window.addEventListener('pageshow', event => { if (event.persisted) registerRepairTool(); });
})();
