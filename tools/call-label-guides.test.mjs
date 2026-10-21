// Repair-guide call buttons show the shop number; the AI note sits under each one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const disclosure = 'An AI assistant takes your details first, and Tony calls you back to confirm.';
for (const page of ['repair-guide-ac-warm-at-idle.html','repair-guide-battery-keeps-dying.html','repair-guide-car-overheating.html','repair-guide-car-wont-start.html','repair-guide-flashing-check-engine-light.html','repair-guides.html']) test(`${page}: guide call buttons read "Call the shop (239) 397-2048" with AI note`, () => {
  const d = new JSDOM(fs.readFileSync(new URL(`../${page}`, import.meta.url), 'utf8')).window.document;
  const calls = [...d.querySelectorAll('.guide-actions a[href="tel:+12393972048"]')];
  assert.ok(calls.length >= 1);
  for (const c of calls) {
    assert.equal(c.textContent.trim(), 'Call the shop (239) 397-2048');
    assert.equal(c.parentElement.nextElementSibling.textContent.trim(), disclosure);
  }
});
