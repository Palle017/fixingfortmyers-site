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
    enter('request-location-choice','dropoff');
    d.getElementById('request-location-choice').dispatchEvent(new w.Event('change',{bubbles:true}));
  };
  const send = () => d.getElementById('bookingForm').dispatchEvent(new w.Event('submit', {bubbles:true, cancelable:true}));
  const leads = () => requests.filter(request => request.path === '/hooks/lead/webform');
  return {w, d, requests, enter, fill, send, leads};
}

test('specialty service links carry the right category into the submitted repair request',async t=>{
  for(const [key,label] of [['walnut','Walnut blasting / carbon cleaning'],['maintenance','Oil change / maintenance'],['transmission','Transmission'],['no-start','Electrical / no-start']]){
    const x=setup(t,{url:`https://preview.invalid/?service=${key}#contact`});await settle();x.fill();x.send();await settle();
    assert.equal(x.leads().length,1);assert.equal(x.leads()[0].body.service,label);
    assert.equal(x.leads()[0].body.vehicle,'2018 Honda Civic');assert.equal(x.leads()[0].body.carLocation.type,'dropoff');
  }
});

test('repair request requires a location choice and a nonblank address unless drop-off is selected',async t=>{
  const x=setup(t);await settle();x.fill();
  x.enter('request-location-choice','');x.send();await settle();assert.equal(x.leads().length,0);
  x.enter('request-location-choice','location');x.d.getElementById('request-location-choice').dispatchEvent(new x.w.Event('change'));
  assert.equal(x.d.getElementById('request-car-address').required,true);
  x.enter('request-car-address','   ');x.send();await settle();assert.equal(x.leads().length,0);
  x.enter('request-car-address','123 Example St, Fort Myers');x.send();await settle();
  const lead=x.leads()[0].body;assert.deepEqual(lead.carLocation,{type:'address',address:'123 Example St, Fort Myers'});
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

test('online form initializes the short request flow and enables the safe submit control', async t => {
  const x = setup(t); await settle();
  assert.equal(x.d.getElementById('request-heading').textContent, 'Tell the shop what’s going on');
  assert.equal(x.d.getElementById('request-submit').textContent, 'Send repair request');
  assert.equal(x.d.getElementById('request-submit').disabled, false);
  assert.doesNotMatch(x.d.getElementById('request-instructions').textContent, /prepare (?:a )?(?:text|message)|text draft/i);
  for (const field of ['name', 'phone', 'details']) assert.equal(x.d.getElementById(`request-${field}`).required, true);
  for (const field of ['city', 'vehicle', 'timing']) assert.equal(x.d.getElementById(`request-${field}`).required, false);
  assert.equal(x.d.querySelector('.mobile-contact-bar a[href^="tel:"]').textContent, 'Call');
  assert.equal(x.d.querySelector('.mobile-contact-bar a[href^="sms:"]').textContent, 'Text');
  assert.equal(x.leads().length, 0);
});

test('core fields send without city; service, source and channel survive; receipt waits for saved confirmation', async t => {
  let confirm;
  const x = setup(t, {handler:() => new Promise(resolve => { confirm = resolve; })});
  await settle(); x.fill();
  x.enter('request-phone', '\u200e(239) 555-0100\u200f', false);
  x.send(); x.send(); await settle();
  assert.equal(x.leads().length, 1, 'repeat submission while sending makes one request');
  const lead = x.leads()[0].body;
  assert.equal(lead.city, '');
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

test('offline mode prepares an editable manual draft with optional city and callback, without claiming receipt', async t => {
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
