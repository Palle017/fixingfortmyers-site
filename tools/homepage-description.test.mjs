// Homepage search snippet: fast replies, the work Tony does, and the shop phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const expected = 'Fast replies from Tony. Engine, transmission & diesel repair in Fort Myers, shop by appointment or mobile. 4.8★ on Google. Call (239) 397-2048.';

test('homepage description names fast replies, transmission, diesel, and the shop phone', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const document = new JSDOM(html).window.document;
  const tags = [
    ['name="description"', document.querySelector('meta[name="description"]')],
    ['property="og:description"', document.querySelector('meta[property="og:description"]')],
    ['name="twitter:description"', document.querySelector('meta[name="twitter:description"]')],
  ];
  for (const [label, tag] of tags) {
    const content = tag?.getAttribute('content') || '';
    assert.equal(content, expected, label);
    assert.ok(content.includes('Fast replies'), label);
    assert.ok(content.includes('transmission'), label);
    assert.ok(content.includes('diesel'), label);
    assert.ok(content.includes('(239) 397-2048'), label);
    assert.ok(content.length <= 160, `${label} is ${content.length} characters`);
    assert.doesNotMatch(content, /13037|Second St|Saddleback/, label);
  }
  document.defaultView.close();
});
