// Customer intake checks with a synthetic receiver. No live network or messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM, VirtualConsole} from 'jsdom';

const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const script = fs.readFileSync(new URL('site.js', root), 'utf8');
const id = '12345678-1234-4234-8234-123456789012';
const settle = async () => { for (let n = 0; n < 4; n++) await new Promise(setImmediate); };
const response = (body, status = 200) => ({ok:status >= 200 && status < 300, status, json:async () => body});

function setup(t, {handler, offline = false, geolocation, url = 'https://preview.invalid/?service=brakes&utm_source=google'} = {}) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!/Not implemented: navigation/.test(error.message)) errors.push(error); });
  const dom = new JSDOM(html, {url, runScripts:'outside-only', pretendToBeVisual:true, virtualConsole});
  const w = dom.window, d = w.document, requests = [];
  t.after(() => { w.close(); assert.deepEqual(errors, []); });
  w.matchMedia = () => ({matches:false});
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.PT_CONTACT_CONFIG = {endpoint:'https://receiver.invalid'};
  if (geolocation) Object.defineProperty(w.navigator,'geolocation',{value:geolocation,configurable:true});
  w.fetch = async (target, options = {}) => {
    const address = new URL(target);
    assert.equal(address.origin, 'https://receiver.invalid', 'every request stays inside the mock');
    const request = {path:address.pathname, body:options.body ? JSON.parse(options.body) : null, headers:options.headers};
    requests.push(request);
    if (address.pathname === '/healthz') {
      if (offline) throw new w.TypeError('Synthetic outage');
      return response({ok:true});
    }
    assert.equal(address.pathname, '/hooks/lead/webform');
    return handler ? handler(request, w) : response({ok:false}, 503);
  };
  const initialInstructions = d.getElementById('request-instructions').textContent;
  w.eval(script);
  const enter = (fieldId, value, dispatch = true) => {
    const field = d.getElementById(fieldId);
    assert.ok(field, `${fieldId} exists`);
    field.value = value;
    if (dispatch) field.dispatchEvent(new w.Event('input', {bubbles:true}));
  };
  const fill = () => {
    enter('request-name', 'Synthetic Customer');
    enter('request-phone', '2395550100');
    enter('request-vehicle', '2018 Honda Civic');
    enter('request-details', 'The brakes grind when slowing down.');
    enter('request-city', 'Fort Myers');
    enter('request-location-choice','dropoff');
    d.getElementById('request-location-choice').dispatchEvent(new w.Event('change',{bubbles:true}));
  };
  const send = () => d.getElementById('bookingForm').dispatchEvent(new w.Event('submit', {bubbles:true, cancelable:true}));
  const leads = () => requests.filter(request => request.path === '/hooks/lead/webform');
  return {w, d, requests, enter, fill, send, leads, initialInstructions};
}

test('specialty service links carry the right category into the submitted repair request',async t=>{
  for(const [key,label] of [['walnut','Walnut blasting / carbon cleaning'],['maintenance','Oil change / maintenance'],['transmission','Transmission'],['no-start','Electrical / no-start']]){
    const x=setup(t,{url:`https://preview.invalid/?service=${key}#contact`});await settle();x.fill();x.send();await settle();
    assert.equal(x.leads().length,1);assert.equal(x.leads()[0].body.service,label);
    assert.equal(x.leads()[0].body.vehicle,'2018 Honda Civic');assert.equal(x.leads()[0].body.carLocation.type,'dropoff');
  }
});

test('car location is optional, but choosing an address requires a nonblank one',async t=>{
  const x=setup(t,{handler:()=>response({ok:false},503)});await settle();x.fill();
  x.enter('request-location-choice','');x.d.getElementById('request-location-choice').dispatchEvent(new x.w.Event('change'));x.send();await settle();
  assert.equal(x.leads().length,1);assert.equal(Object.hasOwn(x.leads()[0].body,'carLocation'),false);
  assert.match(x.leads()[0].body.details,/Car location: not given yet/);
  x.enter('request-location-choice','location');x.d.getElementById('request-location-choice').dispatchEvent(new x.w.Event('change'));
  assert.equal(x.d.getElementById('request-car-address').required,true);
  x.enter('request-car-address','   ');x.send();await settle();assert.equal(x.leads().length,1);
  x.enter('request-car-address','123 Example St, Fort Myers');x.send();await settle();
  const lead=x.leads()[1].body;assert.deepEqual(lead.carLocation,{type:'address',address:'123 Example St, Fort Myers'});
  assert.match(lead.details,/Car location: 123 Example St, Fort Myers/);assert.match(lead.details,/Map: https:\/\/www\.google\.com\/maps\/search/);
});

