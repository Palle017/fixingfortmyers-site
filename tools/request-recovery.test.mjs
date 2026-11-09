import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM, VirtualConsole} from 'jsdom';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };
const receipt = {ok: true, received: true, id: '12345678-1234-4234-8234-123456789012'};
const reply = body => ({ok: true, json: async () => body ?? receipt});

function setup(t, handler) {
  const errors = [], console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(read('index.html'), {url: 'https://preview.invalid/', runScripts: 'outside-only', virtualConsole: console});
  const w = dom.window, d = w.document, calls = [];
  t.after(() => { w.close(); assert.deepEqual(errors, []); });
  w.PT_CONTACT_CONFIG = {requestEndpoint: 'https://receiver.invalid/request-v1'};
  w.fetch = async (url, options) => {
    calls.push({url, ...options, body: JSON.parse(options.body)});
    return handler ? handler(options, w) : reply();
  };
  w.eval(read('request-form-v1.js'));
  const form = d.getElementById('bookingForm');
  const field = id => d.getElementById('request-' + id);
  const enter = (id, value) => { field(id).value = value; field(id).dispatchEvent(new w.Event('input', {bubbles: true})); };
  const fill = () => { enter('name', 'Synthetic Visitor'); enter('phone', '(239) 555-0100'); enter('vehicle', '2014 Honda Civic'); };
  const send = () => form.dispatchEvent(new w.Event('submit', {bubbles: true, cancelable: true}));
  return {w, d, form, field, enter, fill, send, calls};
}

test('a slow request locks submitted fields and duplicate taps, then restores original disabled states on failure', async t => {
  let fail;
  const x = setup(t, () => new Promise((resolve, reject) => { fail = reject; }));
  x.fill(); x.enter('notes', 'Synthetic symptom'); x.field('vin').disabled = true;
  x.send(); x.send(); await settle();
  assert.equal(x.calls.length, 1);
  for (const input of x.form.querySelectorAll('input,textarea,button')) assert.equal(input.disabled, true, input.id);
  assert.equal(x.form.getAttribute('aria-busy'), 'true');
  assert.match(x.field('status').textContent, /Sending/);
  fail(new Error('synthetic offline')); await settle();
  assert.equal(x.field('vin').disabled, true, 'preserve pre-disabled controls');
  for (const id of ['name', 'phone', 'vehicle', 'notes', 'submit']) assert.equal(x.field(id).disabled, false, id);
  assert.equal(x.form.hasAttribute('aria-busy'), false);
  assert.equal(x.field('notes').value, 'Synthetic symptom');
  assert.equal(x.field('submit').textContent, 'Retry request');
  assert.equal(x.field('done').hidden, true);
});

test('analytics throwing at start, attempt, or success cannot block or misreport a saved request', async t => {
  for (const failedEvent of ['form_start', 'form_submit_attempt', 'form_submit_success']) {
    const x = setup(t), events = [];
    x.w.PT_TRACK = event => { events.push(event); if (event === failedEvent) throw new Error('Synthetic analytics outage'); };
    x.fill(); x.send(); await settle();
    assert.equal(x.calls.length, 1, failedEvent);
    assert.equal(x.field('done').hidden, false, failedEvent);
    assert.equal(x.form.hidden, true, failedEvent);
    assert.equal(x.field('status').textContent, '', failedEvent);
    assert.equal(events.includes('form_submit_error'), false, failedEvent);
    x.send(); await settle(); assert.equal(x.calls.length, 1, 'no retry after acknowledged save');
  }
});

test('an offline failure keeps all fields and a manual retry reuses the request identity', async t => {
  let attempts = 0;
  const x = setup(t, () => { if (++attempts === 1) throw new Error('synthetic offline'); return reply(); });
  x.fill(); x.enter('notes', 'Synthetic symptom');
  Object.defineProperty(x.w.navigator, 'onLine', {configurable: true, value: false});
  x.send(); await settle();
  assert.equal(x.calls.length, 1);
  assert.match(x.field('status').textContent, /offline/i);
  assert.equal(x.field('notes').value, 'Synthetic symptom');
  assert.equal(x.field('submit').disabled, false);
  assert.equal(x.field('done').hidden, true);
  Object.defineProperty(x.w.navigator, 'onLine', {configurable: true, value: true});
  x.send(); await settle();
  assert.equal(x.calls.length, 2);
  assert.equal(x.calls[1].body.notes, 'Synthetic symptom');
  assert.deepEqual(x.calls[1].body, x.calls[0].body);
  assert.equal(x.calls[1].headers['Idempotency-Key'], x.calls[0].headers['Idempotency-Key']);
  assert.equal(x.field('done').hidden, false);
});

test('a stale browser offline flag cannot block a reachable receiver', async t => {
  const x = setup(t); x.fill();
  Object.defineProperty(x.w.navigator, 'onLine', {configurable: true, value: false});
  x.send(); await settle();
  assert.equal(x.calls.length, 1);
  assert.equal(x.field('done').hidden, false);
});

test('a timed-out request remains unconfirmed and a manual retry reuses its exact identity and payload', async t => {
  let expire;
  const x = setup(t, options => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('synthetic timeout')), {once: true});
  }));
  const realTimeout = x.w.setTimeout.bind(x.w);
  x.w.setTimeout = (fn, ms, ...args) => ms === 15000 ? (expire = fn, 0) : realTimeout(fn, ms, ...args);
  x.fill(); x.send(); await settle(); expire(); await settle();
  assert.match(x.field('status').textContent, /could not confirm/i);
  assert.match(x.field('status').textContent, /longer than expected/i);
  assert.equal(x.field('done').hidden, true);
  assert.equal(x.field('name').disabled, false);
  assert.equal(x.field('name').value, 'Synthetic Visitor');
  x.send(); await settle();
  assert.equal(x.calls.length, 2);
  assert.deepEqual(x.calls[1].body, x.calls[0].body);
  assert.equal(x.calls[1].headers['Idempotency-Key'], x.calls[0].headers['Idempotency-Key']);
  expire(); await settle();
});

test('the saved receipt identifies the request and keeps a direct call action without promising delivery or an appointment', async t => {
  const x = setup(t); x.fill(); x.d.getElementById('callback-tomorrow').checked = true; x.send(); await settle();
  assert.equal(x.field('done-heading').textContent, 'Request received.');
  assert.match(x.field('done').textContent, /request is saved/);
  assert.match(x.field('done').textContent, /Preferred callback: tomorrow/);
  assert.match(x.field('done').textContent, /not a confirmed appointment/);
  assert.match(x.field('done').textContent, new RegExp(receipt.id));
  const call = x.field('done').querySelector('a[href="tel:+12393972048"]');
  assert.ok(call);
  assert.match(call.textContent, /Call Tony/);
  assert.doesNotMatch(x.field('done').textContent, /calls back|email sent|Tony received/i);
  assert.equal(x.d.activeElement.id, 'request-done-heading');
  assert.equal(x.w.localStorage.length, 0);
  assert.equal(x.w.sessionStorage.length, 0);
});

test('untrusted receipt text is neither rendered as markup nor shown as a request reference', async t => {
  const x = setup(t, () => reply({...receipt, id: '<img src=x onerror=alert(1)>'}));
  x.fill(); x.send(); await settle();
  assert.equal(x.field('done').querySelector('img'), null);
  assert.doesNotMatch(x.field('done').textContent, /<img|onerror|Request reference:/);
});
