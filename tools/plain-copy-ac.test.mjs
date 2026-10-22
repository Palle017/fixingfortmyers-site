// The A/C page reads like a mechanic talking; the penguin ad stays.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('ac-repair-fort-myers.html: plain car AC repair copy, penguin ad kept', () => {
  const h = fs.readFileSync(new URL('../ac-repair-fort-myers.html', import.meta.url), 'utf8');
  assert.doesNotMatch(h, /seamless|elevate|unparalleled|top-notch|Structured electronic testing|keeps the engine itself alive|A\/C problems can involve|compare system operation/i);
  assert.match(h, /<section class="penguin-ac" id="penguin-ac"/);
  assert.match(h, /src="\/assets\/penguin-ac-corrected\.webp"/);
  assert.match(h, /<h2 id="penguin-ac-title">Warm air at idle, weak airflow or a recharge that didn't last\? We test it the way it fails for you\.<\/h2>/);
  assert.match(h, /alt="Perfect Timing Auto Repair A\/C ad: a penguin in sunglasses surrounded by snow on a sunny beach\. Warm air at idle, weak airflow or a recharge that didn't last\? We test it the way it fails for you\. Call \(239\) 397-2048\."/);
  assert.match(h, /<strong>Tell us when it stops cooling and we'll find out why\.<\/strong>/);
  assert.match(h, /Request A\/C service/);
  assert.equal((h.match(/class="btn/g) || []).length, 5);
  assert.doesNotMatch(h, /cooler than a penguin in sunglasses/i);
  assert.doesNotMatch(h, /feel like a sauna/);
  assert.doesNotMatch(h, /Stay cool, Fort Myers/);
  assert.match(h, /<title>Car AC Repair in Fort Myers \| Perfect Timing Auto Repair<\/title>/);
  assert.match(h, /<meta name="description" content="Car AC repair in Fort Myers\. Warm air at idle, weak airflow, or a recharge that didn't last\? We test it the way it fails for you\. Call \(239\) 397-2048\.">/);
  assert.doesNotMatch(h, /AC Repair in Fort Myers, FL \| Perfect Timing/);
  assert.doesNotMatch(h, /leak checks, pressure readings and compressor and fan tests before parts/);
  assert.match(h, /<h1 class="service-hero__title" id="service-title">AC Repair in Fort Myers<\/h1>/);
  assert.match(h, /Repair requests 24\/7/);
  assert.doesNotMatch(h, /13037|Second St/);
});
