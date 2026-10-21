// Request-repair links pre-select the service that matches the page, not "Engine" by default.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
test('workshop.html: request links open the form on "Diagnosis / not sure yet", not Engine', () => {
  const h = read('workshop.html');
  assert.doesNotMatch(h, /\?service=engine/);
  assert.ok((h.match(/href="\/\?service=diagnostics#contact"/g) || []).length >= 5);
});
test('cooling-system-repair-fort-myers.html: request links pre-select the cooling service', () => {
  const h = read('cooling-system-repair-fort-myers.html');
  assert.doesNotMatch(h, /href="\/#contact"/);
  assert.ok((h.match(/href="\/\?service=cooling#contact"/g) || []).length >= 6);
});
