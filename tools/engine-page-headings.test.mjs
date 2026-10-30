// Engine repair page: section headings name the service and city (local relevance),
// and stay free of the owner's banned snippet words.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

test('engine repair H2s carry service + city keywords and no banned words', () => {
  const d = new JSDOM(fs.readFileSync(new URL('../engine-repair-fort-myers.html', import.meta.url), 'utf8')).window.document;
  const h2 = [...d.querySelectorAll('h2.section-title')].map(h => h.textContent.trim());
  for (const want of ['Engine repair symptoms we diagnose in Fort Myers', 'How our Fort Myers engine repair works', 'Engine repair questions from Fort Myers drivers'])
    assert.ok(h2.includes(want), `missing H2: ${want}`);
  for (const text of h2) {
    assert.match(text, /engine/i, `generic H2: ${text}`);
    assert.doesNotMatch(text, /\bshop\b|mobile|pickup|by appointment|24\/7/i, `banned word in H2: ${text}`);
  }
});
