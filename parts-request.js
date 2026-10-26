(() => {
  'use strict';
  const form = document.getElementById('partsForm');
  if (!form) return;
  const el = id => document.getElementById('parts-' + id);
  // Production uses the existing cloud config. Local previews stay offline unless
  // their isolated preview server explicitly provides a mock receiver.
  const endpoint = (window.PT_CONTACT_CONFIG?.endpoint || '').replace(/\/$/, '');
  let sending = false, snapshot = '', key = '', savedSnapshot = '';
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  form.addEventListener('input', () => { if (!sending) el('status').textContent = ''; });
  for (const name of ['name', 'vehicle', 'description']) {
    const field = form.elements.namedItem(name);
    field.addEventListener('input', () => field.setCustomValidity(''));
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending) return;
    for (const name of ['name', 'vehicle', 'description']) {
      const field = form.elements.namedItem(name);
      field.setCustomValidity(field.value.trim() ? '' : 'Please enter this detail.');
    }
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const text = name => String(data.get(name) || '').trim();
    const phone = text('phone').replace(/[^\d+()\s.-]/g, '');
    if (!/^\d{10,15}$/.test(phone.replace(/\D/g, ''))) {
      el('status').textContent = 'Enter a valid phone number so the mechanic can call you.';
      el('phone').focus(); return;
    }
    const payload = {
      requestType:'parts', name:text('name'), phone, vehicle:text('vehicle'),
      service:'Parts quote', details:text('details'), email:text('email'),
      parts:{description:text('description'),quantity:Number(text('quantity')),vin:text('vin').toUpperCase(),partNumber:text('partNumber'),fulfillment:text('fulfillment')},
      source:'form', smsConsent:false, website:text('website'),
      ...(window.PT_LEAD_CHANNEL ? {channel:window.PT_LEAD_CHANNEL} : {})
    };
    const serialized = JSON.stringify(payload);
    if (savedSnapshot === serialized) return;
    if (serialized !== snapshot) { snapshot = serialized; key = uid(); }
    if (!endpoint) {
      el('status').textContent = 'Online requests are temporarily unavailable. Your entries are still here. Please try again or call (239) 397-2048.';
      el('submit').textContent = 'Retry Parts Quote Request';
      return;
    }
    sending = true; el('submit').disabled = true;
    form.setAttribute('aria-busy', 'true');
    el('status').textContent = 'Sending parts quote request…';
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(endpoint + '/hooks/lead/webform', {
        method:'POST', headers:{'Content-Type':'application/json','Idempotency-Key':key},
        body:serialized, credentials:'omit', signal:controller.signal
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true || result.received !== true ||
          typeof result.id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(result.id)) throw Error('unconfirmed');
      savedSnapshot = serialized;
      el('status').textContent = `Parts quote request received and saved. Reference: ${result.id}. No order is confirmed.`;
      el('submit').textContent = 'Parts Quote Request Saved';
      // Receipt storage contains no name, phone, vehicle, VIN or part description.
      try {
        sessionStorage.setItem('pt-last-request', JSON.stringify({id:result.id,receivedAt:result.receivedAt || new Date().toISOString(),confirmed:true,requestType:'parts',smsConsent:false}));
      } catch (_) { return; }
      location.assign('/request-received.html');
    } catch (_) {
      el('status').textContent = 'We could not confirm receipt. Your entries are still here. Please try again or call (239) 397-2048.';
      el('submit').textContent = 'Retry Parts Quote Request';
    } finally {
      clearTimeout(timer); sending = false; el('submit').disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
  el('submit').disabled = false;
})();
