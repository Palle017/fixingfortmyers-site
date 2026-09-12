(() => {
  'use strict';
  const form = document.getElementById('careers-form');
  const draft = document.getElementById('careers-draft');
  const message = document.getElementById('careers-message');
  const status = document.getElementById('careers-status');
  const email = document.getElementById('careers-email-draft');
  const phone = form.elements.namedItem('phone');
  form.addEventListener('input', () => {
    phone.setCustomValidity('');
    draft.hidden = true;
    status.textContent = '';
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    phone.setCustomValidity(phone.value.replace(/\D/g, '').length < 10 ? 'Please include your area code and phone number.' : '');
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const get = name => String(values.get(name) || '').trim();
    message.value = `Careers introduction for Perfect Timing Auto Repair\n\nName: ${get('name')}\nPhone: ${get('phone')}\nEmail: ${get('email')}\nArea of interest: ${get('role')}\nHands-on experience: ${get('experience')}\n\n${get('details')}`;
    email.href = `mailto:fixingfortmyers@gmail.com?subject=${encodeURIComponent('Careers introduction: ' + get('role'))}&body=${encodeURIComponent(message.value)}`;
    draft.hidden = false;
    status.textContent = 'Draft prepared. Nothing has been sent. Open the email draft and send it from your email app.';
    document.getElementById('draft-heading').focus();
  });
  document.getElementById('careers-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(message.value);
      status.textContent = 'Introduction copied. Paste it into an email to fixingfortmyers@gmail.com and send it to the shop.';
    } catch (_) {
      message.focus();
      message.select();
      status.textContent = 'Select and copy the introduction above, then paste it into your email.';
    }
  });
})();
