(() => {
  'use strict';
  // Anonymous browser counts; never include form values or URL query strings.
  const metricsEndpoint = (window.PT_CONTACT_CONFIG?.endpoint || 'https://redline.taild5f39d.ts.net:10000').replace(/\/$/, '');
  if (/^(www\.)?fixingfortmyers\.com$/.test(location.hostname)) {
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
  const brandVideo = document.querySelector('.bang-video-wrap video');
  if (brandVideo) {
    brandVideo.removeAttribute('autoplay');
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
      new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) brandVideo.play().catch(() => {}); else brandVideo.pause(); }), { threshold: .25 }).observe(brandVideo);
    } else { brandVideo.pause(); brandVideo.controls = true; }
  }
  const form = byId('bookingForm');
  if (!form) return;
  const endpoint = (window.PT_CONTACT_CONFIG?.endpoint || '').replace(/\/$/, '');
  const status = byId('request-status');
  const submit = byId('request-submit');
  const backup = byId('request-backup');
  const preview = byId('request-preview');
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let requestKey = uid();
  let sentRequestId = '';
  let requestPayload = null, voicePayload = null;
  const consentDisclosure = 'Yes, I agree to receive text messages from Perfect Timing Auto Repair LLC at the number provided about my inquiry, estimates, scheduling, and service updates.';
  const readRequest = () => {
    const data = new FormData(form);
    const consent = byId('request-sms-consent').checked;
    return { name: String(data.get('name')).trim(), phone: String(data.get('phone')).trim(), vehicle: String(data.get('vehicle')).trim(), service: String(data.get('service')), details: String(data.get('details')).trim(), website: String(data.get('website') || ''), smsConsent: consent, smsConsentTimestamp: consent ? new Date().toISOString() : '', smsConsentVersion: '2026-09-06-v1', smsConsentSource: 'website-repair-request', smsConsentPage: location.origin + location.pathname, smsConsentDisclosure: consentDisclosure };
  };
  const makeBackup = data => {
    const message = `Repair inquiry for Perfect Timing Auto Repair\n\nName: ${data.name}\nPhone: ${data.phone}\nVehicle: ${data.vehicle}\nService: ${data.service}\n\n${data.details}\n\nText-message consent: ${data.smsConsent ? 'Yes' : 'No; please call'}\n${data.smsConsent ? consentDisclosure : ''}`;
    preview.value = message;
    byId('request-email').href = `mailto:fixingfortmyers@gmail.com?subject=${encodeURIComponent('Repair inquiry: ' + data.vehicle)}&body=${encodeURIComponent(message)}`;
    backup.hidden = false;
  };
  const send = async (path, body, key, json = true) => {
    if (!endpoint) throw new Error('unavailable');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(endpoint + path, { method: 'POST', body: json ? JSON.stringify(body) : body, headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), 'Idempotency-Key': key }, signal: controller.signal, credentials: 'omit' });
      const result = await response.json();
      if (!response.ok || result.ok !== true || typeof result.id !== 'string') throw new Error('unconfirmed');
      return result;
    } finally { clearTimeout(timer); }
  };
  if (!endpoint) { submit.textContent = 'Prepare repair request'; byId('request-instructions').textContent = 'Prepare your details, then send them using your email app. You can also call or text the shop directly. An appointment is confirmed only after our team replies.'; }
  form.addEventListener('input', () => { requestKey = uid(); requestPayload = null; voicePayload = null; voiceKey = uid(); sentRequestId = ''; status.textContent = ''; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = requestPayload || readRequest();
    if (data.website) return;
    if (data.phone.replace(/\D/g, '').length < 10) { status.textContent = 'Please include your area code and phone number.'; byId('request-phone').focus(); return; }
    if (!data.name || !data.vehicle || !data.details) { status.textContent = 'Please enter your name, vehicle, and a description of the problem.'; return; }
    makeBackup(data);
    requestPayload = data;
    if (!endpoint) { status.textContent = 'Your email draft is ready below. Open it and send it from your email app; nothing has been sent yet.'; return; }
    const submittedKey = requestKey;
    submit.disabled = true; submit.textContent = 'Sending…'; status.textContent = 'Sending your repair request…';
    try {
      const result = await send('/hooks/lead/webform', data, submittedKey);
      if (submittedKey !== requestKey) { status.textContent = 'The earlier request was received. Your edited details have not been sent; send again to share this update.'; submit.textContent = 'Send updated request'; return; }
      sentRequestId = result.id;
      status.textContent = `Repair request received. Reference: ${result.id}. Our team will follow up; your appointment is not confirmed yet.`;
      backup.hidden = true;
      submit.textContent = 'Request received';
    } catch (_) {
      status.textContent = 'We could not confirm receipt. Your details are preserved below. Retry, call (239) 397-2048, or open the email draft and send it from your email app.';
      submit.textContent = 'Retry repair request';
    } finally { submit.disabled = false; }
  });
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
    const data = voicePayload || { ...readRequest(), requestId: sentRequestId };
    if (!data.name || data.phone.replace(/\D/g, '').length < 10 || !data.vehicle) { voiceStatus.textContent = 'Enter your name, phone number, and vehicle in the form above so we can respond to your recording.'; byId('request-name').focus(); return; }
    if (!recording) return;
    voicePayload = data;
    voiceSend.disabled = true; start.disabled = true; voiceStatus.textContent = 'Sending recording…';
    const upload = new FormData();
    upload.append('audio', recording, byId('voice-download').download);
    Object.entries(data).forEach(([key, value]) => upload.append(key, String(value)));
    try { const result = await send('/hooks/lead/voicenote', upload, voiceKey, false); voiceStatus.textContent = `Recording received. Reference: ${result.id}. Our team will follow up; your appointment is not confirmed yet.`; }
    catch (_) { voiceStatus.textContent = 'We could not confirm receipt. Retry, or download the recording and attach it to your email or text. You can also call (239) 397-2048.'; }
    finally { voiceSend.disabled = false; start.disabled = false; }
  });
  window.addEventListener('pagehide', () => { if (recorder?.state === 'recording') recorder.stop(); releaseMic(); if (recordingUrl) URL.revokeObjectURL(recordingUrl); });
})();
