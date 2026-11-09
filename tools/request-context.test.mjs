// Exercise the real homepage's campaign links without contacting any receiver.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM, VirtualConsole} from 'jsdom';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const walnut = 'I would like an assessment for intake-valve carbon cleaning / walnut blasting. Promo code: WALNUT10.';
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(setImmediate); };

function setup(t, {search = '', deferred = false} = {}) {
  const errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', error => { if (!/Not implemented: navigation/.test(error.message)) errors.push(error.message); });
  const dom = new JSDOM(read('index.html'), {url:'https://preview.invalid/' + search, runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:vc});
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
  const click = key => {
    const link = [...d.querySelectorAll('a[href]')].find(a => {
      const url = new URL(a.href);
      return url.origin === w.location.origin && url.hash === '#contact' && url.searchParams.get('service') === key;
    });
    assert.ok(link, `existing ${key} campaign link`);
    link.dispatchEvent(new w.MouseEvent('click', {bubbles:true, cancelable:true, button:0}));
  };
  const send = () => {
    d.getElementById('request-name').value = 'Synthetic Context';
    d.getElementById('request-phone').value = '2395550100';
    d.getElementById('request-vehicle').value = '2014 Synthetic Vehicle';
    d.getElementById('bookingForm').dispatchEvent(new w.Event('submit', {bubbles:true, cancelable:true}));
  };
  return {w, d, calls, click, send, finish:() => resolve()};
}

test('same-page service links open one form with canonical service, without navigation or a submission', t => {
  for (const service of ['maintenance', 'detailing', 'walnut']) {
    const x = setup(t);
    x.click(service);
    assert.equal(x.d.getElementById('repair-request-dialog').open, true);
    assert.equal(x.d.querySelectorAll('#bookingForm').length, 1);
    assert.equal(x.d.getElementById('request-service').value, service);
    assert.equal(x.w.location.href, 'https://preview.invalid/');
    assert.equal(x.calls.length, 0);
  }
});

test('a walnut link carries the editable assessment and promo through the existing JSON submission', async t => {
  const x = setup(t);
  x.click('walnut');
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
  x.click('maintenance');
  assert.equal(x.d.getElementById('request-oil-offer').hidden, false);
  x.d.getElementById('request-notes').value = 'Keep my existing symptoms and code P0301.';
  x.d.getElementById('repair-request-dialog').close();
  x.click('walnut');
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
  x.click('walnut');
  assert.equal(x.d.getElementById('request-notes').value, walnut);
  x.w.PT_REPAIR_CONTEXT.applyService(null);
  assert.equal(x.d.getElementById('request-notes').value, walnut);
  assert.equal(x.d.getElementById('request-service').value, 'walnut');
  x.d.getElementById('repair-request-dialog').close();
  x.click('detailing');
  assert.equal(x.d.getElementById('request-notes').value, '');
  assert.equal(x.d.getElementById('request-service').value, 'detailing');
});

test('unsupported service and offer text cannot enter campaign context', t => {
  const x = setup(t);
  x.click('detailing');
  x.w.PT_REPAIR_CONTEXT.applyService('<script>alert(1)</script>', {offer:'liquimoly-labor50'});
  assert.equal(x.d.getElementById('request-service').value, 'detailing');
  assert.equal(x.d.getElementById('request-oil-offer').hidden, true);
  assert.equal(x.d.getElementById('request-notes').value, '');
  x.w.PT_REPAIR_CONTEXT.applyService('maintenance', {offer:'javascript:alert(1)'});
  assert.equal(x.d.getElementById('request-oil-offer').hidden, true);
});

test('campaign context cannot change a request in flight or after its saved receipt', async t => {
  const x = setup(t, {deferred:true});
  x.click('maintenance'); x.send(); await settle();
  x.w.PT_REPAIR_CONTEXT.applyService('walnut');
  assert.equal(x.d.getElementById('request-service').value, 'maintenance');
  assert.equal(x.d.getElementById('request-notes').value, '');
  x.finish(); await settle();
  x.w.PT_REPAIR_CONTEXT.applyService('detailing');
  assert.equal(x.d.getElementById('request-service').value, 'maintenance');
  assert.equal(x.calls.length, 1);
});
