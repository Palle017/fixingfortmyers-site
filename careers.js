(() => {
  'use strict';
  const form = document.getElementById('careers-form');
  if (!form) return;
  const status = document.getElementById('careers-status');
  const submit = document.getElementById('careers-submit');
  const phone = form.elements.namedItem('phone');
  const endpoint = 'https://formsubmit.co/ajax/fixingfortmyers@gmail.com';
  let sending = false, received = false;
  form.addEventListener('input', event => {
    phone.setCustomValidity('');
    event.target.removeAttribute('aria-invalid');
    if (!sending) {
      status.textContent = '';
      received = false;
      submit.disabled = false;
      submit.textContent = 'Send application';
    }
  });
  form.addEventListener('invalid', event => {
    event.target.setAttribute('aria-invalid', 'true');
    status.textContent = 'Please complete all fields and check your email address and phone number. These details have not been sent.';
  }, true);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending || received) return;
    phone.setCustomValidity(/^\d{10,15}$/.test(phone.value.replace(/\D/g, '')) ? '' : 'Please include your area code and a valid phone number.');
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const get = name => String(values.get(name) || '').trim();
    const data = {name:get('name'),phone:get('phone'),email:get('email'),role:get('role'),experience:get('experience'),details:get('details'),website:get('website')};
    if (data.website) return;
    if (!data.name || !data.details) {
      status.textContent = 'Please enter your name and tell us about your experience. Your application has not been sent.';
      return;
    }
    sending = true;
    form.setAttribute('aria-busy', 'true');
    submit.disabled = true;
    submit.textContent = 'Sending application…';
    status.textContent = 'Sending your application. Please keep this page open.';
    const fields = [...form.querySelectorAll('input, select, textarea')];
    fields.forEach(field => { field.disabled = true; });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(endpoint, {
        method:'POST', credentials:'omit', headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify({...data,_subject:'Careers application - Perfect Timing',_template:'table',_replyto:data.email,_url:'https://fixingfortmyers.com/careers'}), signal:controller.signal
      });
      const result = await response.json();
      const reply = String(result.message || '');
      if (/activat|confirm your email|check your email|verify your email/i.test(reply)) throw new Error('activation');
      if (!response.ok || ![true, 'true'].includes(result.success)) throw new Error('Receipt not confirmed');
      received = true;
      status.textContent = 'Application received. Thank you for applying to Perfect Timing Auto Repair.';
      submit.textContent = 'Application received';
      window.alert('IT guy says application received');
    } catch (error) {
      status.textContent = error.message === 'activation'
        ? 'The shop is finishing email setup. Your application has not been confirmed. Your details are preserved; retry later, email fixingfortmyers@gmail.com, or call (239) 397-2048.'
        : 'We could not confirm that your application was received. Your details are preserved. Retry below, email fixingfortmyers@gmail.com, or call (239) 397-2048.';
      submit.textContent = 'Retry application';
    } finally {
      clearTimeout(timeout);
      sending = false;
      form.removeAttribute('aria-busy');
      fields.forEach(field => { field.disabled = false; });
      submit.disabled = received;
    }
  });
  submit.disabled = false;
})();
