// /fort-myers-mechanic (high-traffic) passes local relevance to the high-ticket pages
// with descriptive, city-bearing anchors in the body copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

test('mechanic page body links engine, transmission and diesel with Fort Myers anchors', () => {
  const d = new JSDOM(fs.readFileSync(new URL('../fort-myers-mechanic.html', import.meta.url), 'utf8')).window.document;
  const main = d.querySelector('main');
  for (const [href, text] of [['/engine-repair-fort-myers', 'Engine repair in Fort Myers'], ['/transmission-repair-fort-myers', 'Transmission repair in Fort Myers'], ['/diesel-repair-fort-myers', 'Diesel repair in Fort Myers']]) {
    const hits = [...main.querySelectorAll(`a[href="${href}"]`)].filter(a => a.textContent.trim() === text);
    assert.equal(hits.length, 1, `${href} anchor "${text}"`);
  }
});
