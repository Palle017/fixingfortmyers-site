// suspension-steering-repair-fort-myers.html search snippet: title and meta, Open Graph, Twitter descriptions stay consistent and within caps.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const FILE = 'suspension-steering-repair-fort-myers.html';
const TITLE = "Suspension Repair in Fort Myers, FL | Perfect Timing";
const DESCRIPTION = "Suspension and steering repair in Fort Myers, rated 4.8★. Shocks, struts and pulling fixed. Fast replies: call (239) 397-2048.";
const BANNED = [/shop/i, /mobile/i, /pickup/i, /by appointment/i, /24\/7/, /13037/, /Second St/i, /Saddleback/i];

test('suspension page search snippet is consistent, capped, and free of banned wording', () => {
  const document = new JSDOM(fs.readFileSync(new URL('../' + FILE, import.meta.url), 'utf8')).window.document;
  const titles = [
    document.querySelector('title').textContent,
    document.querySelector('meta[property="og:title"]').getAttribute('content'),
    document.querySelector('meta[name="twitter:title"]').getAttribute('content'),
  ];
  const descriptions = [
    document.querySelector('meta[name="description"]').getAttribute('content'),
    document.querySelector('meta[property="og:description"]').getAttribute('content'),
    document.querySelector('meta[name="twitter:description"]').getAttribute('content'),
  ];
  for (const title of titles) {
    assert.equal(title, TITLE);
    assert.ok([...title].length <= 60, `title is ${[...title].length} characters`);
    assert.match(title, /Repair in Fort Myers, FL \| Perfect Timing$/);
  }
  for (const description of descriptions) {
    assert.equal(description, DESCRIPTION);
    assert.ok([...description].length <= 160, `description is ${[...description].length} characters`);
    assert.ok(description.includes('rated 4.8★'));
    assert.ok(description.endsWith('Fast replies: call (239) 397-2048.'));
  }
  for (const text of [...titles, ...descriptions]) for (const word of BANNED) assert.doesNotMatch(text, word);
});