test('device location is requested only on click, saved with permission evidence and sent with its map',async t=>{
  let lookups=0;
  const x=setup(t,{geolocation:{getCurrentPosition(ok,_fail,options){lookups++;assert.equal(options.maximumAge,0);ok({coords:{latitude:26.6406,longitude:-81.8723,accuracy:12},timestamp:Date.now()});}}});
  await settle();x.fill();assert.equal(lookups,0);
  x.enter('request-location-choice','location');x.d.getElementById('request-location-choice').dispatchEvent(new x.w.Event('change'));
  x.d.getElementById('request-use-location').click();x.send();await settle();
  const lead=x.leads()[0].body;assert.equal(lookups,1);assert.equal(lead.carLocation.type,'device');assert.equal(lead.carLocation.carAtDevice,true);
  assert.equal(lead.carLocation.latitude,26.6406);assert.equal(lead.carLocation.accuracyMeters,12);assert.ok(lead.carLocation.capturedAt);
  assert.match(lead.details,/query=26.6406%2C-81.8723/);
});

test('denied device location still permits a typed address and does not send coordinates',async t=>{
  const x=setup(t,{geolocation:{getCurrentPosition(_ok,fail){fail({code:1});}}});await settle();x.fill();
  x.enter('request-location-choice','location');x.d.getElementById('request-location-choice').dispatchEvent(new x.w.Event('change'));
  x.d.getElementById('request-use-location').click();assert.match(x.d.getElementById('request-location-status').textContent,/type the car/);
  x.enter('request-car-address','123 Example St');x.send();await settle();
  assert.deepEqual(x.leads()[0].body.carLocation,{type:'address',address:'123 Example St'});
});

test('drop-off needs no address and carries the requested time without confirming a booking',async t=>{
  const x=setup(t);await settle();x.fill();x.enter('request-dropoff-time','Friday morning');x.send();await settle();
  assert.equal(x.d.getElementById('request-car-address').disabled,true);
  assert.deepEqual(x.leads()[0].body.carLocation,{type:'dropoff',preferredTime:'Friday morning'});
  assert.match(x.leads()[0].body.details,/Shop drop-off requested; preferred time: Friday morning\. Shop to confirm/);
  assert.doesNotMatch(x.leads()[0].body.details,/Map:/);
});

test('late GPS result cannot replace a selected drop-off or an address typed while waiting',async t=>{
  let finish;
  const x=setup(t,{geolocation:{getCurrentPosition(ok){finish=ok;}}});await settle();x.fill();
  const choice=x.d.getElementById('request-location-choice');choice.value='location';choice.dispatchEvent(new x.w.Event('change'));
  x.d.getElementById('request-use-location').click();choice.value='dropoff';choice.dispatchEvent(new x.w.Event('change'));
  finish({coords:{latitude:26.64,longitude:-81.87,accuracy:5},timestamp:Date.now()});x.send();await settle();
  assert.equal(x.leads()[0].body.carLocation.type,'dropoff');
  choice.value='location';choice.dispatchEvent(new x.w.Event('change'));x.d.getElementById('request-use-location').click();
  x.enter('request-car-address','321 Example St');finish({coords:{latitude:26.64,longitude:-81.87,accuracy:5},timestamp:Date.now()});
  x.send();await settle();assert.equal(x.leads()[1].body.carLocation.address,'321 Example St');
});

test('autofilled address supersedes an earlier GPS pin even without an input event',async t=>{
  const x=setup(t,{geolocation:{getCurrentPosition(ok){ok({coords:{latitude:26.64,longitude:-81.87,accuracy:5},timestamp:Date.now()});}}});await settle();x.fill();
  x.enter('request-location-choice','location');x.d.getElementById('request-location-choice').dispatchEvent(new x.w.Event('change'));
  x.d.getElementById('request-use-location').click();x.enter('request-car-address','456 Example St',false);x.send();await settle();
  assert.deepEqual(x.leads()[0].body.carLocation,{type:'address',address:'456 Example St'});
});

