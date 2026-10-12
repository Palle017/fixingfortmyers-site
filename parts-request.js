(() => {
  'use strict';
  const form = document.getElementById('partsForm');
  if (!form) return;
  const el = id => document.getElementById('parts-' + id);
  // Production uses the existing cloud config. Local previews stay offline unless
  // their isolated preview server explicitly provides a mock receiver.
  const endpoint = (window.PT_CONTACT_CONFIG?.endpoint || '').replace(/\/$/, '');
  const mirrorEndpoint = (window.PT_CONTACT_CONFIG?.mirrorEndpoint || '').replace(/\/$/, '');
  const mirrorRequired = /^(www\.)?fixingfortmyers\.com$/.test(location.hostname);
  let sending = false, snapshot = '', key = '', savedSnapshot = '', cloudReceipt = null;
  let formVersion = 0;
  form.addEventListener('input', () => { formVersion++; });
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  const updateDraftLinks = () => {
    const draft = el('preview').value;
    const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    el('text').href = `sms:+12393972048${apple ? '&' : '?'}body=${encodeURIComponent(draft)}`;
    el('email-draft').href = `mailto:fixingfortmyers@gmail.com?subject=${encodeURIComponent('Parts quote request')}&body=${encodeURIComponent(draft)}`;
  };
  el('preview').addEventListener('input', updateDraftLinks);
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
    if (serialized !== snapshot) { snapshot = serialized; key = uid(); cloudReceipt = null; }
    const submittedVersion = formVersion;
    el('preview').value = `Parts quote request (no order confirmed)\nName: ${payload.name}\nPhone: ${phone}\nVehicle: ${payload.vehicle}\nPart: ${payload.parts.description}\nQuantity: ${payload.parts.quantity}\nVIN: ${payload.parts.vin || 'Not provided'}\nPart number: ${payload.parts.partNumber || 'Not provided'}\nFulfillment: ${payload.parts.fulfillment}\nEmail: ${payload.email || 'Not provided'}\n${payload.details}`;
    updateDraftLinks();
    if (!endpoint) {
      el('backup').hidden = false;
      el('status').textContent = 'Online requests are unavailable. Open a draft and send it yourself, or call the shop.';
      return;
    }
    sending = true; el('submit').disabled = true;
    el('status').textContent = 'Sending parts quote request…';
    try {
      let result = cloudReceipt;
      if (!result) {
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 18000);
        try {
          const response = await fetch(endpoint + '/hooks/lead/webform', {
            method:'POST', headers:{'Content-Type':'application/json','Idempotency-Key':key},
            body:serialized, credentials:'omit', signal:controller.signal
          });
          result = await response.json();
          if (!response.ok || result?.ok !== true || result.received !== true ||
              typeof result.id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(result.id)) throw Error('unconfirmed');
          cloudReceipt = result;
        } finally { clearTimeout(timer); }
      }
      if (mirrorRequired) {
        if (!mirrorEndpoint) throw Error('shop inbox route unavailable');
        const partDetails = [
          `Part requested: ${payload.parts.description}`,
          `Quantity: ${payload.parts.quantity}`,
          `VIN: ${payload.parts.vin || 'Not provided'}`,
          `Part number: ${payload.parts.partNumber || 'Not provided'}`,
          `Fulfillment: ${payload.parts.fulfillment}`,
          `Contact email: ${payload.email || 'Not provided'}`,
          payload.channel ? `Website source: ${payload.channel}` : '',
          payload.details ? `Customer notes: ${payload.details}` : '',
          `Website receipt: ${result.id}`
        ].filter(Boolean).join('\n');
        const mirrored = {...payload, details:partDetails};
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(mirrorEndpoint + '/hooks/lead/webform', {
            method:'POST', headers:{'Content-Type':'application/json','Idempotency-Key':key},
            body:JSON.stringify(mirrored), credentials:'omit', signal:controller.signal
          });
          let localReceipt = null;
          try { localReceipt = await response.json(); } catch (_) { /* No receipt. */ }
          if (!response.ok || localReceipt?.ok !== true || localReceipt.received !== true ||
              typeof localReceipt.id !== 'string') throw Error('shop inbox unconfirmed');
        } finally { clearTimeout(timer); }
      }
      savedSnapshot = serialized;
      if (submittedVersion !== formVersion) {
        el('status').textContent = `Your earlier parts request was saved (reference ${result.id}). Your changed details have not been sent; send again to share the update.`;
        el('submit').textContent = 'Send Updated Parts Request';
        return;
      }
      el('backup').hidden = true;
      el('status').textContent = `Parts quote request received and saved. Reference: ${result.id}. No order is confirmed.`;
      el('submit').textContent = 'Parts Quote Request Saved';
      // Receipt storage contains no name, phone, vehicle, VIN or part description.
      try {
        sessionStorage.setItem('pt-last-request', JSON.stringify({id:result.id,receivedAt:result.receivedAt || new Date().toISOString(),confirmed:true,requestType:'parts',smsConsent:false}));
      } catch (_) { return; }
      location.assign('/request-received.html');
    } catch (error) {
      el('backup').hidden = false;
      if (cloudReceipt && mirrorRequired) {
        console.warn('Bay One website parts delivery unconfirmed', {reference:cloudReceipt.id});
        el('status').textContent = `Your parts request was saved online (reference ${cloudReceipt.id}), but the shop inbox has not confirmed it. Call or text (239) 397-2048, email the draft below, or retry shop delivery here.`;
        el('submit').textContent = 'Retry Shop Delivery';
      } else {
        el('status').textContent = 'We could not confirm receipt. Your entries are preserved. Retry, send the draft yourself, or call (239) 397-2048.';
        el('submit').textContent = 'Retry Parts Quote Request';
      }
    } finally {
      sending = false; el('submit').disabled = false;
    }
  });
  el('submit').disabled = false;
})();
