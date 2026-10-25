// Calm, mobile-first helpers for the single repair request form (#bookingForm).
// Submission stays in site.js; this file only fills the same field names the
// cloud intake already reads (vehicle, details, service, locationChoice).
(() => {
  'use strict';
  const field = id => document.getElementById(id);
  // Visible year / make / model and the problem line, for the short text to Tony.
  window.ptCalmRepairSummary = () => {
    const year = field('request-vehicle-year')?.value.trim() || '';
    const make = field('request-vehicle-make')?.value.trim() || '';
    const model = field('request-vehicle-model')?.value.trim() || '';
    const joined = [year, make, model].filter(Boolean).join(' ');
    const lines = String(field('request-details')?.value || '').split('\n').map(line => line.trim()).filter(Boolean);
    const first = (lines[0] || '').replace(/^Problem:\s*/, '');
    const rest = lines.slice(1).join(' ');
    return {
      name: field('request-name')?.value || '',
      vehicle: joined || field('request-vehicle')?.value || '',
      problem: [first, rest].filter(Boolean).join('. ')
    };
  };
  const init = () => {
    const form = document.getElementById('bookingForm');
    if (!form || form.dataset.intakeVersion === '1' || form.dataset.calm) return;
    form.dataset.calm = '1';
    const $ = id => document.getElementById(id);
    const fire = el => { el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); };

    // Vehicle: three small boxes feed the existing "vehicle" field.
    const vehicle = $('request-vehicle'), parts = ['year', 'make', 'model'].map(p => $('request-vehicle-' + p));
    const syncVehicle = () => {
      if (!vehicle) return;
      const v = parts.map(p => (p?.value || '').trim()).filter(Boolean).join(' ');
      if (vehicle.value !== v) { vehicle.value = v; vehicle.dataset.userEdited = 'true'; fire(vehicle); }
    };
    parts.forEach(p => p?.addEventListener('input', syncVehicle));
    const showVehicle = () => {
      if (!vehicle || !parts.every(Boolean) || parts.map(p => p.value.trim()).filter(Boolean).join(' ') === vehicle.value.trim()) return;
      const m = vehicle.value.match(/^((?:19|20)\d{2})?\s*(\S+)?\s*(.*)$/) || [];
      parts[0].value = m[1] || ''; parts[1].value = m[2] || ''; parts[2].value = m[3] || '';
    };
    showVehicle();
    vehicle?.addEventListener('change', showVehicle);
    // Browser/agent autofill may set values without dispatching input events.
    form.addEventListener('pt:repair-sync', syncVehicle);

    // Problem chips: a plain first line in the customer's own notes.
    const details = $('request-details'), service = $('request-service');
    const chips = [...form.querySelectorAll('.request-chip')];
    const PREFIX = 'Problem: ';
    const syncIssue = () => {
      if (!details) return;
      const picked = chips.filter(c => c.getAttribute('aria-pressed') === 'true');
      const lines = details.value.split('\n');
      if (lines[0].startsWith(PREFIX)) lines.shift();
      const rest = lines.join('\n');
      details.value = (picked.length ? PREFIX + picked.map(c => c.dataset.issue).join(', ') + (rest ? '\n' : '') : '') + rest;
      fire(details);
      const svc = picked.map(c => c.dataset.service).find(Boolean);
      if (service && !service.dataset.userEdited) {
        const want = svc || 'Diagnosis / not sure yet';
        if ([...service.options].some(o => o.value === want) && service.value !== want) { service.value = want; fire(service); }
      }
      clearError(details);
    };
    chips.forEach(c => c.addEventListener('click', () => { c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); syncIssue(); }));
    service?.addEventListener('change', e => { if (e.isTrusted) service.dataset.userEdited = 'true'; });

    // Come to me / I'll bring it in drive the existing locationChoice select.
    const choice = $('request-location-choice');
    const where = form.querySelector('.request-where');
    if (choice && where) {
      choice.closest('label')?.setAttribute('hidden', '');
      // Show the follow-up (car address or drop-off time) right under the choice.
      ['request-car-location', 'request-dropoff'].forEach(id => { const el = $(id); if (el) where.appendChild(el); });
      form.querySelectorAll('input[name="repairWhere"]').forEach(r => {
        r.checked = r.value === choice.value;
        r.addEventListener('change', () => { if (r.checked && choice.value !== r.value) { choice.value = r.value; fire(choice); } });
      });
      choice.addEventListener('change', () => form.querySelectorAll('input[name="repairWhere"]').forEach(r => { r.checked = r.value === choice.value; }));
    }

    // Inline validation with plain words, shown after the person leaves a field.
    const digits = v => v.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    const rules = {
      'request-name': v => v.trim() ? '' : 'Please add your name so Tony knows who to ask for.',
      'request-phone': v => !v.trim() ? 'Please add a phone number so Tony can call you back.' : digits(v).length !== 10 ? 'That number looks short. Please include the area code, like 239 555 0123.' : '',
      'request-vehicle-year': v => !v.trim() || /^(19|20)\d{2}$/.test(v.trim()) ? '' : 'Year should be four digits, like 2018. Leave it blank if you’re not sure.',
    };
    const errorFor = el => $(el.getAttribute('aria-describedby')?.split(' ').find(id => id.endsWith('-error')) || '');
    const showError = (el, msg) => { const box = errorFor(el); if (!box) return; box.textContent = msg; box.hidden = !msg; el.setAttribute('aria-invalid', msg ? 'true' : 'false'); };
    function clearError(el) { if (el.getAttribute('aria-invalid') === 'true') check(el); }
    const check = el => { const msg = rules[el.id]?.(el.value) || ''; showError(el, msg); return !msg; };
    Object.keys(rules).forEach(id => {
      const el = $(id); if (!el) return;
      el.addEventListener('blur', () => { if (el.value || el.dataset.touched) check(el); el.dataset.touched = '1'; });
      el.addEventListener('input', () => clearError(el));
    });
    form.addEventListener('submit', e => {
      const bad = Object.keys(rules).map($).filter(Boolean).filter(el => !check(el));
      if (bad.length) {
        e.preventDefault(); e.stopImmediatePropagation(); bad[0].focus();
        if (e.agentInvoked && typeof e.respondWith === 'function') e.respondWith(Promise.resolve({
          status:'validation_error', submitted:false, receiptConfirmed:false,
          fields:bad.map(el => el.name || el.id), message:'Review and correct the highlighted fields. Nothing has been sent.'
        }));
      }
    }, true);

    // Calm confirmation: repeat back the vehicle and problem the person sent.
    const done = $('request-done'), summary = $('request-done-summary');
    if (done && summary) new MutationObserver(() => {
      if (done.hidden) return;
      const v = (vehicle?.value || '').trim();
      const issue = (details?.value.split('\n')[0] || '').replace(PREFIX, '').trim().slice(0, 120);
      summary.textContent = [v && 'Vehicle: ' + v, issue && 'Problem: ' + issue].filter(Boolean).join(' · ');
      summary.hidden = !summary.textContent;
      if (typeof window.ptRefreshTonyText === 'function') window.ptRefreshTonyText();
    }).observe(done, {attributes: true, attributeFilter: ['hidden']});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
