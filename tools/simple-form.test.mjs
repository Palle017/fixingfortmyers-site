// Short repair form states against a synthetic intake. No live network, leads or alerts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM, VirtualConsole} from 'jsdom';

const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const script = fs.readFileSync(new URL('site.js', root), 'utf8');
const id = '12345678-1234-4234-8234-123456789012';
const settle = async () => { for (let n = 0; n < 6; n++) await new Promise(setImmediate); };
const response = (body, status = 200) => ({ok:status >= 200 && status < 300, status, json:async () => body});
const saved = (extra = {}) => response({ok:true, received:true, id, receivedAt:new Date().toISOString(), ...extra}, 201);

function setup(t, {handler, mediaHandler, media = false, url = 'https://preview.invalid/', referrer} = {}) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!/Not implemented: navigation/.test(error.message)) errors.push(error); });
  const dom = new JSDOM(html, {url, ...(referrer ? {referrer} : {}), runScripts:'outside-only', pretendToBeVisual:true, virtualConsole});
  const w = dom.window, d = w.document, requests = [], timers = [];
  t.after(() => { w.close(); assert.deepEqual(errors, []); });
  w.matchMedia = () => ({matches:false});
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.PT_CONTACT_CONFIG = {endpoint:'https://receiver.invalid'};
  // Hold the background retry timers so each test decides when they fire.
  const nativeTimeout = w.setTimeout.bind(w);
  w.setTimeout = (callback, delay, ...args) => {
    if (delay === 4000 || delay === 12000) { timers.push({callback, delay}); return timers.length; }
    return nativeTimeout(callback, delay, ...args);
  };
  w.fetch = async (target, options = {}) => {
    const address = new URL(target);
    assert.equal(address.origin, 'https://receiver.invalid', 'every request stays inside the mock');
    const json = typeof options.body === 'string';
    const request = {path:address.pathname, body:json ? JSON.parse(options.body) : options.body, headers:options.headers};
    requests.push(request);
    if (address.pathname === '/healthz') return response({ok:true, ...(media ? {media:'ready'} : {})});
    if (address.pathname.startsWith('/hooks/lead/media/')) return mediaHandler ? mediaHandler(request) : response({ok:true, received:true, id:'file'}, 201);
    assert.equal(address.pathname, '/hooks/lead/webform');
    return handler ? handler(request, w) : saved();
  };
  w.eval(script);
  const enter = (fieldId, value) => {
    const field = d.getElementById(fieldId);
    field.value = value;
    field.dispatchEvent(new w.Event('input', {bubbles:true}));
  };
  // Only the four first-screen fields: the 30–60 second path.
  const fill = () => {
    enter('request-vehicle', '2015 BMW 335i');
    enter('request-details', 'Rough idle and misfire when cold.');
    enter('request-name', 'Synthetic Customer');
    enter('request-phone', '239-555-0100');
  };
  const send = () => d.getElementById('bookingForm').dispatchEvent(new w.Event('submit', {bubbles:true, cancelable:true}));
  const leads = () => requests.filter(request => request.path === '/hooks/lead/webform');
  const events = name => w.dataLayer.filter(entry => entry.event === name);
  const statusText = () => d.getElementById('request-status').textContent;
  return {w, d, requests, timers, enter, fill, send, leads, events, statusText};
}

test('four first-screen fields send a complete lead the intake accepts', async t => {
  const x = setup(t); await settle(); x.fill(); x.send(); await settle();
  assert.equal(x.leads().length, 1);
  const lead = x.leads()[0].body;
  assert.equal(lead.name, 'Synthetic Customer');
  assert.equal(lead.phone, '239-555-0100');
  assert.equal(lead.vehicle, '2015 BMW 335i');
  assert.match(lead.details, /^Rough idle and misfire when cold\./);
  assert.equal(lead.service, 'Diagnosis / not sure yet');
  assert.equal(lead.city, 'Not provided');
  assert.equal(lead.locationContract, 'sender-v1');
  assert.equal(Object.hasOwn(lead, 'carLocation'), false);
  assert.equal(lead.starts, 'unknown');
  assert.equal(lead.source, 'form');
  assert.equal(lead.smsConsent, false);
  assert.match(x.leads()[0].headers['Idempotency-Key'], /^\S{8,160}$/);
});

