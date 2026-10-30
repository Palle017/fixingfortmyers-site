// Structured-data and indexing guards for local search. Static files only; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = f => fs.readFileSync(new URL(f, root), 'utf8');
const SITE = 'https://fixingfortmyers.com';
const verificationFile = 'googlefc91785ed4d05625.html';
const pages = [
  ...fs.readdirSync(root).filter(f => f.endsWith('.html') && f !== verificationFile),
  ...fs.readdirSync(new URL('blog/', root)).filter(f => f.endsWith('.html')).map(f => `blog/${f}`),
].sort();
const sitemap = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const ld = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .flatMap(m => { const j = JSON.parse(m[1]); return j['@graph'] || [j]; });
const indexable = f => f !== '404.html' && !/<meta name="robots" content="[^"]*noindex/.test(read(f));
const urlFor = f => f === 'index.html' ? `${SITE}/` : f === 'blog/index.html' ? `${SITE}/blog` : `${SITE}/${f.replace(/\.html$/, '')}`;
const fileFor = u => u === `${SITE}/` ? 'index.html' : u.slice(SITE.length + 1) === 'blog' ? 'blog/index.html' : `${u.slice(SITE.length + 1)}.html`;

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
    const f = fileFor(u);
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
      // Owner correction 2026-10-19 (supersedes #34/#88): Perfect Timing is a shop that also does mobile repair
      // from an equipped van, plus pickup. Repair and penciled-in appointment requests are accepted 24/7
      // (docs/BOOKING-CONTRACT-V1.md, docs/google-business-profile-plan.md "Open 24 hours").
      assert.deepEqual(n.openingHoursSpecification, [{ '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: '00:00', closes: '23:59' }], `${f} 24/7 request hours`);
      // Owner snippet rules (2026-10-30): the business description can be quoted in search and AI answers,
      // so it names services and cities, never the address/area, and none of the banned snippet words.
      assert.doesNotMatch(n.description, /\bshop\b|mobile|pickup|by appointment|24\/7|Bayshore|Saddleback|13037|Second St/i, `${f} banned snippet wording`);
      for (const word of ['Fort Myers', 'engine', 'transmission', 'diesel', '(239) 397-2048']) assert.ok(n.description.includes(word), `${f} description names ${word}`);
      assert.equal(n.aggregateRating, undefined, `${f} self-serving review markup is not eligible for stars`);
      assert.equal(n.geo, undefined, `${f} no geo coordinates for a hidden-address business`);
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

test('repair contact and website publisher match the public business identity and contact routes', () => {
  const home = read('index.html');
  const visibleAbout = read('about-perfect-timing.html').replace(/<script[\s\S]*?<\/script>/g, '');
  assert.match(home, /id="contact"/, 'the repair-request URL resolves to an existing homepage section');
  const seenContacts = new Set();
  for (const f of pages) for (const n of ld(read(f))) {
    if (n['@type'] === 'AutoRepair') {
      const contact = n.contactPoint;
      assert.equal(contact?.['@type'], 'ContactPoint', `${f} repair contact type`);
      assert.equal(contact['@id'], `${SITE}/#repair-contact`, `${f} stable repair contact identity`);
      assert.equal(contact.contactType, 'repair requests', `${f} contact purpose`);
      assert.equal(contact.telephone, n.telephone, `${f} contact phone matches the business phone`);
      assert.equal(contact.email, n.email, `${f} contact email matches the business email`);
      assert.equal(contact.url, `${SITE}/#contact`, `${f} existing repair-request route`);
      assert.ok(visibleAbout.includes(`href="tel:${contact.telephone}"`), `${f} contact phone is publicly linked`);
      assert.ok(visibleAbout.includes(`href="mailto:${contact.email}"`), `${f} contact email is publicly linked`);
      seenContacts.add(JSON.stringify(contact));
    }
    if (n['@type'] === 'WebSite') {
      assert.equal(n.publisher?.['@id'], `${SITE}/#business`, `${f} website publisher resolves to the business`);
    }
  }
  assert.equal(seenContacts.size, 1, 'all business nodes identify the same public repair contact');
});

test('repair guides carry the article fields search engines read', () => {
  for (const f of pages.filter(f => f.startsWith('repair-guide-'))) {
    const a = ld(read(f)).find(n => n['@type'] === 'Article');
    assert.ok(a, `${f} Article`);
    for (const k of ['headline', 'image', 'author', 'publisher', 'datePublished', 'dateModified']) assert.ok(a[k], `${f} Article.${k}`);
    assert.ok(a.headline.length <= 110, `${f} headline too long`);
  }
});


const decodeEntities = s => s
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const chars = s => [...s].length;
// Owner snippet rule: these words must not appear in Google-facing fields.
// "shop" is a whole word so "workshop" stays; "pickup" / "pick-up" are whole words so "pickups" stays.
// The BBB profile slug is their URL, not our wording.
const BANNED_SNIPPET = /\bshop\b|\bmobile\b|\bpick-?up\b|by appointment|24\/7/i;
const BBB_PROFILE = /https?:\/\/www\.bbb\.org\/\S*\/mobile-auto-repair\/\S*/gi;
const metaContent = (html, attr, key) => {
  const tag = html.match(new RegExp(`<meta\\b[^>]*\\b${attr}="${key}"[^>]*>`, 'i'));
  const content = tag && tag[0].match(/\bcontent="([^"]*)"/);
  return content ? decodeEntities(content[1]) : null;
};
const jsonLdStrings = value => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(jsonLdStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(jsonLdStrings);
  return [];
};

test('sitemap pages keep banned words out of Google-facing titles, descriptions, and JSON-LD', () => {
  for (const u of sitemap) {
    const f = fileFor(u);
    const html = read(f);
    const title = decodeEntities((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
    assert.ok(title, `${f} title`);
    assert.ok(chars(title) <= 60, `${f} title is ${chars(title)} characters: ${title}`);
    const fields = [
      ['title', title],
      ['description', metaContent(html, 'name', 'description')],
      ['og:title', metaContent(html, 'property', 'og:title')],
      ['og:description', metaContent(html, 'property', 'og:description')],
      ['twitter:title', metaContent(html, 'name', 'twitter:title')],
      ['twitter:description', metaContent(html, 'name', 'twitter:description')],
    ];
    for (const [label, text] of fields) {
      if (text == null) continue;
      if (label.endsWith('description')) assert.ok(chars(text) <= 160, `${f} ${label} is ${chars(text)} characters: ${text}`);
      assert.doesNotMatch(text, BANNED_SNIPPET, `${f} ${label}: ${text}`);
    }
    for (const value of ld(html).flatMap(jsonLdStrings)) {
      const scanned = value.replace(BBB_PROFILE, '');
      assert.doesNotMatch(scanned, BANNED_SNIPPET, `${f} JSON-LD: ${value}`);
    }
  }
});

test('FAQ structured data only describes questions that are visible on the page', () => {
  const norm = s => s.replace(/<\/?(?:a|strong|em|b|i|span)\b[^>]*>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
  // Visible FAQ HTML keeps the in-page service words. JSON-LD may rephrase those words
  // so the Google-facing copy passes the banned-snippet test. The rephrased question and
  // the start of the answer still have to be on the page once those words are ignored.
  const scrub = s => norm(s)
    .replace(/\bshop\b/gi, ' ')
    .replace(/\bmobile\b/gi, ' ')
    .replace(/\bpick-?up\b/gi, ' ')
    .replace(/by appointment/gi, ' ')
    .replace(/24\/7/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const missingWords = (fragment, page) => {
    const lead = fragment.length <= 80 ? fragment : fragment.slice(0, 80).replace(/\s+\S*$/, '');
    if (!lead) return [];
    if (page.includes(lead)) return [];
    const words = lead.toLowerCase().match(/[a-z0-9]{4,}/g) || [];
    const haystack = page.toLowerCase();
    return words.filter(w => !haystack.includes(w));
  };
  for (const f of pages) {
    const html = read(f);
    const visible = scrub(html.replace(/<script[\s\S]*?<\/script>/g, ''));
    for (const n of ld(html).filter(n => n['@type'] === 'FAQPage')) for (const q of n.mainEntity) {
      const qMissing = missingWords(scrub(q.name), visible);
      const aMissing = missingWords(scrub(q.acceptedAnswer.text).slice(0, 80), visible);
      assert.deepEqual(qMissing, [], `${f}: FAQ question not visible: ${q.name}`);
      assert.deepEqual(aMissing, [], `${f}: FAQ answer not visible: ${q.name}`);
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

test('every page states the corrected service model: shop, mobile van and pickup, with 24/7 requests and no street address', () => {
  for (const f of pages) {
    const html = read(f);
    const visible = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.doesNotMatch(html, /13037|Second St(?:reet)?\b|"geo"|"latitude":\s*-?\d/i, `${f}: never publish the street address or coordinates`);
    assert.doesNotMatch(visible, /Mon–Sat, 8 AM–8 PM|pickup is (?:available|offered) only|not a mobile (?:shop|mechanic)/i, `${f}: stale #88 wording`);
    if (!/<footer/.test(html)) continue;
    assert.match(visible, /24\/7/, `${f}: visible 24/7 request wording`);
    assert.match(visible, /mobile repairs? from (?:his |an |a )?(?:equipped )?service van|mobile (?:service )?van/i, `${f}: visible mobile van wording`);
    assert.match(visible, /\(239\) 397-2048/, `${f}: business phone`);
  }
});
