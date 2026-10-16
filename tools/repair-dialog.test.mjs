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
  const opener = d.querySelector('#hero-appointment-continue');
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
test('close and reopen preserve unsent entries, consent and location pin', t => {
  const {d, click, calls} = setup(t);
  const opener = d.querySelector('#hero-appointment-continue');
  click(opener);
  d.getElementById('request-details').value = 'Synthetic unsent no-start notes';
  d.getElementById('request-city').value = '33901';
  d.getElementById('request-latitude').value = '26.64';
  d.getElementById('request-sms-consent').checked = true;
  const form = d.getElementById('bookingForm');
  click(d.querySelector('.repair-dialog__close'));
  click(opener);
  assert.equal(d.getElementById('bookingForm'), form);
  assert.equal(d.querySelectorAll('#bookingForm').length, 1);
  assert.equal(d.getElementById('request-details').value, 'Synthetic unsent no-start notes');
  assert.equal(d.getElementById('request-city').value, '33901');
  assert.equal(d.getElementById('request-latitude').value, '26.64');
  assert.equal(d.getElementById('request-sms-consent').checked, true);
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
test('AI preparation opens a review popup without submitting a lead or checking consent', async t => {
  const {d, w, calls} = setup(t);
  w.matchMedia = () => ({matches:false});
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.PT_CONTACT_CONFIG = {endpoint:''};
  let tool;
  d.modelContext = {registerTool(value) { tool = value; }};
  w.eval(markup('site.js'));
  await settle();
  const result = tool.execute({details:'Synthetic no-start review', locationChoice:'dropoff', city:'33901', name:'Synthetic Review'});
  assert.equal(result.status, 'ready_for_review');
  assert.equal(result.submitted, false);
  assert.equal(d.getElementById('repair-request-dialog').open, true);
  assert.equal(d.activeElement.id, 'request-submit');
  assert.equal(d.getElementById('request-sms-consent').checked, false);
  assert.deepEqual(calls, []);
});

test('asking Bay One from the repair popup closes the native modal before opening chat and preserves the form', async t => {
  const {d, w, click} = setup(t);
  w.matchMedia = () => ({matches:false});
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.PT_CONTACT_CONFIG = {endpoint:''};
  w.PT_BAYONE_CONFIG = {enabled:true, endpoint:'https://chat.invalid'};
  const requests = [];
  w.fetch = async target => {
    const route = new URL(target).pathname; requests.push(route);
    return {ok:true, status:200, json:async () => route === '/healthz' ? {ok:true, chat:'ready'} : {ok:true, visitor_token:'synthetic-token'}};
  };
  w.eval(markup('site.js')); w.eval(markup('bay-one-widget.js'));
  // Native close events arrive later, after close() returns; keep that ordering.
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    w.setTimeout(() => this.dispatchEvent(new w.Event('close')), 0);
  };
  d.getElementById('hero-appointment-date').value = '2099-01-15';
  d.getElementById('hero-appointment-time').value = '10:30';
  d.getElementById('hero-appointment-time').dispatchEvent(new w.Event('input', {bubbles:true}));
  click(d.querySelector('#hero-appointment-continue'));
  const dialog = d.getElementById('repair-request-dialog'), form = d.getElementById('bookingForm');
  d.getElementById('request-details').value = 'Synthetic unsent no-start notes';
  d.getElementById('request-phone').value = '2395550100';
  d.getElementById('request-sms-consent').checked = true;
  const helper = d.getElementById('request-bay-one');
  assert.equal(helper.hidden, false);
  click(helper);
  assert.equal(dialog.open, false, 'a body-level chat would be inert behind an open native modal');
  assert.equal(d.querySelector('.b1-panel').hidden, true, 'chat waits for the repair form close handler');
  await new Promise(resolve => w.setTimeout(resolve, 0)); await settle();
  assert.equal(d.querySelector('.b1-panel').hidden, false);
  assert.equal(d.activeElement.className, 'b1-close', 'the modal close handler cannot steal chat focus');
  assert.equal(d.getElementById('bookingForm'), form);
  assert.ok(form.closest('.home-start__grid'));
  assert.equal(d.getElementById('request-details').value, 'Synthetic unsent no-start notes');
  assert.equal(d.getElementById('request-phone').value, '2395550100');
  assert.equal(d.getElementById('request-sms-consent').checked, true);
  const message = d.getElementById('b1-message'); message.value = 'Additional synthetic notes from Bay One.';
  click(d.querySelector('.b1-contact'));
  await new Promise(resolve => w.setTimeout(resolve, 0)); await settle();
  assert.equal(dialog.open, true, 'the handoff reopens the same repair form for review');
  assert.equal(d.querySelector('.b1-panel').hidden, true);
  assert.match(d.getElementById('request-details').value, /Synthetic unsent no-start notes[\s\S]*Additional synthetic notes/);
  assert.equal(d.getElementById('bookingForm'), form);
  assert.equal(requests.some(route => route.startsWith('/hooks/')), false, 'opening help and reviewing notes sends no repair request');
});