test('success replaces the form in place with the receipt and three useful next steps', async t => {
  const x = setup(t, {handler:() => saved({mediaToken:'token'}), media:true}); await settle(); x.fill(); x.send(); await settle();
  const done = x.d.getElementById('request-done');
  assert.equal(done.hidden, false);
  assert.equal(x.d.getElementById('bookingForm').hidden, true);
  assert.match(done.querySelector('h2').textContent, /we received your repair request/);
  assert.match(done.textContent, /We’ll review it and contact you when available/);
  assert.match(done.textContent, /appointment are not confirmed until Tony speaks with you by phone/, 'saved receipt is not a booking');
  assert.match(x.d.getElementById('request-done-ref').textContent, new RegExp(id));
  assert.equal(x.d.activeElement, x.d.getElementById('request-done-heading'));
  assert.ok(done.querySelector('a[href="tel:+12393972048"]'));
  assert.ok(done.querySelector('a[href="/"]'));
  assert.equal(x.d.getElementById('request-done-photo').hidden, false);
  assert.doesNotMatch(done.textContent, /24\/7|24 hours|immediately/i, 'no response-time promise');
  assert.equal(x.d.getElementById('request-backup').hidden, true);
});

test('photo button stays hidden when the intake cannot take uploads', async t => {
  const x = setup(t); await settle(); x.fill(); x.send(); await settle();
  assert.equal(x.d.getElementById('request-done').hidden, false);
  assert.equal(x.d.getElementById('request-done-photo').hidden, true);
});

test('adding a photo after capture uploads it to the saved request with its media token', async t => {
  const x = setup(t, {handler:() => saved({mediaToken:'token-1'}), media:true}); await settle(); x.fill(); x.send(); await settle();
  const input = x.d.getElementById('request-done-media');
  const file = new x.w.File([new Uint8Array([255, 216, 255])], 'engine.jpg', {type:'image/jpeg'});
  Object.defineProperty(input, 'files', {value:[file], configurable:true});
  input.dispatchEvent(new x.w.Event('change'));
  await settle();
  const uploads = x.requests.filter(request => request.path === `/hooks/lead/media/${id}`);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].headers['X-Media-Token'], 'token-1');
  assert.match(x.d.getElementById('request-done-status').textContent, /1 more photo\/video file\(s\) received/);
  assert.equal(x.events('form_photo_added').length, 1);
});

test('files the form cannot send are counted and the customer is told', async t => {
  const x = setup(t, {handler:() => saved({mediaToken:'token-1'}), media:true}); await settle(); x.fill();
  const input = x.d.getElementById('request-media');
  Object.defineProperty(input, 'files', {value:[
    new x.w.File([new Uint8Array([1])], 'photo.jpg', {type:'image/jpeg'}),
    new x.w.File([new Uint8Array([1])], 'notes.pdf', {type:'application/pdf'})
  ], configurable:true});
  x.send(); await settle();
  assert.equal(x.requests.filter(request => request.path.startsWith('/hooks/lead/media/')).length, 1);
  assert.match(x.d.getElementById('request-done-status').textContent, /1 photo\/video file\(s\) did not go through/);
});

test('HTTP success alone never confirms a photo upload, including photos added after receipt', async t => {
  const replies = [null, {ok:true}, {ok:false, received:true}, {ok:true, received:false}, 'non-JSON'];
  for (const reply of replies) {
    const x = setup(t, {handler:() => saved({mediaToken:'token-1'}), media:true,
      mediaHandler:() => reply === 'non-JSON' ? {ok:true, status:200, json:async () => { throw new SyntaxError('HTML response'); }} : response(reply)});
    await settle(); x.fill();
    const file = new x.w.File([new Uint8Array([255, 216, 255])], 'engine.jpg', {type:'image/jpeg'});
    Object.defineProperty(x.d.getElementById('request-media'), 'files', {value:[file], configurable:true});
    x.send(); await settle();
    assert.equal(x.d.getElementById('request-done').hidden, false, 'the lead receipt remains valid');
    assert.match(x.d.getElementById('request-done-status').textContent, /1 photo\/video file\(s\) did not go through/);
    const more = x.d.getElementById('request-done-media');
    Object.defineProperty(more, 'files', {value:[file], configurable:true});
    more.dispatchEvent(new x.w.Event('change')); await settle();
    assert.match(x.d.getElementById('request-done-status').textContent, /1 file\(s\) did not go through/);
    assert.equal(x.events('form_photo_added').at(-1).count, 0);
  }
});