test('offline text and email drafts carry the required car location and map',async t=>{
  const x=setup(t,{offline:true});await settle();x.fill();x.enter('request-location-choice','location');x.d.getElementById('request-location-choice').dispatchEvent(new x.w.Event('change'));
  x.enter('request-car-address','123 Example St');x.send();await settle();assert.equal(x.leads().length,0);
  assert.match(x.d.getElementById('request-preview').value,/Car location: 123 Example St/);
  assert.match(decodeURIComponent(x.d.getElementById('request-email').href),/Map: https:\/\/www\.google\.com/);
});

test('removing a sender pin invalidates a prepared manual draft and every draft link', async t => {
  const x = setup(t, {offline:true, geolocation:{getCurrentPosition(ok){ok({coords:{latitude:26.6406,longitude:-81.8723,accuracy:18},timestamp:Date.now()});}}});
  await settle(); x.fill(); x.d.getElementById('request-use-my-location').click(); x.send(); await settle();
  assert.match(x.d.getElementById('request-preview').value,/Sender map pin: 26.6406/);
  x.d.getElementById('request-remove-my-location').click();
  assert.equal(x.d.getElementById('request-backup').hidden,true);
  assert.equal(x.d.getElementById('request-preview').value,'');
  for (const name of ['request-text','request-email']) assert.doesNotMatch(decodeURIComponent(x.d.getElementById(name).href),/26\.6406|81\.8723|Sender map/);
  x.send(); await settle();
  assert.equal(x.d.getElementById('request-backup').hidden,false);
  assert.match(x.d.getElementById('request-preview').value,/City \/ ZIP: Fort Myers/);
  assert.doesNotMatch(x.d.getElementById('request-preview').value,/Sender map|26\.6406|81\.8723/);
  assert.equal(x.leads().length,0);
});

test('removing a pin while a request is in flight preserves the old receipt and sends the update separately', async t => {
  let confirm;
  const x = setup(t, {handler:() => new Promise(resolve => { confirm = resolve; }),geolocation:{getCurrentPosition(ok){ok({coords:{latitude:26.6406,longitude:-81.8723,accuracy:18},timestamp:Date.now()});}}});
  await settle(); x.fill(); x.d.getElementById('request-use-my-location').click(); x.send(); await settle();
  const first = x.leads()[0]; assert.equal(first.body.latitude,26.6406);
  x.d.getElementById('request-remove-my-location').click();
  assert.match(x.d.getElementById('request-sender-location-status').textContent,/Requests already sent are unchanged/);
  confirm(response({ok:true,received:true,id},201)); await settle();
  assert.match(x.d.getElementById('request-status').textContent,/earlier request was received.*edited details have not been sent/);
  assert.equal(x.w.sessionStorage.getItem('pt-last-request'),null);
  x.send(); await settle();
  const updated = x.leads()[1]; assert.equal(updated.body.latitude,undefined); assert.doesNotMatch(updated.body.details,/Sender map/);
  assert.notEqual(updated.headers['Idempotency-Key'],first.headers['Idempotency-Key']);
  confirm(response({ok:true,received:true,id},201)); await settle();
});

