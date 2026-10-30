// request-a-repair.html search snippet: meta, Open Graph and Twitter tags match and avoid banned wording.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const TITLE = 'Request a repair | Perfect Timing Auto Repair, Fort Myers';
const DESCRIPTION = 'Request auto repair in Fort Myers, rated 4.8★. Engine, transmission, diesel, car A/C and more. Fast replies: call (239) 397-2048.';
const BANNED = [/shop/i, /mobile/i, /pickup/i, /by appointment/i, /24\/7/];

test('request-a-repair search snippet is consistent and free of banned wording', () => {
  const d = new JSDOM(fs.readFileSync(new URL('../request-a-repair.html', import.meta.url), 'utf8')).window.document;
  const attr = sel => d.querySelector(sel)?.getAttribute('content');
  const titles = [d.querySelector('title').textContent, attr('meta[property="og:title"]'), attr('meta[name="twitter:title"]')];
  const descriptions = [attr('meta[name="description"]'), attr('meta[property="og:description"]'), attr('meta[name="twitter:description"]')];
  for (const t of titles) assert.equal(t, TITLE);
  for (const x of descriptions) { assert.equal(x, DESCRIPTION); assert.ok([...x].length <= 160); }
  for (const text of [...titles, ...descriptions]) for (const word of BANNED) assert.doesNotMatch(text, word);
});
