// Every non-legal sitemap page must offer a /request-a-repair link.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const SITE = 'https://fixingfortmyers.com';
const LEGAL_PATHS = new Set([
  '/privacy-policy',
  '/sms-terms',
  '/owner-desk-privacy',
]);

const sitemapPaths = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => {
  const url = m[1];
  assert.ok(url.startsWith(SITE), `unexpected sitemap host ${url}`);
  const pathname = url.slice(SITE.length) || '/';
  return pathname;
});

const fileFor = pathname => {
  if (pathname === '/') return 'index.html';
  if (pathname === '/blog' || pathname === '/blog/') return 'blog/index.html';
  if (pathname.endsWith('/')) return `${pathname.replace(/^\//, '')}index.html`;
  return `${pathname.replace(/^\//, '')}.html`;
};

test('sitemap /blog entry uses the trailing-slash URL that the page serves', () => {
  assert.equal(sitemapPaths.filter(p => p === '/blog' || p === '/blog/').length, 1);
  assert.ok(sitemapPaths.includes('/blog/'));
  assert.ok(!sitemapPaths.includes('/blog'));
});

test('every non-legal sitemap page has a /request-a-repair link', () => {
  const missing = [];
  for (const pathname of sitemapPaths) {
    const normalized = pathname.replace(/\/$/, '') || '/';
    if (LEGAL_PATHS.has(normalized)) continue;
    const file = fileFor(pathname);
    assert.ok(fs.existsSync(new URL(file, root)), `${pathname} maps to missing file ${file}`);
    const html = read(file);
    if (!html.includes('/request-a-repair')) missing.push(pathname);
  }
  assert.deepEqual(missing, []);
});

test('legal policy pages are left without a request-a-repair button', () => {
  for (const pathname of ['/privacy-policy', '/sms-terms', '/owner-desk-privacy']) {
    const file = `${pathname.slice(1)}.html`;
    const html = read(file);
    assert.doesNotMatch(html, /href="\/request-a-repair/, `${pathname} should not gain a request-a-repair button`);
  }
});
