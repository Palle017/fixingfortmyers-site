// Funnel regression guard (added after form leads fell to zero Oct 20-30, 2026).
// Runs the real contact-config.js under the production hostname, then the page's own
// deferred scripts in document order, and fills and submits the form like a visitor.
// fetch is ALWAYS stubbed with a fake receiver: no network request is made and no
// live lead is ever sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM, VirtualConsole} from 'jsdom';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate); };
const LOCAL = ['/repair-dialog.js', '/contact-config.js', '/request-form-v1.js', '/site.js', '/repair-form-calm.js'];

function load(t, page, search = '') {
  const errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/Not implemented/.test(e.message)) errors.push(e.message); });
  const html = read(page);
  const dom = new JSDOM(html, {url: 'https://fixingfortmyers.com/' + (page === 'index.html' ? '' : page.replace(/\.html$/, '')) + search, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc});
  const w = dom.window, calls = [];
  t.after(() => { w.close(); assert.deepEqual(errors, []); });
  w.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
  w.HTMLElement.prototype.scrollIntoView = function () {};
  if (!w.HTMLDialogElement?.prototype.showModal && w.HTMLDialogElement) w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  // Fake receiver only. Real network is never reached.
  w.fetch = async (url, options = {}) => {
    calls.push({url: String(url), ...options, body: options.body ? JSON.parse(options.body) : null});
    return {ok: true, status: 201, json: async () => ({ok: true, received: true, id: 'fake-receipt-0001'})};
  };
  const order = [...w.document.querySelectorAll('script[src]')].map(s => s.getAttribute('src').split('?')[0]).filter(src => LOCAL.includes(src));
  for (const src of order) w.eval(read(src.slice(1)));
  return {w, d: w.document, calls, order};
}

for (const page of ['index.html', 'request-a-repair.html']) {
  test(`${page}: production config loads before the form and a visitor submission reaches the configured receiver`, async t => {
    const x = load(t, page, page === 'request-a-repair.html' ? '?service=engine' : '');
    assert.ok(x.order.indexOf('/contact-config.js') < x.order.indexOf('/request-form-v1.js'), 'contact-config must load before request-form-v1');
    const endpoint = x.w.PT_CONTACT_CONFIG.requestEndpoint;
    assert.match(endpoint, /^https:\/\//, 'production requestEndpoint must be set on fixingfortmyers.com');
    const form = x.d.getElementById('bookingForm');
    assert.equal(form.dataset.intakeVersion, '1');
    const enter = (id, v) => { const f = x.d.getElementById(id); f.value = v; f.dispatchEvent(new x.w.Event('input', {bubbles: true})); };
    enter('request-name', 'Synthetic Visitor');
    enter('request-phone', '(239) 555-0100');
    enter('request-vehicle', '2016 Ford F-250');
    form.dispatchEvent(new x.w.Event('submit', {bubbles: true, cancelable: true}));
    await settle();
    const leads = x.calls.filter(c => c.url === endpoint);
    assert.equal(leads.length, 1, 'exactly one lead POST to the fake receiver');
    x.calls.splice(0, x.calls.length, ...leads);
    assert.equal(x.calls[0].method, 'POST');
    assert.equal(x.calls[0].body.phone, '2395550100');
    assert.equal(x.calls[0].body.source, 'site_form_v1');
    if (page === 'request-a-repair.html') assert.equal(x.calls[0].body.service, 'engine');
    assert.equal(x.d.getElementById('request-done').hidden, false, 'visitor sees the receipt');
  });
}

test('every request-a-repair link on public pages points at the real form page', () => {
  const files = fs.readdirSync(new URL('.', root)).filter(f => f.endsWith('.html'));
  assert.ok(fs.existsSync(new URL('request-a-repair.html', root)));
  let links = 0;
  for (const f of files) for (const m of read(f).matchAll(/href="([^"]*request-a-repair[^"]*)"/g)) {
    links++;
    assert.match(m[1], /^(https:\/\/fixingfortmyers\.com)?\/?request-a-repair(\.html)?(\?service=[a-z-]+)?(#[a-z-]+)?$/, `${f}: ${m[1]}`);
  }
  assert.ok(links > 50, `expected many request links, found ${links}`);
});