test('online form initializes the short request flow and enables the safe submit control', async t => {
  const x = setup(t);
  assert.equal(x.d.getElementById('request-instructions').textContent,x.initialInstructions,'script startup preserves the page guidance');
  await settle();
  assert.equal(x.d.getElementById('request-instructions').textContent,x.initialInstructions,'a successful health check preserves the page guidance');
  assert.equal(x.d.getElementById('request-heading').textContent, 'How can we help with your car?');
  assert.equal(x.d.getElementById('request-submit').textContent, 'Request Repair');
  assert.equal(x.d.getElementById('request-phone-label').textContent, 'Best number');
  // The first screen is four fields; everything else waits behind the optional step.
  const core = [...x.d.querySelectorAll('.request-fields--core :is(input,textarea,select)')].map(field => field.name);
  assert.deepEqual(core, ['vehicle', 'details', 'name', 'phone']);
  assert.equal(x.d.getElementById('request-options').open, false);
  assert.match(x.d.querySelector('#request-options > summary').textContent, /Add photos or more details/);
  assert.equal(x.d.getElementById('request-submit').disabled, false);
  assert.doesNotMatch(x.d.getElementById('request-instructions').textContent, /prepare (?:a )?(?:text|message)|text draft/i);
  for (const field of ['name', 'phone', 'details']) assert.equal(x.d.getElementById(`request-${field}`).required, true);
  for (const field of ['vehicle', 'timing', 'city', 'location-choice']) assert.equal(x.d.getElementById(`request-${field}`).required, false);
  assert.equal(x.d.querySelector('.mobile-contact-bar a[href^="tel:"]').textContent, 'Call');
  assert.equal(x.d.querySelector('.mobile-contact-bar a[href="#contact"]').textContent, 'Request a repair');
  assert.ok(x.d.querySelector('a[href^="sms:"]'), 'texting remains available in the page');
  assert.equal(x.leads().length, 0);
});

test('service, source and channel survive; receipt waits for saved confirmation', async t => {
  let confirm;
  const x = setup(t, {handler:() => new Promise(resolve => { confirm = resolve; })});
  await settle(); x.fill();
  x.enter('request-phone', '\u200e(239) 555-0100\u200f', false);
  x.send(); x.send(); await settle();
  assert.equal(x.leads().length, 1, 'repeat submission while sending makes one request');
  const lead = x.leads()[0].body;
  assert.equal(lead.city, 'Fort Myers');
  assert.equal(lead.service, 'Brakes');
  assert.equal(lead.source, 'form');
  assert.equal(lead.channel, 'google');
  assert.equal(lead.phone, '(239) 555-0100');
  assert.equal(lead.smsConsent, false);
  assert.equal(x.w.sessionStorage.getItem('pt-last-request'), null);
  assert.match(x.d.getElementById('request-status').textContent, /Sending/);
  confirm(response({ok:true, received:true, id, receivedAt:new Date().toISOString()}, 201));
  await settle();
  const receipt = JSON.parse(x.w.sessionStorage.getItem('pt-last-request'));
  assert.equal(receipt.confirmed, true); assert.equal(receipt.id, id);
  assert.equal(receipt.name, undefined); assert.equal(receipt.phone, undefined);
  assert.equal(x.d.getElementById('request-backup').hidden, true);
  assert.match(x.d.getElementById('request-status').textContent, /Repair request received/);
});

test('unconfirmed receiver response preserves entries and exposes manual contact without creating a receipt', async t => {
  const x = setup(t, {handler:() => response({ok:true, received:false, id})});
  await settle(); x.fill(); x.send(); await settle();
  assert.equal(x.w.sessionStorage.getItem('pt-last-request'), null);
  assert.equal(x.d.getElementById('request-name').value, 'Synthetic Customer');
  assert.equal(x.d.getElementById('request-details').value, 'The brakes grind when slowing down.');
  assert.equal(x.d.getElementById('request-service').value, 'Brakes');
  assert.match(x.d.getElementById('request-status').textContent, /could not confirm receipt[\s\S]*call/);
  assert.equal(x.d.getElementById('request-backup').hidden, false);
  assert.match(x.d.getElementById('request-preview').value, /Vehicle: 2018 Honda Civic[\s\S]*brakes grind/);
  assert.match(x.d.getElementById('request-text').getAttribute('href'), /^sms:\+12393972048\?body=/);
  assert.match(x.d.getElementById('request-email').getAttribute('href'), /^mailto:fixingfortmyers@gmail\.com\?/);
  assert.ok(x.d.querySelector('a[href="tel:+12393972048"]'));
  assert.equal(x.d.getElementById('request-submit').disabled, false);
});

