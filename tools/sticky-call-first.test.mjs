// Sticky mobile bar: "Call Tony" is the first, primary-styled action on every page.
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
  // Calls reach an AI assistant first; the bar's accessible name keeps saying so.
  if (['workshop.html', 'index.html'].includes(page)) {
    assert.equal(bar.getAttribute('aria-label'), 'Repair help: call Tony or request a repair');
  } else if (bar.getAttribute('aria-label').startsWith('Repair help') && links[1].textContent === 'Request a repair') {
    assert.equal(bar.getAttribute('aria-label'), 'Repair help: call the shop (an AI assistant answers first) or request a repair');
  }
  // The first link takes the bright base style; only the second gets the muted a+a style.
  const bundles = [...document.querySelectorAll('link[rel="stylesheet"][href*="bundle-page-"]')].map(link => read(link.getAttribute('href').split('?')[0].replace(/^\//, '')));
  assert.ok(bundles.some(css => css.includes('.mobile-contact-bar a+a{background:#172c40')), page + ': missing the secondary sticky-bar style');
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
