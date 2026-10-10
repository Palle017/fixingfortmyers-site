// Browser-form integration with a mock WebMCP registry and synthetic receiver.
// No live network, customer details, GPS permission, or messages are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM, VirtualConsole} from 'jsdom';

const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const script = fs.readFileSync(new URL('site.js', root), 'utf8');
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(setImmediate); };
const reply = body => ({ok:true, status:200, json:async () => body});

function setup(t, {mode = 'supported', offline = false, geolocation, handler} = {}) {
  const errors = [], console = new VirtualConsole();
  console.on('jsdomError', error => { if (!/Not implemented: navigation/.test(error.message)) errors.push(error); });
  const dom = new JSDOM(html, {url:'https://preview.invalid/?utm_source=google', runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:console});
  const w = dom.window, d = w.document, calls = [], registrations = [];
  t.after(() => { w.close(); assert.deepEqual(errors, []); });
  w.matchMedia = () => ({matches:false});
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.PT_CONTACT_CONFIG = {endpoint:'https://receiver.invalid'};
  if (mode !== 'unsupported') d.modelContext = {registerTool(tool, options) {
    if (mode === 'throw') throw new w.DOMException('Synthetic policy block', 'NotAllowedError');
    if (mode === 'reject') return Promise.reject(new w.DOMException('Synthetic policy block', 'NotAllowedError'));
    registrations.push({tool, options});
    return Promise.resolve();
  }};
  if (geolocation) Object.defineProperty(w.navigator, 'geolocation', {value:geolocation});
  w.fetch = async (target, options = {}) => {
    const url = new URL(target);
    assert.equal(url.origin, 'https://receiver.invalid', 'network remains inside the synthetic receiver');
    calls.push({path:url.pathname, body:options.body && JSON.parse(options.body), headers:options.headers});
    if (url.pathname === '/healthz') {
      if (offline) throw new w.TypeError('Synthetic outage');
      return reply({ok:true});
    }
    assert.equal(url.pathname, '/hooks/lead/webform');
    return handler ? handler(calls.at(-1)) : reply({ok:true, received:true, id:'12345678-1234-4234-8234-123456789012'});
  };
  w.eval(script);
  const field = name => d.querySelector(`[name="${name}"]`);
  const enter = (name, value) => {
    field(name).value = value;
    field(name).dispatchEvent(new w.Event('input', {bubbles:true}));
    field(name).dispatchEvent(new w.Event('change', {bubbles:true}));
  };
  const execute = input => registrations.at(-1).tool.execute(input);
  const leads = () => calls.filter(call => call.path === '/hooks/lead/webform');
  const submit = () => d.getElementById('bookingForm').dispatchEvent(new w.Event('submit', {cancelable:true, bubbles:true}));
  return {w, d, calls, registrations, field, enter, execute, leads, submit};
}

const complete = {
  name:'Synthetic Customer', phone:'2395550100', details:'The brakes grind when slowing down.',
  vehicle:'2018 Honda Civic', locationChoice:'location', carAddress:'123 Example St, Fort Myers'
};

test('WebMCP prepares dependent address fields for review; only manual submit reaches the existing receiver', async t => {
  let gpsCalls = 0;
  const x = setup(t, {geolocation:{getCurrentPosition(){ gpsCalls++; }}}); await settle();
  assert.equal(x.registrations.length, 1);
  const {tool} = x.registrations[0];
  assert.equal(tool.name, 'prepare_repair_request');
  assert.equal(tool.annotations.readOnlyHint, false);
  for (const hidden of ['smsConsent','website','media','latitude','longitude','deviceLocation']) assert.equal(tool.inputSchema.properties[hidden], undefined);
  x.enter('city', 'Fort Myers');
  assert.equal(x.field('carAddress').disabled, true);
  const result = x.execute(complete);
  assert.equal(result.status, 'ready_for_review');
  assert.equal(result.submitted, false);
  assert.equal(result.reviewRequired, true);
  assert.deepEqual(Array.from(result.fields), []);
  assert.equal(x.field('carAddress').disabled, false);
  assert.equal(x.field('carAddress').required, true);
  assert.equal(x.field('carAddress').value, complete.carAddress);
  assert.equal(x.field('city').value, 'Fort Myers', 'omitted existing entries survive');
  assert.equal(x.field('smsConsent').checked, false);
  assert.equal(x.d.activeElement.id, 'request-submit');
  assert.equal(x.leads().length, 0);
  assert.equal(gpsCalls, 0);
  assert.equal(x.w.sessionStorage.getItem('pt-last-request'), null);
  x.submit(); await settle();
  assert.equal(x.leads().length, 1);
  assert.deepEqual(x.leads()[0].body.carLocation, {type:'address', address:complete.carAddress});
  assert.equal(x.leads()[0].body.smsConsent, false);
  assert.equal(x.leads()[0].body.channel, 'google');
  assert.equal(JSON.parse(x.w.sessionStorage.getItem('pt-last-request')).confirmed, true);
});

test('partial preparations report missing details and preserve human consent and unsupplied values', async t => {
  const x = setup(t); await settle();
  x.enter('vehicle', 'Existing vehicle');
  x.field('smsConsent').checked = true;
  const result = x.execute({details:'The engine stalls.'});
  assert.equal(result.status, 'needs_details');
  assert.equal(result.submitted, false);
  assert.deepEqual(Array.from(result.fields).sort(), ['locationChoice','name','phone']);
  assert.equal(x.field('vehicle').value, 'Existing vehicle');
  assert.equal(x.field('smsConsent').checked, true, 'tool does not alter a human’s choice');
  assert.equal(x.leads().length, 0);
});

