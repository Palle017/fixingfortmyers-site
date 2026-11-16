// First interaction on the v1 request form fires form_start (GA4) and form_started (intake) once.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM, VirtualConsole} from 'jsdom';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(setImmediate); };

function setup(t, {page = 'request-a-repair.html'} = {}) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!/Not implemented: navigation/.test(error.message)) errors.push(error.message); });
  const path = page === 'index.html' ? '/' : '/' + page.replace(/\.html$/, '');
  const dom = new JSDOM(read(page), {
    url: 'https://fixingfortmyers.com' + path,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const w = dom.window, d = w.document, calls = [];
  t.after(() => { w.close(); assert.deepEqual(errors, []); });
  w.matchMedia = () => ({matches: false});
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.PT_CONTACT_CONFIG = {endpoint: 'https://receiver.invalid', requestEndpoint: 'https://receiver.invalid/request-v1', googleClientId: ''};
  w.fetch = async (url, options = {}) => {
    const address = String(url);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({url: address, body});
    return {ok: true, status: 200, json: async () => ({ok: true})};
  };
  w.eval(read('request-form-v1.js'));
  w.eval(read('site.js'));
  return {w, d, form: d.getElementById('bookingForm'), calls};
}

const started = calls => calls.filter(call => call.url.endsWith('/hooks/analytics/event') && call.body?.event === 'form_started');
const layer = w => Array.from(w.dataLayer || []).filter(entry => entry.event === 'form_start');

test('first form interaction sends form_start and form_started once per page load', async t => {
  for (const page of ['request-a-repair.html', 'index.html']) {
    const x = setup(t, {page});
    await settle();
    assert.equal(started(x.calls).length, 0, page + ': no start before interaction');
    const name = x.d.getElementById('request-name');
    name.dispatchEvent(new x.w.Event('focusin', {bubbles: true}));
    await settle();
    assert.equal(started(x.calls).length, 1, page + ': intake form_started');
    assert.equal(started(x.calls)[0].body.event, 'form_started');
    assert.equal(layer(x.w).length, 1, page + ': GA4 form_start');
    name.value = 'Synthetic Customer';
    name.dispatchEvent(new x.w.Event('input', {bubbles: true}));
    x.d.getElementById('request-phone').dispatchEvent(new x.w.Event('change', {bubbles: true}));
    await settle();
    assert.equal(started(x.calls).length, 1, page + ': still once after later input');
    assert.equal(layer(x.w).length, 1, page + ': still one form_start');
  }
});

test('request-form-v1.js cache tag was bumped with the form-start fix', () => {
  const html = read('request-a-repair.html') + read('index.html');
  assert.match(html, /request-form-v1\.js\?v=20261116-form-start/);
  assert.match(html, /site\.js\?v=20261116-form-start/);
});
