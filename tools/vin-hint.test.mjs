// The optional VIN field explains it gets a faster, exact price.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const hint = 'Optional. Your VIN helps Tony price the exact part faster.';
const read = n => fs.readFileSync(new URL('../' + n, import.meta.url), 'utf8');
for (const page of ['index.html', 'request-a-repair.html']) test(`${page}: VIN hint explains the faster exact price and VIN stays optional`, () => {
  const d = new JSDOM(read(page)).window.document;
  assert.equal(d.getElementById('request-vin-help').textContent, hint);
  const vin = d.getElementById('request-vin');
  assert.equal(vin.name, 'vin');
  assert.equal(vin.required, false);
});
test('parts.html: VIN note explains the faster exact price and VIN stays optional', () => {
  const d = new JSDOM(read('parts.html')).window.document;
  const vin = d.getElementById('parts-vin');
  assert.equal(vin.name, 'vin');
  assert.equal(vin.required, false);
  assert.equal(d.querySelector('label[for="parts-vin"] .field-note').textContent, hint);
});
test('request-form-v1.js restores the same VIN hint', () => assert.ok(read('request-form-v1.js').includes(hint)));