test('a lead receipt requires a nonblank reference and an uncertain response retries the same request', async t => {
  for (const reference of ['', '   ']) {
    let attempts = 0;
    const x = setup(t, {handler:() => ++attempts === 1 ? saved({id:reference}) : saved()});
    await settle(); x.fill(); x.send(); await settle();
    assert.equal(x.d.getElementById('request-done').hidden, true);
    assert.equal(x.events('form_submit_success').length, 0);
    assert.equal(x.w.sessionStorage.getItem('pt-last-request'), null);
    x.timers.shift().callback(); await settle();
    assert.equal(x.d.getElementById('request-done').hidden, false);
    assert.deepEqual(x.leads()[0].body, x.leads()[1].body);
    assert.equal(x.leads()[0].headers['Idempotency-Key'], x.leads()[1].headers['Idempotency-Key']);
  }
});

test('a network failure retries the same payload and key in the background, then succeeds', async t => {
  let calls = 0;
  const x = setup(t, {handler:() => { if (++calls === 1) throw new TypeError('Synthetic outage'); return saved(); }});
  await settle(); x.fill(); x.send(); await settle();
  assert.equal(x.leads().length, 1);
  assert.match(x.statusText(), /trying again in a few seconds/);
  assert.match(x.statusText(), /\(239\) 397-2048/);
  assert.equal(x.d.getElementById('request-done').hidden, true, 'no success before confirmation');
  assert.equal(x.events('form_submit_success').length, 0);
  assert.equal(x.timers.length, 1);
  x.timers.shift().callback(); await settle();
  assert.equal(x.leads().length, 2);
  assert.deepEqual(x.leads()[1].body, x.leads()[0].body);
  assert.equal(x.leads()[1].headers['Idempotency-Key'], x.leads()[0].headers['Idempotency-Key']);
  assert.equal(x.d.getElementById('request-done').hidden, false);
  assert.equal(x.events('form_submit_success').length, 1);
});

test('background retries stop after two attempts and leave the manual fallbacks', async t => {
  const x = setup(t, {handler:() => response({ok:false, error:'Busy'}, 503)});
  await settle(); x.fill(); x.send(); await settle();
  x.timers.shift().callback(); await settle();
  assert.equal(x.timers.at(-1).delay, 12000);
  x.timers.shift().callback(); await settle();
  assert.equal(x.leads().length, 3);
  assert.equal(x.timers.length, 0);
  assert.match(x.statusText(), /could not confirm receipt[\s\S]*call \(239\) 397-2048/);
  assert.equal(x.d.getElementById('request-backup').hidden, false);
  assert.equal(x.d.getElementById('request-name').value, 'Synthetic Customer');
  assert.equal(x.d.getElementById('request-submit').disabled, false);
});

test('editing during a pending retry cancels it, so changed details are never sent under the old key', async t => {
  const x = setup(t, {handler:() => { throw new TypeError('Synthetic outage'); }});
  await settle(); x.fill(); x.send(); await settle();
  x.enter('request-details', 'Changed my mind about the symptoms.');
  x.timers.shift().callback(); await settle();
  assert.equal(x.leads().length, 1);
});

test('a clear rejection shows the intake’s message, keeps the entries and does not retry', async t => {
  const x = setup(t, {handler:() => response({ok:false, error:'Please enter a valid phone number.'}, 400)});
  await settle(); x.fill(); x.send(); await settle();
  assert.match(x.statusText(), /^Please enter a valid phone number\. Your details are still here/);
  assert.equal(x.timers.length, 0);
  assert.equal(x.d.getElementById('request-details').value, 'Rough idle and misfire when cold.');
  assert.equal(x.events('form_submit_error')[0].reason, 'http_400');
});

