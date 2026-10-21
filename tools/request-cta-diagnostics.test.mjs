// Fuel-system and pre-purchase request links open the form on "Diagnosis / not sure yet" instead of a blank service.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
for (const page of ['fuel-system-repair-fort-myers.html','pre-purchase-inspection-fort-myers.html']) test(`${page}: request links pre-select diagnostics`, () => {
  const h = fs.readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
  assert.doesNotMatch(h, /href="\/#contact"/);
  assert.ok((h.match(/href="\/\?service=diagnostics#contact"/g) || []).length >= 6);
});
