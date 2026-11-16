// Homepage ranking recovery: the keyword H1 that ranked before Oct 17 stays, with the slogan as a tagline,
// and every Google-facing homepage title and description agree with the search title and meta description.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const document = new JSDOM(html).window.document;
const TITLE = 'Auto Repair Fort Myers, FL | Engine, Transmission & Diesel';
const BANNED = /\b(shop|mobile|pick-?up|by appointment|24\/7)\b/i;

test('homepage has exactly one keyword H1 with the slogan as a visible tagline', () => {
  const h1s = document.querySelectorAll('h1');
  assert.equal(h1s.length, 1);
  assert.equal(h1s[0].id, 'home-title');
  assert.equal(h1s[0].textContent.trim(), 'Engine, Transmission & Diesel Repair in Fort Myers');
  const tagline = h1s[0].nextElementSibling;
  assert.equal(tagline?.className, 'home-start__tagline');
  assert.equal(tagline.textContent.trim(), 'Car trouble has terrible timing. Luckily, you’ve got Perfect Timing.');
});

test('hero lead names auto repair, mechanic and Fort Myers above the fold', () => {
  const lead = document.querySelector('.home-start__intro .home-start__lead').textContent;
  for (const phrase of ['Auto repair', 'mechanic', 'Fort Myers', 'engine', 'transmission', 'diesel']) {
    assert.ok(lead.includes(phrase), `hero lead missing ${phrase}`);
  }
});

test('og, twitter and WebPage JSON-LD titles match the search title, not the slogan', () => {
  assert.equal(document.title, TITLE);
  assert.equal(document.querySelector('meta[property="og:title"]').getAttribute('content'), TITLE);
  assert.equal(document.querySelector('meta[name="twitter:title"]').getAttribute('content'), TITLE);
  const meta = document.querySelector('meta[name="description"]').getAttribute('content');
  const graph = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph'];
  const page = graph.find(node => node['@type'] === 'WebPage');
  assert.equal(page.name, TITLE);
  assert.equal(page.description, meta);
  for (const text of [page.name, page.description, TITLE, meta]) {
    assert.doesNotMatch(text, BANNED);
    assert.doesNotMatch(text, /terrible timing/);
  }
});

test('homepage stays self-canonical and indexable', () => {
  assert.equal(document.querySelector('link[rel="canonical"]').getAttribute('href'), 'https://fixingfortmyers.com/');
  assert.equal(document.querySelector('meta[name="robots"]'), null);
});

test('penguin-ac ad link is untouched', () => {
  assert.ok(document.querySelector('#penguin-ac a[href="/?service=ac#contact"]'));
  assert.ok(document.querySelector('#penguin-ac a[href="/ac-repair-fort-myers#penguin-ac"]'));
});