test('double taps while sending create one lead', async t => {
  let confirm;
  const x = setup(t, {handler:() => new Promise(resolve => { confirm = resolve; })});
  await settle(); x.fill(); x.send(); x.send(); x.send(); await settle();
  assert.equal(x.leads().length, 1);
  assert.equal(x.d.getElementById('request-submit').disabled, true);
  assert.equal(x.d.getElementById('request-submit').textContent, 'Sending…');
  confirm(saved()); await settle();
  assert.equal(x.d.getElementById('request-done').hidden, false);
});

test('conversion events fire only after a confirmed save and carry no customer details', async t => {
  let confirm;
  const x = setup(t, {url:'https://preview.invalid/walnut-blasting-fort-myers?utm_source=google', handler:() => new Promise(resolve => { confirm = resolve; })});
  await settle(); x.fill();
  assert.equal(x.events('form_start').length, 1, 'form start fires once');
  x.send(); await settle();
  assert.equal(x.events('form_submit_attempt').length, 1);
  assert.equal(x.events('form_submit_success').length, 0, 'not before the intake confirms');
  confirm(saved()); await settle();
  const [success] = x.events('form_submit_success');
  assert.ok(success);
  assert.equal(success.service, 'Walnut blasting / carbon cleaning');
  assert.equal(success.lead_source, 'google');
  assert.equal(success.car_location, 'not_given');
  const everything = JSON.stringify(x.w.dataLayer);
  for (const secret of ['Synthetic Customer', '555-0100', 'BMW', 'misfire']) assert.equal(everything.includes(secret), false, secret);
  assert.equal(x.d.querySelector('script[src*="googletagmanager"]'), null, 'no tag loads without a measurement ID');
});

test('phone and form links are counted by one delegated listener with their placement', async t => {
  const x = setup(t); await settle();
  x.d.querySelector('.mobile-contact-bar a[href^="tel:"]').dispatchEvent(new x.w.MouseEvent('click', {bubbles:true, cancelable:true}));
  x.d.querySelector('.mobile-contact-bar a[href="#contact"]').dispatchEvent(new x.w.MouseEvent('click', {bubbles:true, cancelable:true}));
  assert.equal(x.events('phone_click')[0].placement, 'sticky_bar');
  assert.equal(x.events('request_form_click')[0].placement, 'sticky_bar');
});

test('each lead says where the visitor came from, using fixed categories only', async t => {
  const x = setup(t, {url:'https://preview.invalid/walnut-blasting-fort-myers', referrer:'https://www.google.com/search?q=PRIVATE'});
  await settle(); x.fill(); x.send(); await settle();
  const details = x.leads()[0].body.details;
  assert.match(details, /Found via: google; last page viewed: \/walnut-blasting-fort-myers/);
  assert.doesNotMatch(details, /PRIVATE|search\?q/);
});



test('preferred time and itemized parts-payment request reach the existing intake without booking or charging', async t => {
  const x = setup(t, {url:'https://preview.invalid/?service=detailing&schedule=1'});
  await settle();
  assert.equal(x.d.getElementById('request-appointment').open, true);
  assert.match(x.d.getElementById('request-details').value, /professional interior\/exterior car detailing/);
  assert.equal(x.d.getElementById('request-service').value, 'Detailing / paint correction');
  x.fill();
  x.enter('request-details', 'Detailing request. Please check interior and exterior and quote the scope.');
  const date = new Date();
  date.setUTCDate(date.getUTCDate()+10);
  x.enter('request-visit-date', date.toISOString().slice(0,10));
  x.d.getElementById('request-visit-date').dispatchEvent(new x.w.Event('change', {bubbles:true}));
  assert.equal(x.d.getElementById('request-visit-time').disabled, false);
  x.enter('request-visit-time','14:00');
  assert.equal(x.d.getElementById('request-pencil-ack').required,true);
  x.d.getElementById('request-pencil-ack').click();
  x.d.getElementById('request-payment-link').click();
  assert.equal(x.d.getElementById('request-payment-intent').value,'yes');
  assert.equal(x.d.getElementById('request-payment-link').getAttribute('aria-pressed'),'true');
  x.send(); await settle();
  assert.equal(x.leads().length,1);
  const payload=x.leads()[0].body;
  assert.equal(payload.service,'Detailing / paint correction');
  assert.match(payload.callbackTime,/Preferred appointment: \d{4}-\d{2}-\d{2} at 14:00 America\/New_York; PENCILED-IN REQUEST ONLY; NOT CONFIRMED until Tony verbally confirms by phone/);
  assert.equal(payload.appointmentPencilAcknowledged,true);
  assert.match(payload.details,/Customer requests a secure parts payment link after quote\/fitment approval/);
  assert.match(x.d.getElementById('request-done').textContent,/appointment are not confirmed until Tony speaks with you by phone/);
  assert.equal(Object.hasOwn(payload,'cardNumber'),false);
  assert.equal(Object.hasOwn(payload,'paymentAmount'),false);
});

