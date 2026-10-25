// Native focus containment/Escape are checked separately in the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM, VirtualConsole} from 'jsdom';
const root = new URL('../', import.meta.url);
const markup = name => fs.readFileSync(new URL(name, root), 'utf8');
const settle = async () => { for (let n = 0; n < 4; n++) await new Promise(setImmediate); };
function setup(t, {page = 'index.html', url = 'https://preview.invalid/', supported = true} = {}) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(markup(page), {url, runScripts:'outside-only', pretendToBeVisual:true, virtualConsole});
  const w = dom.window, d = w.document;
  t.after(() => { w.close(); assert.deepEqual(errors, []); });
  if (supported) {
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  }
  const calls = [];
  w.fetch = async target => { calls.push(target); throw Error('Opening the form must not send data.'); };
  w.eval(markup('repair-dialog.js'));
  const click = target => {
    target.getClientRects = () => [{width:100, height:44}];
    return target.dispatchEvent(new w.MouseEvent('click', {bubbles:true, cancelable:true, button:0}));
  };
  return {w, d, click, calls};
}
test('repair action opens the same form, then closing restores it and returns focus', t => {
  const {d, click, calls} = setup(t);
  const form = d.getElementById('bookingForm'), panel = d.getElementById('contact');
  const dialog = d.getElementById('repair-request-dialog');
  const opener = d.querySelector('.home-start__actions .btn--primary');
  assert.equal(dialog.open, false);
  assert.ok(panel.closest('.home-start__grid'));
  assert.equal(click(opener), false);
  assert.equal(dialog.open, true);
  assert.equal(dialog.querySelector('form'), form);
  assert.equal(d.activeElement.id, 'request-heading');
  assert.equal(d.documentElement.classList.contains('repair-dialog-open'), true);
  click(dialog.querySelector('button'));
  assert.equal(dialog.open, false);
  assert.ok(panel.closest('.home-start__grid'));
  assert.equal(d.activeElement, opener);
  assert.deepEqual(calls, []);
});
test('close and reopen preserve unsent vehicle, VIN and callback choice', t => {
  const {d, click, calls} = setup(t);
  const opener = d.querySelector('.home-start__actions .btn--primary');
  click(opener);
  d.getElementById('request-vehicle').value = '2014 Synthetic Civic';
  d.getElementById('request-vin').value = '1HGCM82633A004352';
  d.getElementById('callback-tomorrow').checked = true;
  const form = d.getElementById('bookingForm');
  click(d.querySelector('.repair-dialog__close'));
  click(opener);
  assert.equal(d.getElementById('bookingForm'), form);
  assert.equal(d.querySelectorAll('#bookingForm').length, 1);
  assert.equal(d.getElementById('request-vehicle').value, '2014 Synthetic Civic');
  assert.equal(d.getElementById('request-vin').value, '1HGCM82633A004352');
  assert.equal(d.getElementById('callback-tomorrow').checked, true);
  assert.deepEqual(calls, []);
});
test('service deep link opens the form; closing removes only the contact fragment', t => {
  const {d, w, click} = setup(t, {url:'https://preview.invalid/?service=transmission&utm_source=google#contact'});
  assert.equal(d.getElementById('repair-request-dialog').open, true);
  click(d.querySelector('.repair-dialog__close'));
  assert.equal(w.location.hash, '');
  assert.equal(w.location.search, '?service=transmission&utm_source=google');
});
test('dedicated request page opens immediately with the current homepage form', t => {
  const {d, calls} = setup(t, {page:'request-a-repair.html', url:'https://preview.invalid/request-a-repair'});
  const home = new JSDOM(markup('index.html'));
  t.after(() => home.window.close());
  assert.equal(d.getElementById('repair-request-dialog').open, true);
  assert.equal(d.getElementById('contact').outerHTML, home.window.document.getElementById('contact').outerHTML.replace('id="request-heading"', 'id="request-heading" tabindex="-1"'));
  assert.equal(d.querySelector('link[rel=canonical]').href, 'https://fixingfortmyers.com/request-a-repair');
  assert.match(d.querySelector('meta[name=robots]').content, /noindex/);
  assert.deepEqual(calls, []);
});
test('unsupported dialog browsers keep the inline form and contact fallback', t => {
  const {d, calls} = setup(t, {supported:false, url:'https://preview.invalid/#contact'});
  assert.equal(d.getElementById('repair-request-dialog'), null);
  assert.ok(d.getElementById('bookingForm').closest('.home-start__grid'));
  assert.ok(d.querySelector('noscript a[href="tel:+12393972048"]'));
  assert.deepEqual(calls, []);
});
test('review event opens the same minimal form without an automatic lead submission', async t => {
  const {d, w, calls} = setup(t);
  w.matchMedia = () => ({matches:false});
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.PT_CONTACT_CONFIG = {endpoint:''};
  let tool;
  d.modelContext = {registerTool(value) { tool = value; }};
  w.eval(markup('site.js'));
  await settle();
  assert.equal(tool, undefined, 'the legacy location preparation tool is not registered for v1');
  d.getElementById('bookingForm').dispatchEvent(new w.Event('pt:repair-review'));
  assert.equal(d.getElementById('repair-request-dialog').open, true);
  assert.equal(d.activeElement.id, 'request-heading');
  assert.equal(d.getElementById('request-sms-consent'), null);
  assert.deepEqual(calls, []);
});
