// Exercise the real homepage's campaign links without contacting any receiver.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM, VirtualConsole} from 'jsdom';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const walnut = 'I would like an assessment for intake-valve carbon cleaning / walnut blasting. Promo code: WALNUT10.';
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(setImmediate); };

function setup(t, {search = '', deferred = false, page = 'index.html'} = {}) {
  const errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', error => { if (!/Not implemented: navigation/.test(error.message)) errors.push(error.message); });
  const path = page === 'index.html' ? '' : page.replace(/\.html$/, '');
  const dom = new JSDOM(read(page), {url:'https://preview.invalid/' + path + search, runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:vc});
  const w = dom.window, d = w.document, calls = [];
  t.after(() => { w.close(); assert.deepEqual(errors, []); });
  w.matchMedia = () => ({matches:false, addEventListener() {}, removeEventListener() {}});
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.PT_CONTACT_CONFIG = {endpoint:'', requestEndpoint:'https://receiver.invalid/request-v1'};
  let resolve;
  const reply = () => ({ok:true, status:201, json:async () => ({ok:true, received:true, id:'synthetic-context-receipt'})});
  w.fetch = async (url, options) => {
    calls.push({url, ...options, body:JSON.parse(options.body)});
    return deferred ? new Promise(done => { resolve = () => done(reply()); }) : reply();
  };
  for (const file of ['repair-dialog.js', 'request-form-v1.js', 'site.js']) w.eval(read(file));
  const apply = (key, offer) => w.PT_REPAIR_CONTEXT.applyService(key, offer ? {offer} : {});
  const send = () => {
    d.getElementById('request-name').value = 'Synthetic Context';
    d.getElementById('request-phone').value = '2395550100';
    d.getElementById('request-vehicle').value = '2014 Synthetic Vehicle';
    d.getElementById('bookingForm').dispatchEvent(new w.Event('submit', {bubbles:true, cancelable:true}));
  };
  return {w, d, calls, apply, send, finish:() => resolve()};
}

test('homepage service links land on the dedicated repair form with the same service', () => {
  const doc = new JSDOM(read('index.html')).window.document;
  const hrefs = [...doc.querySelectorAll('a[href*="service="]')].map(link => link.getAttribute('href')).sort();
  assert.deepEqual(hrefs, [
    '/?service=ac#contact',
    '/request-a-repair?service=detailing',
    '/request-a-repair?service=detailing',
    '/request-a-repair?service=engine',
    '/request-a-repair?service=engine',
    '/request-a-repair?service=maintenance&offer=liquimoly-labor50',
    '/request-a-repair?service=maintenance&offer=liquimoly-labor50',
    '/request-a-repair?service=transmission',
    '/request-a-repair?service=transmission',
    '/request-a-repair?service=walnut',
    '/request-a-repair?service=walnut',
  ]);
});

test('dedicated repair landings preselect the linked service', t => {
  const maintenance = setup(t, {page:'request-a-repair.html', search:'?service=maintenance&offer=liquimoly-labor50'});
  assert.equal(maintenance.d.getElementById('request-service').value, 'maintenance');
  assert.equal(maintenance.d.getElementById('request-oil-offer').hidden, false);
  assert.equal(maintenance.d.getElementById('request-notes').value, '');
  const walnutLanding = setup(t, {page:'request-a-repair.html', search:'?service=walnut'});
  assert.equal(walnutLanding.d.getElementById('request-service').value, 'walnut');
  assert.equal(walnutLanding.d.getElementById('request-notes').value, walnut);
  assert.equal(walnutLanding.d.getElementById('request-options').open, true);
  assert.equal(walnutLanding.d.getElementById('request-oil-offer').hidden, true);
  for (const service of ['detailing', 'engine', 'transmission']) {
    const landing = setup(t, {page:'request-a-repair.html', search:'?service=' + service});
    assert.equal(landing.d.getElementById('request-service').value, service);
    assert.equal(landing.d.getElementById('request-oil-offer').hidden, true);
    assert.equal(landing.d.getElementById('request-notes').value, '');
  }
});

