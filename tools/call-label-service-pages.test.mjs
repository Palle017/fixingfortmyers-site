// Service-page hero call buttons show the shop number instead of a bare "Call"; the AI note sits under them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const disclosure = 'An AI assistant takes your details first, and Tony calls you back to confirm.';
const pages = ["ac-repair-fort-myers.html", "alternator-starter-repair-fort-myers.html", "auto-diagnostics-fort-myers.html", "auto-electrical-repair-fort-myers.html", "auto-repair-cape-coral.html", "auto-repair-fort-myers.html", "auto-repair-lehigh-acres.html", "auto-repair-north-fort-myers.html", "battery-replacement-fort-myers.html", "blue-smoke-burning-oil-fort-myers.html", "brake-repair-fort-myers.html", "car-audio-installation-fort-myers.html", "check-engine-light-diagnosis-fort-myers.html", "cooling-system-repair-fort-myers.html", "diesel-repair-fort-myers.html", "detailing-fort-myers.html", "engine-knocking-noise-fort-myers.html", "exhaust-emissions-repair-fort-myers.html", "fort-myers-mechanic.html", "fuel-system-repair-fort-myers.html", "head-gasket-overheating-damage-fort-myers.html", "hot-rod-restoration-fort-myers.html", "module-programming-fort-myers.html", "no-start-diagnosis-fort-myers.html", "pre-purchase-inspection-fort-myers.html", "race-car-modifications-fort-myers.html", "suspension-steering-repair-fort-myers.html", "transmission-slipping-fort-myers.html"];
for (const page of pages) test(`${page}: hero call reads "Call the shop (239) 397-2048" with AI note`, () => {
  const d = new JSDOM(fs.readFileSync(new URL(`../${page}`, import.meta.url), 'utf8')).window.document;
  const actions = d.querySelector('.service-hero__actions');
  const call = [...actions.querySelectorAll('a[href="tel:+12393972048"]')];
  assert.equal(call.length, 1);
  assert.equal(call[0].textContent.trim(), 'Call the shop (239) 397-2048');
  assert.equal(actions.nextElementSibling.textContent.trim(), disclosure);
});
