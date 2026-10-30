// Homepage and transmission page copy must not mention an AI assistant.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
for (const page of ['index.html', 'transmission-repair-fort-myers.html']) test(`${page}: no "AI assistant" wording`, () => {
  const h = fs.readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
  assert.doesNotMatch(h, /AI[ -]assistant/i);
});
