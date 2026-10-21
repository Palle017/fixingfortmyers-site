// Everyday repair pages read like a mechanic talking, not generic marketing filler.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const banned = /seamless|elevate|unparalleled|top-notch|cutting-edge|state-of-the-art|peace of mind|heart of the car|Methodical scan-tool|announce it first|symptom to investigate/i;
for (const page of ['auto-repair-fort-myers.html','brake-repair-fort-myers.html']) test(`${page}: no generic filler phrasing`, () => {
  assert.doesNotMatch(fs.readFileSync(new URL(`../${page}`, import.meta.url), 'utf8'), banned);
});