test('a walnut landing carries the editable assessment and promo through the existing JSON submission', async t => {
  const x = setup(t, {page:'request-a-repair.html', search:'?service=walnut'});
  assert.equal(x.d.getElementById('request-notes').value, walnut);
  assert.equal(x.d.getElementById('request-options').open, true);
  x.send(); await settle();
  assert.equal(x.calls.length, 1);
  assert.equal(x.calls[0].url, 'https://receiver.invalid/request-v1');
  assert.equal(x.calls[0].body.source, 'site_form_v1');
  assert.equal(x.calls[0].body.service, 'walnut');
  assert.equal(x.calls[0].body.notes, walnut);
});

test('campaign changes preserve customer notes and do not retain an unrelated oil offer', t => {
  const x = setup(t);
  x.apply('maintenance', 'liquimoly-labor50');
  assert.equal(x.d.getElementById('request-oil-offer').hidden, false);
  x.d.getElementById('request-notes').value = 'Keep my existing symptoms and code P0301.';
  x.apply('walnut');
  assert.equal(x.d.getElementById('request-notes').value, 'Keep my existing symptoms and code P0301.');
  assert.equal(x.d.getElementById('request-oil-offer').hidden, true);
  assert.equal(x.d.getElementById('request-service').value, 'walnut');
});

test('plain visits keep optional details closed; a walnut landing exposes its editable prefill', t => {
  const plain = setup(t);
  assert.equal(plain.d.getElementById('request-options').open, false);
  assert.equal(plain.d.getElementById('request-notes').value, '');
  const landing = setup(t, {search:'?service=walnut#contact'});
  assert.equal(landing.d.getElementById('request-service').value, 'walnut');
  assert.equal(landing.d.getElementById('request-notes').value, walnut);
  assert.equal(landing.d.getElementById('request-options').open, true);
});

test('switching campaigns removes only untouched generated notes, while generic open keeps context', t => {
  const x = setup(t);
  x.apply('walnut');
  assert.equal(x.d.getElementById('request-notes').value, walnut);
  x.w.PT_REPAIR_CONTEXT.applyService(null);
  assert.equal(x.d.getElementById('request-notes').value, walnut);
  assert.equal(x.d.getElementById('request-service').value, 'walnut');
  x.apply('detailing');
  assert.equal(x.d.getElementById('request-notes').value, '');
  assert.equal(x.d.getElementById('request-service').value, 'detailing');
});

test('unsupported service and offer text cannot enter campaign context', t => {
  const x = setup(t);
  x.apply('detailing');
  x.w.PT_REPAIR_CONTEXT.applyService('<script>alert(1)</script>', {offer:'liquimoly-labor50'});
  assert.equal(x.d.getElementById('request-service').value, 'detailing');
  assert.equal(x.d.getElementById('request-oil-offer').hidden, true);
  assert.equal(x.d.getElementById('request-notes').value, '');
  x.w.PT_REPAIR_CONTEXT.applyService('maintenance', {offer:'javascript:alert(1)'});
  assert.equal(x.d.getElementById('request-oil-offer').hidden, true);
});

test('campaign context cannot change a request in flight or after its saved receipt', async t => {
  const x = setup(t, {deferred:true});
  x.apply('maintenance'); x.send(); await settle();
  x.w.PT_REPAIR_CONTEXT.applyService('walnut');
  assert.equal(x.d.getElementById('request-service').value, 'maintenance');
  assert.equal(x.d.getElementById('request-notes').value, '');
  x.finish(); await settle();
  x.w.PT_REPAIR_CONTEXT.applyService('detailing');
  assert.equal(x.d.getElementById('request-service').value, 'maintenance');
  assert.equal(x.calls.length, 1);
});