test('uncertain retries keep the same payload and key, while browser autofill edits create an updated request', async t => {
  const x = setup(t); await settle(); x.fill();
  x.d.getElementById('request-sms-consent').checked = true;
  x.send(); await settle(); x.send(); await settle();
  const first = x.leads()[0], retry = x.leads()[1];
  assert.deepEqual(retry.body, first.body);
  assert.equal(retry.headers['Idempotency-Key'], first.headers['Idempotency-Key']);
  x.enter('request-phone', '2395550199', false);
  x.enter('request-details', 'Updated by autofill or a browser extension.', false);
  x.send(); await settle();
  const update = x.leads()[2];
  assert.equal(update.body.phone, '2395550199');
  assert.match(update.body.details, /^Updated by autofill/);
  assert.notEqual(update.headers['Idempotency-Key'], first.headers['Idempotency-Key']);
});

test('optional timing and text permission use the existing receiver contract and exact displayed disclosure', async t => {
  const x = setup(t); await settle(); x.fill();
  x.enter('request-timing', 'This week; call after 3 pm.');
  x.d.getElementById('request-sms-consent').checked = true;
  x.send(); await settle();
  const lead = x.leads()[0].body;
  assert.equal(lead.callbackTime, 'This week; call after 3 pm.');
  assert.match(lead.details, /Preferred timing: This week; call after 3 pm\./);
  assert.equal(lead.smsConsent, true);
  assert.equal(lead.smsConsentDisclosure, x.d.querySelector('.request-consent span').firstChild.textContent.trim());
  assert.equal(lead.smsConsentVersion, '2026-09-06-v1');
  assert.equal(lead.smsConsentSource, 'website-repair-request');
  assert.ok(Number.isFinite(Date.parse(lead.smsConsentTimestamp)));
});

test('hero calendar and time picker populate the existing scheduled-service lead without booking', async t => {
  const x = setup(t); await settle(); x.fill();
  const day = x.d.getElementById('hero-appointment-date');
  const time = x.d.getElementById('hero-appointment-time');
  const next = x.d.getElementById('hero-appointment-continue');
  assert.ok(day && time && next, 'all hero controls exist');
  assert.equal(x.d.querySelector('.home-start__actions'), null, 'no duplicate hero buttons');
  assert.equal(next.dispatchEvent(new x.w.MouseEvent('click', {bubbles:true,cancelable:true})), false);
  assert.match(x.d.getElementById('hero-appointment-error').textContent,/date/);
  assert.equal(x.leads().length,0);
  const min = x.d.getElementById('request-visit-date').min;
  const tomorrow = new Date(Date.parse(min + 'T12:00:00Z') + 86400000).toISOString().slice(0,10);
  x.enter('hero-appointment-date',tomorrow);
  x.enter('hero-appointment-time','10:00');
  assert.equal(x.d.getElementById('request-visit-date').value,tomorrow);
  assert.equal(x.d.getElementById('request-visit-time').value,'10:00');
  assert.equal(x.d.getElementById('request-visit-time').disabled,false);
  assert.match(x.d.getElementById('request-appointment-summary').textContent,/shop must confirm availability/i);
  assert.equal(x.leads().length,0,'choosing a preference never submits or books');
  x.send(); await settle();
  assert.equal(x.leads().length,1);
  assert.equal(x.leads()[0].body.callbackTime,'Preferred appointment: ' + tomorrow + ' at 10:00 America/New_York; requested only, not booked');
  assert.match(x.leads()[0].body.details,/requested only, not booked/);
});

test('changing the hero date beyond the allowed window clears an earlier preferred appointment', async t => {
  const x = setup(t); await settle();
  const min = x.d.getElementById('request-visit-date').min;
  const tomorrow = new Date(Date.parse(min + 'T12:00:00Z') + 86400000).toISOString().slice(0,10);
  x.enter('hero-appointment-date',tomorrow);
  x.enter('hero-appointment-time','09:00');
  assert.equal(x.d.getElementById('request-visit-date').value,tomorrow);
  x.enter('hero-appointment-date','2099-01-15');
  assert.equal(x.d.getElementById('request-visit-date').value,'');
  assert.equal(x.d.getElementById('request-visit-time').value,'');
  assert.equal(x.d.getElementById('request-appointment-summary'),null);
  assert.equal(x.d.getElementById('hero-appointment-continue').dispatchEvent(new x.w.MouseEvent('click',{bubbles:true,cancelable:true})),false);
  assert.match(x.d.getElementById('hero-appointment-error').textContent,/60 days/);
});

