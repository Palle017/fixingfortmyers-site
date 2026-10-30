// workshop.html search snippet: meta, Open Graph and Twitter descriptions match and avoid banned wording.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const DESCRIPTION = "Tony's engine, transmission and diesel repair in the North Fort Myers area, rated 4.8★. Fast replies: call (239) 397-2048.";
const BANNED = [/shop/i, /mobile/i, /pickup/i, /by appointment/i, /24\/7/];

test('workshop page search snippet is consistent and free of banned wording', () => {
  const document = new JSDOM(fs.readFileSync(new URL('../workshop.html', import.meta.url), 'utf8')).window.document;
  const descriptions = [
    document.querySelector('meta[name="description"]').getAttribute('content'),
    document.querySelector('meta[property="og:description"]').getAttribute('content'),
    document.querySelector('meta[name="twitter:description"]').getAttribute('content'),
  ];
  for (const description of descriptions) {
    assert.equal(description, DESCRIPTION);
    assert.ok([...description].length <= 160);
    for (const word of BANNED) assert.doesNotMatch(description, word);
  }
});
