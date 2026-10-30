// Sticky mobile bar: "Call Tony" comes first and "Request a repair" is an equal-weight full button beside it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
const pages = fs.readdirSync(root).filter(name => name.endsWith('.html') && read(name).includes('class="mobile-contact-bar"'));

test('sticky bar is still on every public page', () => {
  assert.ok(pages.length >= 53, `only ${pages.length} pages have the sticky bar`);
});

for (const page of pages) test(`${page}: sticky bar leads with "Call Tony" in the primary style`, () => {
  const document = new JSDOM(read(page)).window.document;
  const bar = document.querySelector('.mobile-contact-bar');
  const links = [...bar.children];
  assert.equal(links.length, 2);
  assert.equal(links[0].getAttribute('href'), 'tel:+12393972048');
  assert.equal(links[0].textContent, 'Call Tony');
  assert.notEqual(links[1].getAttribute('href'), 'tel:+12393972048');
  // The bar's accessible name is plain, with no AI-assistant wording.
  if (page === 'workshop.html' || (bar.getAttribute('aria-label').startsWith('Repair help') && links[1].textContent === 'Request a repair')) {
    assert.equal(bar.getAttribute('aria-label'), 'Repair help: call Tony or request a repair');
  }
  // Both actions are full, equal-weight buttons: side by side, >=44px tall, no muted secondary style.
  const bundles = [...document.querySelectorAll('link[rel="stylesheet"][href*="bundle-page-"]')].map(link => read(link.getAttribute('href').split('?')[0].replace(/^\//, '')));
  const direct = [...document.querySelectorAll('link[rel="stylesheet"]:not([href*="bundle-"])')].map(link => link.getAttribute('href').split('?')[0].replace(/^\//, '')).filter(name => /^[a-z0-9-]+\.css$/.test(name)).map(read);
  const css = [...bundles, ...direct].join('\n');
  assert.ok(!css.includes('.mobile-contact-bar a+a{background:#172c40'), page + ': request button still uses the muted style');
  assert.ok(css.includes('.mobile-contact-bar a+a{background:#fff'), page + ': request button is not a full filled button');
  assert.ok(!/\.mobile-contact-bar\{grid-template-columns:minmax\(0,\.8fr\)/.test(css) && !/\.mobile-contact-bar\{grid-template-columns:(?!minmax\(0,1fr\) minmax\(0,1fr\)|1fr 1fr)/.test(css), page + ': buttons are not equal width');
  assert.ok(/\.mobile-contact-bar\{display:grid;grid-template-columns:1fr 1fr/.test(css), page + ': buttons are not side by side');
  const heights = [...css.matchAll(/\.mobile-contact-bar a\{[^}]*min-height:(\d+)px/g)].map(match => Number(match[1]));
  assert.ok(heights.length && heights.every(height => height >= 44), page + ': sticky buttons shorter than 44px');
});

test('high-ticket "Quick contact" pages keep the "Call Tony" label after site.js runs', () => {
  for (const page of ['engine-repair-fort-myers.html', 'transmission-repair-fort-myers.html']) {
    const dom = new JSDOM(read(page), {url: 'https://preview.invalid/' + page.replace(/\.html$/, ''), runScripts: 'outside-only'});
    dom.window.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
    dom.window.eval(read('site.js'));
    const call = dom.window.document.querySelector('.mobile-contact-bar a[href="tel:+12393972048"]');
    assert.equal(call.textContent, 'Call Tony', page);
    assert.equal(call.getAttribute('aria-label'), null, page);
    dom.window.close();
  }
});