test('missing required details and invalid phone numbers never reach the receiver', async t => {
  const x = setup(t); await settle(); x.fill();
  x.enter('request-details', ''); x.send(); await settle();
  assert.equal(x.leads().length, 0);
  x.enter('request-details', 'The brakes grind.');
  for (const phone of ['239555', '1234567890123456', '239+5550100']) {
    x.enter('request-phone', phone); x.send(); await settle();
    assert.equal(x.leads().length, 0);
  }
  assert.match(x.d.getElementById('request-status').textContent, /valid phone number/);
});

test('offline mode prepares an editable manual draft with required city and optional callback, without claiming receipt', async t => {
  const x = setup(t, {offline:true}); await settle(); x.fill();
  x.enter('request-phone', ''); x.send(); await settle();
  assert.equal(x.leads().length, 0);
  assert.equal(x.d.getElementById('request-phone').required, false);
  assert.equal(x.d.getElementById('request-submit').textContent, 'Prepare text to the shop');
  assert.equal(x.d.getElementById('request-backup').hidden, false);
  assert.equal(x.d.getElementById('request-preview').readOnly, false);
  assert.match(x.d.getElementById('request-status').textContent, /Nothing has been sent yet/);
  assert.equal(x.w.sessionStorage.getItem('pt-last-request'), null);
});

test('sender Use my location fills hidden lat/lng and maps link; city remains required', async t => {
  let lookups = 0;
  const x = setup(t, {geolocation:{getCurrentPosition(ok,_fail,options){lookups++;assert.equal(options.maximumAge,0);ok({coords:{latitude:26.6406,longitude:-81.8723,accuracy:18},timestamp:Date.now()});}}, handler:() => response({ok:true, received:true, id, receivedAt:new Date().toISOString()}, 201)});
  await settle(); x.fill();
  x.d.getElementById('request-use-my-location').click();
  x.send(); await settle();
  assert.equal(lookups, 1);
  const lead = x.leads()[0].body;
  assert.equal(lead.city, 'Fort Myers');
  assert.equal(lead.latitude, 26.6406);
  assert.equal(lead.longitude, -81.8723);
  assert.match(lead.mapsLink, /query=26\.6406%2C-81\.8723/);
  assert.match(lead.details, /Sender map pin: 26\.640600, -81\.872300/);
  assert.match(lead.details, /City \/ ZIP: Fort Myers/);
});

test('denied sender location still submits with typed city and without coordinates', async t => {
  const x = setup(t, {geolocation:{getCurrentPosition(_ok,fail){fail({code:1});}}, handler:() => response({ok:true, received:true, id, receivedAt:new Date().toISOString()}, 201)});
  await settle(); x.fill();
  x.d.getElementById('request-use-my-location').click();
  assert.match(x.d.getElementById('request-sender-location-status').textContent, /city or ZIP still works/i);
  x.send(); await settle();
  const lead = x.leads()[0].body;
  assert.equal(lead.city, 'Fort Myers');
  assert.equal(lead.latitude, undefined);
  assert.equal(lead.mapsLink, undefined);
});

test('blank city still sends under the sender-v1 contract, marked Not provided', async t => {
  const x = setup(t, {handler:() => response({ok:true, received:true, id, receivedAt:new Date().toISOString()}, 201)});
  await settle(); x.fill();
  x.enter('request-city', '');
  x.send(); await settle();
  assert.equal(x.leads().length, 1);
  assert.equal(x.leads()[0].body.locationContract, 'sender-v1');
  assert.equal(x.leads()[0].body.city, 'Not provided');
  assert.doesNotMatch(x.leads()[0].body.details, /City \/ ZIP/);
});


test('removing sender pin cancels a pending callback and omits coordinates', async t => {
  let resolve;
  const x=setup(t,{geolocation:{getCurrentPosition(ok){resolve=ok;}}});await settle();x.fill();
  x.d.getElementById('request-use-my-location').click();
  x.d.getElementById('request-remove-my-location').click();
  resolve({coords:{latitude:26.6,longitude:-81.8,accuracy:10},timestamp:Date.now()});
  x.send();await settle();
  assert.equal(x.leads()[0].body.latitude,undefined);
  assert.equal(x.leads()[0].body.locationContract,'sender-v1');
  assert.equal(x.d.getElementById('request-latitude').value,'');
});
