// The A/C page reads like a mechanic talking; the penguin ad stays.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('ac-repair-fort-myers.html: no generic filler, penguin ad kept', () => {
  const h = fs.readFileSync(new URL('../ac-repair-fort-myers.html', import.meta.url), 'utf8');
  assert.doesNotMatch(h, /seamless|elevate|unparalleled|top-notch|Structured electronic testing|keeps the engine itself alive|A\/C problems can involve|compare system operation/i);
  assert.match(h, /cooler than a penguin in sunglasses/);
});
