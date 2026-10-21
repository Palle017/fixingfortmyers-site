// Everyday repair pages show the homepage's real Google rating and quote under the call button.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const home = read('index.html');
for (const page of ['brake-repair-fort-myers.html','ac-repair-fort-myers.html','auto-diagnostics-fort-myers.html','auto-repair-fort-myers.html']) test(`${page}: hero shows the homepage's real Google rating`, () => {
  const p = new JSDOM(read(page)).window.document.querySelector('.service-hero .service-rating');
  assert.ok(p);
  assert.match(p.querySelector('a').href, /^https:\/\/www\.google\.com\/maps\/place\/Perfect\+Timing/);
  assert.match(p.textContent, /★ 4\.8 from ~70 Google reviews/);
  assert.ok(home.includes('★ 4.8</strong> from ~70 Google reviews'));
  assert.ok(home.includes(`“${p.textContent.match(/“([^”]+)”/)[1]}”`));
});
