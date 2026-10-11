// Structured-data and indexing guards for local search. Static files only; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = f => fs.readFileSync(new URL(f, root), 'utf8');
const SITE = 'https://fixingfortmyers.com';
const pages = fs.readdirSync(root).filter(f => f.endsWith('.html')).sort();
const sitemap = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const ld = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .flatMap(m => { const j = JSON.parse(m[1]); return j['@graph'] || [j]; });
const indexable = f => f !== '404.html' && !/<meta name="robots" content="[^"]*noindex/.test(read(f));
const urlFor = f => f === 'index.html' ? `${SITE}/` : `${SITE}/${f.replace(/\.html$/, '')}`;

test('every indexable page has a self canonical and is in the sitemap; nothing noindexed is listed', () => {
  for (const f of pages) {
    const html = read(f);
    if (!indexable(f)) { assert.ok(!sitemap.includes(urlFor(f)), `${f} is noindex but in sitemap`); continue; }
    const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
    assert.equal(canonical, urlFor(f), `${f} canonical`);
    assert.ok(sitemap.includes(urlFor(f)), `${f} missing from sitemap`);
  }
  for (const u of sitemap) {
    const f = u === `${SITE}/` ? 'index.html' : u.slice(SITE.length + 1) + '.html';
    assert.ok(pages.includes(f), `sitemap lists missing page ${u}`);
  }
});

test('the business entity is identical on every page and keeps the street address private', () => {
  const strip = ({ sameAs, hasOfferCatalog, ...rest }) => JSON.stringify(rest);
  const seen = new Set();
  for (const f of pages) {
    const html = read(f);
    assert.ok(!/"(streetAddress|postalCode)"/.test(html), `${f} publishes a street address or ZIP`);
    for (const n of ld(html).filter(n => n['@type'] === 'AutoRepair')) {
      seen.add(strip(n));
      assert.equal(n.telephone, '+12393972048', `${f} phone`);
      assert.ok(n.address?.addressLocality && n.openingHoursSpecification?.length && n.areaServed?.length, `${f} incomplete business node`);
    }
  }
  assert.equal(seen.size, 1, 'business node differs between pages; run node tools/normalize-schema.mjs');
});

test('services name the provider and keep the city out of serviceType', () => {
  for (const f of pages) for (const n of ld(read(f)).filter(n => n['@type'] === 'Service' && n['@id'])) {
    assert.equal(n.provider?.['@id'], `${SITE}/#business`, `${f} provider`);
    assert.ok(n.serviceType && !/Fort Myers|Cape Coral|Lehigh|, FL/.test(n.serviceType), `${f} serviceType "${n.serviceType}"`);
    assert.ok(n.areaServed?.length, `${f} areaServed`);
  }
});

test('repair guides carry the article fields search engines read', () => {
  for (const f of pages.filter(f => f.startsWith('repair-guide-'))) {
    const a = ld(read(f)).find(n => n['@type'] === 'Article');
    assert.ok(a, `${f} Article`);
    for (const k of ['headline', 'image', 'author', 'publisher', 'datePublished', 'dateModified']) assert.ok(a[k], `${f} Article.${k}`);
    assert.ok(a.headline.length <= 110, `${f} headline too long`);
  }
});
