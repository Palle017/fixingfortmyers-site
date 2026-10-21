// The main call button names the shop and number; the AI disclosure sits directly under it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const disclosure = 'An AI assistant takes your details first, and Tony calls you back to confirm.';
for (const page of ['workshop.html', 'engine-repair-fort-myers.html']) {
  test(`${page}: main call button reads "Call the shop (239) 397-2048" with the AI disclosure under it`, () => {
    const d = new JSDOM(fs.readFileSync(new URL(`../${page}`, import.meta.url), 'utf8')).window.document;
    const actions = d.querySelector('.service-hero .service-hero__actions');
    const call = [...actions.querySelectorAll('a[href="tel:+12393972048"]')];
    assert.equal(call.length, 1);
    assert.equal(call[0].textContent.trim(), 'Call the shop (239) 397-2048');
    assert.match(call[0].className, /^btn btn--(primary|outline)$/);
    assert.equal(actions.nextElementSibling.textContent.trim(), disclosure);
    assert.doesNotMatch(actions.textContent, /AI intake/);
  });
}
