// Contact-card call labels use plain words and still say an AI assistant answers calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const pages = ["ac-repair-fort-myers.html", "alternator-starter-repair-fort-myers.html", "auto-diagnostics-fort-myers.html", "auto-electrical-repair-fort-myers.html", "auto-repair-cape-coral.html", "auto-repair-fort-myers.html", "auto-repair-lehigh-acres.html", "auto-repair-north-fort-myers.html", "battery-replacement-fort-myers.html", "blue-smoke-burning-oil-fort-myers.html", "brake-repair-fort-myers.html", "car-audio-installation-fort-myers.html", "check-engine-light-diagnosis-fort-myers.html", "cooling-system-repair-fort-myers.html", "diesel-repair-fort-myers.html", "detailing-fort-myers.html", "engine-knocking-noise-fort-myers.html", "engine-rebuild-vs-replacement-fort-myers.html", "engine-repair-fort-myers.html", "exhaust-emissions-repair-fort-myers.html", "fort-myers-mechanic.html", "fuel-system-repair-fort-myers.html", "head-gasket-overheating-damage-fort-myers.html", "hot-rod-restoration-fort-myers.html", "module-programming-fort-myers.html", "no-start-diagnosis-fort-myers.html", "oil-change-fort-myers.html", "paint-correction-detailing-fort-myers.html", "pre-purchase-inspection-fort-myers.html", "race-car-modifications-fort-myers.html", "suspension-steering-repair-fort-myers.html", "transmission-repair-fort-myers.html", "transmission-slipping-fort-myers.html", "workshop.html"];
for (const page of pages) test(`${page}: contact card says an AI assistant answers calls, in plain words`, () => {
  const h = fs.readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
  assert.match(h, /contact-detail__label">Call \(an AI assistant answers first\) · Text the shop directly</);
  assert.doesNotMatch(h, /contact-detail__label">[^<]*AI intake/);
});
