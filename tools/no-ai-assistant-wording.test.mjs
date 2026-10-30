// Public pages must not tell customers an AI assistant answers or takes their details.
// privacy-policy.html is excluded: its analytics disclosure names "AI assistant" as a referral source label.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const pages = fs.readdirSync(root).filter(n => n.endsWith('.html') && n !== 'privacy-policy.html');
test('checks every public page', () => assert.ok(pages.length >= 50, `only ${pages.length} pages`));
for (const page of pages) test(`${page}: no "AI assistant" wording`, () => {
  assert.doesNotMatch(fs.readFileSync(new URL(page, root), 'utf8'), /AI[ -]assistant/i);
});