test('parts payment choice can be removed and no scheduling preference is fabricated', async t => {
  const x=setup(t); await settle();
  x.d.getElementById('request-payment-link').click();
  x.d.getElementById('request-payment-link').click();
  assert.equal(x.d.getElementById('request-payment-intent').value,'no');
  x.fill(); x.send(); await settle();
  assert.equal(x.leads().length,1);
  assert.doesNotMatch(x.leads()[0].body.details,/Customer requests a secure parts payment link/);
  assert.equal(x.leads()[0].body.callbackTime,'');
});


test('LIQUI MOLY prepay URL selects 50% labor-only offer and requests secure oil-payment link', async t => {
  const x = setup(t, {url:'https://preview.invalid/?service=maintenance&schedule=1&offer=liquimoly-labor50'});
  await settle();
  assert.equal(x.d.getElementById('request-service').value,'Oil change / maintenance');
  assert.equal(x.d.getElementById('request-appointment').open,true);
  assert.equal(x.d.getElementById('request-oil-offer').hidden,false);
  assert.match(x.d.getElementById('request-oil-offer').textContent,/50% off oil-change labor/);
  assert.equal(x.d.getElementById('request-payment-intent').value,'yes');
  assert.equal(x.d.getElementById('request-payment-link').getAttribute('aria-pressed'),'true');
  assert.match(x.d.getElementById('request-payment-message').textContent,/no payment is taken here/);
  x.fill();
  x.send(); await settle();
  assert.equal(x.leads().length,1);
  const lead=x.leads()[0].body;
  assert.equal(lead.service,'Oil change / maintenance');
  assert.match(lead.details,/Offer requested: LIQUI MOLY prepay labor50/);
  assert.match(lead.details,/50% discount applies to oil-change labor ONLY/);
  assert.match(lead.details,/correct-spec LIQUI MOLY oil is purchased and paid for in advance/);
  assert.match(lead.details,/Customer requests a secure parts payment link/);
  assert.equal(Object.hasOwn(lead,'paymentAmount'),false);
  assert.equal(Object.hasOwn(lead,'cardNumber'),false);
  assert.match(x.d.getElementById('request-done').textContent,/appointment are not confirmed/);
});

test('LIQUI MOLY labor discount never attaches when customer switches away from oil change', async t => {
  const x=setup(t, {url:'https://preview.invalid/?service=maintenance&schedule=1&offer=liquimoly-labor50'});
  await settle();
  const svc=x.d.getElementById('request-service');
  svc.value='Brakes';
  svc.dispatchEvent(new x.w.Event('change',{bubbles:true}));
  assert.equal(x.d.getElementById('request-oil-offer').hidden,true);
  x.fill(); x.send(); await settle();
  assert.equal(x.leads().length,1);
  assert.equal(x.leads()[0].body.service,'Brakes');
  assert.doesNotMatch(x.leads()[0].body.details,/Offer requested: LIQUI MOLY prepay labor50/);
});

test('unrecognized discount parameters cannot activate the 50% labor promotion', async t => {
  const x=setup(t,{url:'https://preview.invalid/?service=maintenance&schedule=1&offer=entire-invoice-free'});
  await settle();
  assert.equal(x.d.getElementById('request-oil-offer').hidden,true);
  assert.equal(x.d.getElementById('request-payment-intent').value,'no');
  x.fill();x.send();await settle();
  assert.equal(x.leads().length,1);
  assert.doesNotMatch(x.leads()[0].body.details,/Offer requested: LIQUI MOLY prepay labor50/);
});
