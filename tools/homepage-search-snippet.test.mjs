// Homepage search snippet: meta, Open Graph, and Twitter descriptions stay identical.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const DESCRIPTION = 'Auto repair & mechanic in Fort Myers, rated 4.8★. Car A/C, engine, transmission, diesel, suspension & electrical. Fast replies: call (239) 397-2048.';
const REQUIRED = ['Fort Myers', '4.8', 'A/C', 'engine', 'transmission', 'diesel', 'suspension', 'electrical', '(239) 397-2048'];

test('homepage search snippet leads with fast replies, services, 4.8 rating, and phone', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const document = new JSDOM(html).window.document;
  const descriptions = [
    document.querySelector('meta[name="description"]').getAttribute('content'),
    document.querySelector('meta[property="og:description"]').getAttribute('content'),
    document.querySelector('meta[name="twitter:description"]').getAttribute('content'),
  ];
  assert.equal(new Set(descriptions).size, 1, 'meta, og, and twitter descriptions must be identical');
  for (const description of descriptions) {
    assert.equal(description, DESCRIPTION);
    for (const phrase of REQUIRED) assert.ok(description.includes(phrase), `missing ${phrase}`);
    assert.ok(description.length <= 160, `description is ${description.length} characters`);
    assert.equal(description.includes('13037'), false);
    assert.equal(description.includes('Saddleback'), false);
  }
  assert.equal(document.querySelector('title').textContent, 'Auto Repair in Fort Myers, FL | Engine, Transmission & Diesel | Perfect Timing');
  assert.equal(
    document.querySelector('meta[property="og:title"]').getAttribute('content'),
    'Perfect Timing Auto Repair | Car trouble has terrible timing. Luckily, you’ve got Perfect Timing.'
  );
});
