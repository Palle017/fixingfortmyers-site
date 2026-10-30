// Regression: every page that loads request-form-v1.js accepts the phone formats people
// and autofill actually type, and every page with the request form loads the current script.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM, VirtualConsole} from 'jsdom';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const html = fs.readdirSync(root).filter(name => name.endsWith('.html')).sort();
const scriptTag = /<script\b[^>]*\bsrc="\/?request-form-v1\.js(?:\?v=([^"]*))?"[^>]*>/g;
const tagsOf = page => [...read(page).matchAll(scriptTag)].map(match => match[1] ?? '');
const scriptPages = html.filter(page => tagsOf(page).length);
const formPages = html.filter(page => /id="bookingForm"/.test(read(page)));
// The current version tag is the one the main request page ships.
const current = tagsOf('request-a-repair.html')[0];

const accepted = ['(239) 555-0123', '239-555-0123', '+1 (239) 555-0123', '2395550123'];
const rejected = ['239-555-012', '555-0123', '239555012', 'abc-def-ghij', '239-555-01ab', 'call me'];

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
  return value => {
    input.value = value;
    input.dispatchEvent(new w.Event('blur'));
    return input.getAttribute('aria-invalid') === 'false' && error.hidden && !error.textContent;
  };
}

test('request form pages and the current version tag are found', () => {
  assert.ok(scriptPages.length >= 2, 'expected at least two pages loading request-form-v1.js');
  assert.ok(formPages.length >= 2, 'expected at least two pages with the request form');
  assert.match(current || '', /\S/, 'request-a-repair.html must load request-form-v1.js with a ?v= tag');
});

for (const page of scriptPages) test(`${page}: phone field accepts common formats and rejects short or lettered input`, t => {
  const valid = validator(t, page);
  for (const value of accepted) assert.equal(valid(value), true, `${page}: should accept ${JSON.stringify(value)}`);
  for (const value of rejected) assert.equal(valid(value), false, `${page}: should reject ${JSON.stringify(value)}`);
});

for (const page of formPages) test(`${page}: request form loads request-form-v1.js once with the current version tag`, () => {
  assert.deepEqual(tagsOf(page), [current], `${page}: expected request-form-v1.js?v=${current}`);
});
