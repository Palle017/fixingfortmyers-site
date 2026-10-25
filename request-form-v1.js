// Five-field callback request. No customer data is stored in browser storage or logs.
(() => {
  'use strict';
  const form = document.getElementById('bookingForm');
  if (form?.dataset.intakeVersion !== '1') return;
  const $ = id => document.getElementById(id);
  const submit = $('request-submit');
  const status = $('request-status');
  const endpoint = String(window.PT_CONTACT_CONFIG?.requestEndpoint || '').trim();
  const preferences = new Set(['asap', 'today', 'tomorrow', 'next_week', 'specific']);
  let inFlight = false, attempt = null;
  const offer = document.getElementById('request-oil-offer');
  if (offer) offer.hidden = new URLSearchParams(location.search).get('offer') !== 'liquimoly-labor50';
  // Keep native constraints for no-JS users; JS adds all three inline errors at once.
  form.noValidate = true;
  if (endpoint) form.action = endpoint;
  const rules = {
    'request-name': value => value.trim() ? '' : 'Enter your name.',
    'request-phone': value => /^(?:\+1)?[0-9]{10}$/.test(value.trim()) ? '' : 'Enter 10 digits, or +1 followed by 10 digits.',
    'request-vehicle': value => value.trim() ? '' : 'Enter your vehicle’s year, make and model.'
  };
  const validate = id => {
    const input = $(id), message = rules[id](input.value);
    $(id + '-error').textContent = message;
    $(id + '-error').hidden = !message;
    input.setAttribute('aria-invalid', String(Boolean(message)));
    return !message;
  };
  for (const id of Object.keys(rules)) {
    $(id).addEventListener('blur', () => validate(id));
    $(id).addEventListener('input', () => {
      if ($(id).getAttribute('aria-invalid') === 'true' && !rules[id]($(id).value)) validate(id);
    });
  }
  const vin = $('request-vin');
  const normalizeVin = () => { vin.value = vin.value.toUpperCase(); };
  vin.addEventListener('input', normalizeVin);
  vin.addEventListener('blur', () => {
    normalizeVin();
    $('request-vin-help').textContent = vin.value && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin.value)
      ? 'A VIN usually has 17 letters and numbers (no I, O or Q). You can still send this request.'
      : '17 characters, if known. You can send your request without a valid VIN.';
    // Advisory only. Never set custom validity or block submission on VIN format.
  });
  form.querySelectorAll('[name="callback_preference"]').forEach(radio => radio.addEventListener('change', () => {
    $('request-callback-time').hidden = !form.querySelector('#callback-specific').checked;
  }));
  const callbackPreference = () => {
    const value = form.querySelector('[name="callback_preference"]:checked')?.value;
    return preferences.has(value) ? value : 'asap';
  };
  const payload = () => {
    const preference = callbackPreference();
    const localTime = preference === 'specific' ? $('request-callback-at').value : '';
    const date = localTime ? new Date(localTime) : null;
    return {
      name: $('request-name').value.trim(), phone: $('request-phone').value.trim(),
      vehicle: $('request-vehicle').value.trim(), vin: vin.value.trim().toUpperCase() || null,
      callback_preference: preference,
      callback_at: date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
      source: 'site_form_v1'
    };
  };
  const track = event => window.PT_TRACK?.(event, {placement:'form'});
  form.addEventListener('input', () => track('form_start'), {once:true});
  const invalidateDraft = () => {
    $('request-email').hidden = true;
    $('request-email').href = 'mailto:fixingfortmyers@gmail.com';
    if (!inFlight) status.textContent = '';
  };
  form.addEventListener('input', invalidateDraft);
  form.addEventListener('change', invalidateDraft);
  const confirm = data => {
    if (offer) offer.hidden = true;
    const when = {asap:'ASAP', today:'ASAP', tomorrow:'by tomorrow', next_week:'next week', specific:'ASAP'}[data.callback_preference];
    $('request-done-heading').textContent = `Got it, ${data.name}. Tony calls back ${when}.`;
    form.hidden = true;
    $('request-heading').hidden = true;
    $('request-review-note').hidden = true;
    $('request-done').hidden = false;
    $('repair-request-dialog')?.setAttribute('aria-labelledby', 'request-done-heading');
    $('request-done-heading').focus();
    track('form_submit_success');
  };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (inFlight || form.hidden) return;
    const invalid = Object.keys(rules).filter(id => !validate(id));
    if (invalid.length) { $(invalid[0]).focus(); track('form_validation_error'); return; }
    const data = payload(), fingerprint = JSON.stringify(data);
    if (!attempt || attempt.fingerprint !== fingerprint) attempt = {
      fingerprint, data: {...data, submitted_at: new Date().toISOString()},
      key: crypto.randomUUID()
    };
    const current = attempt;
    if (!endpoint) {
      const href = 'mailto:fixingfortmyers@gmail.com?subject=' + encodeURIComponent('Repair callback request') + '&body=' + encodeURIComponent(JSON.stringify(current.data, null, 2));
      $('request-email').href = href;
      $('request-email').hidden = false;
      status.textContent = 'Your email draft is ready. Send it from your email app to request a callback. Your request has not been sent from this page.';
      window.location.href = href;
      return;
    }
    inFlight = true;
    submit.disabled = true;
    submit.textContent = 'Sending…';
    form.setAttribute('aria-busy', 'true');
    status.textContent = '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      track('form_submit_attempt');
      const response = await fetch(endpoint, {
        method:'POST', headers:{'Content-Type':'application/json', 'Idempotency-Key':current.key},
        body:JSON.stringify(current.data), credentials:'omit', referrerPolicy:'no-referrer', signal:controller.signal
      });
      if (!response.ok) throw new Error('http_failure');
      const receipt = await response.json();
      if (receipt?.ok !== true || receipt.received !== true || typeof receipt.id !== 'string' || !receipt.id.trim()) throw new Error('unacknowledged');
      confirm(current.data);
    } catch (_) {
      status.textContent = 'We could not confirm your request. Your details are still here. Please try again.';
      submit.textContent = 'Retry request';
      // A backend error body or thrown exception may contain PII: log a fixed message only.
      console.error('Repair request submission failed.');
      track('form_submit_error');
    } finally {
      clearTimeout(timeout);
      inFlight = false;
      submit.disabled = false;
      form.removeAttribute('aria-busy');
      if (form.hidden) submit.textContent = 'Send request';
    }
  });
})();
