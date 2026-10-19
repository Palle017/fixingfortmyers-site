// Structured-data and indexing guards for local search. Static files only; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = f => fs.readFileSync(new URL(f, root), 'utf8');
const SITE = 'https://fixingfortmyers.com';
const verificationFile = 'googlefc91785ed4d05625.html';
const pages = fs.readdirSync(root).filter(f => f.endsWith('.html') && f !== verificationFile).sort();
const sitemap = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const ld = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .flatMap(m => { const j = JSON.parse(m[1]); return j['@graph'] || [j]; });
const indexable = f => f !== '404.html' && !/<meta name="robots" content="[^"]*noindex/.test(read(f));
const urlFor = f => f === 'index.html' ? `${SITE}/` : `${SITE}/${f.replace(/\.html$/, '')}`;

test('every indexable page has a self canonical and is in the sitemap; nothing noindexed is listed', () => {
  assert.equal(read(verificationFile).trim(), `google-site-verification: ${verificationFile}`, 'Google verification remains an exact token, not an SEO page');
  assert.ok(!sitemap.some(u => u.includes(verificationFile.replace(/\.html$/, ''))), 'Google verification is not listed in the sitemap');
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
      assert.ok(n.address?.addressLocality && n.areaServed?.length && n.url && n.name, `${f} incomplete business node`);
      // Owner-confirmed 2026-10-19: shop hours Mon-Sat 08:00-20:00; requests accepted anytime; not a mobile shop.
      assert.deepEqual(n.openingHoursSpecification, [{ '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '08:00', closes: '20:00' }], `${f} shop hours`);
      assert.match(n.description, /workshop in Bayshore Ranch/i, `${f} identifies the workshop`);
      assert.doesNotMatch(n.description, /mobile service|24\/7|24 hours/i, `${f} must not describe mobile service or 24/7 hours`);
      assert.equal(n.aggregateRating, undefined, `${f} self-serving review markup is not eligible for stars`);
      assert.equal(n.geo, undefined, `${f} no geo coordinates for a hidden-address business`);
      assert.match(n.description, /appointment/i, `${f} service requires an appointment`);
    }
  }
  assert.equal(seen.size, 1, 'business node differs between pages; keep the shared business identity and appointment model consistent');
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


test('FAQ structured data only describes questions that are visible on the page', () => {
  const norm = s => s.replace(/<\/?(?:a|strong|em|b|i|span)\b[^>]*>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
  for (const f of pages) {
    const html = read(f);
    const visible = norm(html.replace(/<script[\s\S]*?<\/script>/g, ''));
    for (const n of ld(html).filter(n => n['@type'] === 'FAQPage')) for (const q of n.mainEntity) {
      assert.ok(visible.includes(norm(q.name)), `${f}: FAQ question not visible: ${q.name}`);
      assert.ok(visible.includes(norm(q.acceptedAnswer.text).slice(0, 80)), `${f}: FAQ answer not visible: ${q.name}`);
    }
  }
});

test('pages load fonts and responsive images from the site itself, and the sitemap dates are valid', () => {
  for (const f of pages) {
    const html = read(f);
    assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/, `${f}: third-party font CSS blocks first paint; use /assets/fonts`);
    for (const m of html.matchAll(/srcset="([^"]+)"/g)) for (const part of m[1].split(',')) {
      const src = part.trim().split(/\s+/)[0].replace(/^\.?\//, '');
      if (!/^https?:/.test(src)) assert.ok(fs.existsSync(new URL(src, root)), `${f}: missing srcset file ${src}`);
    }
  }
  const lastmods = [...read('sitemap.xml').matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(m => m[1]);
  assert.equal(lastmods.length, sitemap.length, 'every sitemap URL has a lastmod');
  for (const d of lastmods) assert.match(d, /^\d{4}-\d{2}-\d{2}$/, `sitemap lastmod ${d}`);
});
