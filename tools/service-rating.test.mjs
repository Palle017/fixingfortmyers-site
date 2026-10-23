// The workshop and engine pages show the same real Google rating and quote as the homepage, linked to the profile.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const home = read('index.html');
for (const page of ['workshop.html','engine-repair-fort-myers.html']) test(`${page}: hero shows the homepage's real Google rating`, () => {
  const d = new JSDOM(read(page)).window.document;
  const p = d.querySelector('.service-hero .service-rating');
  assert.ok(p);
  const a = p.querySelector('a');
  assert.match(a.href, /^https:\/\/www\.google\.com\/maps\/place\/Perfect\+Timing/);
  assert.match(a.textContent, /★ 4\.8 from ~70 Google reviews/);
  assert.ok(home.includes('★ 4.8</strong> from ~70 Google reviews'), 'rating must match the homepage');
  const quote = p.textContent.match(/“([^”]+)”/)[1];
  assert.ok(home.includes(`“${quote}”`), 'quote must be an existing homepage review');
});

test('walnut blasting: inquiry block offers Google review proof and a direct text action', () => {
  const doc = new JSDOM(read('walnut-blasting-fort-myers.html')).window.document;
  const block = [...doc.querySelectorAll('.service-panel')].find(el => el.querySelector('h2')?.textContent?.includes('Tell us about your engine'));
  assert.ok(block, 'walnut inquiry block exists');
  assert.equal(block.querySelector('a[href^="sms:"]')?.getAttribute('href'), 'sms:+12393972048');
  assert.match(block.querySelector('a[href^="sms:"]')?.textContent, /Text Tony/);
  assert.match(block.querySelector('.service-rating a[href^="https://www.google.com/maps/place/"]')?.textContent || '', /customer reviews on Google/);
  assert.equal(block.querySelector('a[href^="/request-a-repair"]')?.getAttribute('href'), '/request-a-repair?service=walnut');
});
