// Every remaining "Call — AI intake" button names the shop and number; the AI note sits under it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const disclosure = 'Fill out the form and Tony gets back to you faster.';
const heroPages = ['transmission-repair-fort-myers.html','oil-change-fort-myers.html','engine-rebuild-vs-replacement-fort-myers.html','paint-correction-detailing-fort-myers.html','repair-guide-ecu-tcm-programming.html'];
const barPages = [...heroPages,'walnut-blasting-fort-myers.html','engine-repair-fort-myers.html'];
const doc = page => new JSDOM(fs.readFileSync(new URL(`../${page}`, import.meta.url), 'utf8')).window.document;
for (const page of heroPages) test(`${page}: call button reads "Call the shop (239) 397-2048" with AI note`, () => {
  const call = [...doc(page).querySelectorAll('.btn[href="tel:+12393972048"]')];
  assert.equal(call.length, 1);
  assert.equal(call[0].textContent.trim(), 'Call the shop (239) 397-2048');
  assert.equal(call[0].parentElement.nextElementSibling.textContent.trim(), disclosure);
});
for (const page of barPages) test(`${page}: mobile bar call reads "Call Tony"`, () => {
  const a = doc(page).querySelector('.mobile-contact-bar a[href="tel:+12393972048"]');
  assert.equal(a.textContent.trim(), 'Call Tony');
});
