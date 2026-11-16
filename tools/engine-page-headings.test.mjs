// Engine repair page: section headings name the service and city (local relevance),
// and stay free of the owner's banned snippet words.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

test('engine repair H2s carry service + city keywords and no banned words', () => {
  const d = new JSDOM(fs.readFileSync(new URL('../engine-repair-fort-myers.html', import.meta.url), 'utf8')).window.document;
  const h2 = [...d.querySelectorAll('h2.section-title')].map(h => h.textContent.trim());
  for (const want of ['Engine repair symptoms we diagnose in Fort Myers', 'Engine jobs Tony handles in Fort Myers', 'How our Fort Myers engine repair works', 'Engine repair questions from Fort Myers drivers'])
    assert.ok(h2.includes(want), `missing H2: ${want}`);
  for (const text of h2) {
    assert.match(text, /engine/i, `generic H2: ${text}`);
    assert.doesNotMatch(text, /\bshop\b|mobile|pickup|by appointment|24\/7/i, `banned word in H2: ${text}`);
  }
});


test('engine page links related engine topics and keeps six visible FAQs', () => {
  const html = fs.readFileSync(new URL('../engine-repair-fort-myers.html', import.meta.url), 'utf8');
  const d = new JSDOM(html).window.document;
  for (const href of [
    '/engine-repair-cape-coral',
    '/engine-knocking-noise-fort-myers',
    '/head-gasket-overheating-damage-fort-myers',
    '/engine-rebuild-vs-replacement-fort-myers',
    '/blue-smoke-burning-oil-fort-myers',
  ]) assert.ok(d.querySelector(`a[href="${href}"]`), `missing link ${href}`);
  assert.equal(d.querySelectorAll('.faq-item').length, 6);
  const cape = new JSDOM(fs.readFileSync(new URL('../engine-repair-cape-coral.html', import.meta.url), 'utf8')).window.document;
  assert.ok(cape.querySelector('a[href="/engine-repair-fort-myers"]'), 'Cape Coral is missing a back link');
});
