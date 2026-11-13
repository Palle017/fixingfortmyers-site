// Phone hint, prefilled Text Tony messages, and detailing photo instructions.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM, VirtualConsole} from 'jsdom';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const SMS = 'sms:+12393972048?&body=Hi%20Tony%2C%20I%27d%20like%20help%20with%20my%20vehicle%3A%20';
const formPages = ['index.html', 'request-a-repair.html'];

function validator(t, page) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!/Not implemented/.test(error.message)) errors.push(error.message); });
  const dom = new JSDOM(read(page), {url: 'https://preview.invalid/' + page, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole});
  const w = dom.window, d = w.document;
  t.after(() => { w.close(); assert.deepEqual(errors, [], page); });
  w.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.PT_CONTACT_CONFIG = {endpoint: '', requestEndpoint: 'https://receiver.invalid/request-v1', googleClientId: ''};
  w.fetch = async () => { throw new Error('no network in this test'); };
  w.eval(read('request-form-v1.js'));
  const input = d.getElementById('request-phone'), error = d.getElementById('request-phone-error');
  assert.ok(input && error, page + ': phone field and its error slot');
  return {input, error, valid(value) {
    input.value = value;
    input.dispatchEvent(new w.Event('blur'));
    return input.getAttribute('aria-invalid') === 'false' && error.hidden && !error.textContent;
  }};
}

test('request form phone placeholder and error show (239) 555-0123; accepted formats stay the same', t => {
  const accepted = ['(239) 555-0123', '239-555-0123', '+1 (239) 555-0123', '2395550123'];
  const rejected = ['239-555-012', '555-0123', '239555012', 'abc-def-ghij', '239-555-01ab', 'call me'];
  for (const page of formPages) {
    const html = read(page);
    const d = new JSDOM(html).window.document;
    assert.equal(d.getElementById('request-phone').getAttribute('placeholder'), '(239) 555-0123', page);
    const {error, valid} = validator(t, page);
    for (const value of accepted) assert.equal(valid(value), true, `${page}: should accept ${JSON.stringify(value)}`);
    assert.equal(valid(''), false, `${page}: empty phone is rejected`);
    assert.match(error.textContent, /\(239\) 555-0123/);
    for (const value of rejected) assert.equal(valid(value), false, `${page}: should reject ${JSON.stringify(value)}`);
    assert.match(error.textContent, /\(239\) 555-0123/);
  }
});

test('every Text Tony sms link opens a prefilled cross-platform message', () => {
  const files = [
    ...fs.readdirSync(root).filter(name => name.endsWith('.html')).map(name => name),
    ...fs.readdirSync(new URL('blog/', root)).filter(name => name.endsWith('.html')).map(name => 'blog/' + name),
  ];
  let textTony = 0;
  for (const file of files) {
    const d = new JSDOM(read(file)).window.document;
    for (const a of d.querySelectorAll('a[href^="sms:+12393972048"]')) {
      const href = a.getAttribute('href');
      const label = a.textContent.replace(/\s+/g, ' ').trim();
      if (label !== 'Text Tony') continue;
      textTony += 1;
      assert.equal(href, SMS, `${file}: Text Tony href`);
      assert.ok(href.startsWith('sms:+12393972048?&body='), `${file}: cross-platform ?&body= form`);
    }
  }
  assert.ok(textTony >= 40, `expected many Text Tony links, found ${textTony}`);
});

test('homepage detailing card tells people to text photos to the shop number', () => {
  const d = new JSDOM(read('index.html')).window.document;
  const card = [...d.querySelectorAll('.service-card')].find(el => el.querySelector('.service-card__title')?.textContent.trim() === 'Professional car detailing');
  assert.ok(card, 'homepage detailing card');
  assert.match(card.textContent, /Text photos to \(239\) 397-2048/);
  assert.ok(d.querySelector('#penguin-ac a[href="/?service=ac#contact"]'), 'penguin-ac request link left unchanged');
});
