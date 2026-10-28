// Engine and workshop hero notes match the no-start page. Call labels stay plain.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const note = 'Send what you know. Tony reviews it and calls you back to confirm.';
// Same alternatives tools/check-clean-structure.mjs accepts for a service call button.
const structureCallLabel = /^Call(?: [\u2014-] AI intake| \(239\) 397-2048| the shop \(239\) 397-2048)?$/;

for (const page of ['workshop.html', 'engine-repair-fort-myers.html']) {
  test(`${page}: hero note is plain and AI assistant wording is gone`, () => {
    const html = fs.readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    const d = new JSDOM(html).window.document;
    const actions = d.querySelector('.service-hero .service-hero__actions');
    const call = [...actions.querySelectorAll('a[href="tel:+12393972048"]')];
    assert.equal(call.length, 1);
    assert.equal(call[0].textContent.trim(), 'Call the shop (239) 397-2048');
    assert.match(call[0].textContent.trim(), structureCallLabel);
    assert.match(call[0].className, /^btn btn--(primary|outline)$/);
    assert.equal(actions.nextElementSibling.textContent.trim(), note);
    assert.doesNotMatch(html, /AI assistant/);
    for (const el of d.querySelectorAll('[aria-label]')) {
      assert.doesNotMatch(el.getAttribute('aria-label') || '', /AI assistant/);
    }
  });
}
