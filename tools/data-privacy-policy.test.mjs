// /data-privacy-policy and /data-privacy-policy/ must resolve without a 404.
// GitHub Pages serves the .html file at the slashless URL and only serves the
// trailing slash from data-privacy-policy/index.html.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const CANONICAL = 'https://fixingfortmyers.com/privacy-policy';

function stub(file) {
  const html = read(file);
  const document = new JSDOM(html).window.document;
  assert.match(document.querySelector('meta[name="robots"]')?.getAttribute('content') || '', /noindex/);
  assert.equal(document.querySelector('meta[http-equiv="refresh"]')?.getAttribute('content'), '0; url=/privacy-policy');
  assert.equal(document.querySelector('link[rel="canonical"]')?.getAttribute('href'), CANONICAL);
  assert.equal(document.querySelector('a')?.getAttribute('href'), '/privacy-policy');
  assert.doesNotMatch(html, /13037|Second St(?:reet)?\b|Saddleback/);
}

test('the slashless data-privacy-policy stub stays noindex and points at /privacy-policy', () => {
  stub('data-privacy-policy.html');
  assert.equal(fs.existsSync(new URL('../data-privacy-policy.html', import.meta.url)), true);
});

test('/data-privacy-policy/ is served from a noindex stub that points at /privacy-policy', () => {
  stub('data-privacy-policy/index.html');
});

test('data-privacy-policy is not listed in the sitemap', () => {
  const sitemap = read('sitemap.xml');
  assert.doesNotMatch(sitemap, /data-privacy-policy/);
});