test('repeating the same preparation preserves the idempotency key after an unconfirmed submission', async t => {
  let attempts = 0;
  const x = setup(t, {handler:() => ++attempts === 1
    ? reply({ok:false})
    : reply({ok:true, received:true, id:'12345678-1234-4234-8234-123456789012'})});
  await settle(); x.execute(complete); x.submit(); await settle();
  assert.equal(x.leads().length, 1);
  assert.equal(x.w.sessionStorage.getItem('pt-last-request'), null);
  assert.match(x.d.getElementById('request-status').textContent, /could not confirm receipt/);
  const first = x.leads()[0];
  assert.equal(x.execute({...complete, phone:'\u200e2395550100\u200f'}).status, 'ready_for_review');
  x.submit(); await settle();
  const retry = x.leads()[1];
  assert.equal(x.leads().length, 2);
  assert.equal(retry.headers['Idempotency-Key'], first.headers['Idempotency-Key']);
  assert.deepEqual(retry.body, first.body);
  assert.equal(JSON.parse(x.w.sessionStorage.getItem('pt-last-request')).confirmed, true);
});

test('invalid or restricted tool arguments leave every existing entry unchanged', async t => {
  const x = setup(t); await settle(); x.execute(complete);
  const before = () => [...x.d.getElementById('bookingForm').elements].map(field => [field.name, field.value, field.checked, field.disabled]);
  const original = before();
  for (const input of [null, [], {name:'Changed', smsConsent:'true'}, {name:'Changed', website:'spam'}, {name:'Changed', media:'file'}, {name:'Changed', service:'invented category'}, {name:'Changed', phone:'123'}, {name:42}, {details:'x'.repeat(4001)}, {locationChoice:'dropoff', carAddress:'Wrong branch'}, {dropoffTime:'Friday'}]) {
    const result = x.execute(input);
    assert.equal(result.status, 'invalid_input');
    assert.equal(result.submitted, false);
    assert.deepEqual(before(), original);
  }
  assert.equal(x.leads().length, 0);
});

test('preparation replaces stale GPS with the supplied address and invalidates a pending GPS result', async t => {
  let finish;
  const x = setup(t, {geolocation:{getCurrentPosition(ok){ finish = ok; }}}); await settle();
  x.enter('locationChoice','location');
  x.d.getElementById('request-use-location').click();
  finish({coords:{latitude:26.64, longitude:-81.87, accuracy:5}, timestamp:Date.now()});
  assert.match(x.field('carAddress').value, /^Current location:/);
  const result = x.execute(complete);
  assert.equal(result.status, 'ready_for_review');
  x.submit(); await settle();
  assert.deepEqual(x.leads()[0].body.carLocation, {type:'address', address:complete.carAddress});

  x.d.getElementById('request-use-location').click();
  const dropoff = x.execute({locationChoice:'dropoff', dropoffTime:'Friday morning'});
  finish({coords:{latitude:26.65, longitude:-81.88, accuracy:5}, timestamp:Date.now()});
  assert.equal(dropoff.status, 'ready_for_review');
  assert.equal(x.field('dropoffTime').disabled, false);
  assert.equal(x.field('carAddress').disabled, true);
  x.submit(); await settle();
  assert.deepEqual(x.leads()[1].body.carLocation, {type:'dropoff', preferredTime:'Friday morning'});
});

test('old browsers and blocked WebMCP registration retain the working human form', async t => {
  for (const mode of ['unsupported','throw','reject']) {
    const x = setup(t, {mode}); await settle();
    assert.equal(x.registrations.length, 0);
    for (const [key, value] of Object.entries(complete)) x.enter(key,value);
    x.submit(); await settle();
    assert.equal(x.leads().length, 1);
    assert.equal(x.leads()[0].body.name, complete.name);
  }
});

test('offline preparation tells the truth and leaves sending to the customer’s manual draft flow', async t => {
  const x = setup(t, {offline:true}); await settle();
  const result = x.execute({...complete, phone:''});
  assert.equal(result.status, 'ready_for_review');
  assert.equal(result.submitted, false);
  assert.match(result.message, /send the draft yourself/);
  assert.equal(x.leads().length, 0);
  x.submit(); await settle();
  assert.equal(x.leads().length, 0);
  assert.equal(x.w.sessionStorage.getItem('pt-last-request'), null);
  assert.match(x.d.getElementById('request-status').textContent, /Nothing has been sent yet/);
});

test('registration lifecycle cleans up on pagehide and restores after a back-forward cache return', async t => {
  const x = setup(t); await settle();
  const first = x.registrations[0];
  assert.equal(first.options.signal.aborted, false);
  x.w.dispatchEvent(new x.w.PageTransitionEvent('pagehide', {persisted:true}));
  assert.equal(first.options.signal.aborted, true);
  x.w.dispatchEvent(new x.w.PageTransitionEvent('pageshow', {persisted:true}));
  await settle();
  assert.equal(x.registrations.length, 2);
  assert.equal(x.registrations[1].options.signal.aborted, false);
});
