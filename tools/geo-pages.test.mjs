// New local-area and Cape Coral service pages: indexing, CTAs, and Tony's snippet rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const SITE = 'https://fixingfortmyers.com';
const BANNED = /\bshop\b|\bmobile\b|\bpick-?up\b|by appointment|24\/7/i;
const BBB_PROFILE = /https?:\/\/www\.bbb\.org\/\S*\/mobile-auto-repair\/\S*/gi;
const ADDRESS = /13037|Second St(?:reet)?\b|Saddleback/;
const pages = [
  {file: 'auto-repair-alva-buckingham.html', slug: 'auto-repair-alva-buckingham', service: 'diagnostics'},
  {file: 'auto-repair-estero-san-carlos-park.html', slug: 'auto-repair-estero-san-carlos-park', service: 'diagnostics'},
  {file: 'engine-repair-cape-coral.html', slug: 'engine-repair-cape-coral', service: 'engine'},
  {file: 'transmission-repair-cape-coral.html', slug: 'transmission-repair-cape-coral', service: 'transmission'},
];
const decode = s => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const meta = (html, attr, name) => {
  const m = html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`));
  return m ? decode(m[1]) : null;
};
const ld = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .flatMap(m => { const j = JSON.parse(m[1]); return j['@graph'] || [j]; });
const strings = value => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
};

test('new geo pages exist, are canonical, and stay in the sitemap', () => {
  const sitemap = read('sitemap.xml');
  for (const page of pages) {
    assert.equal(fs.existsSync(new URL(page.file, root)), true, page.file);
    const html = read(page.file);
    const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
    assert.equal(canonical, `${SITE}/${page.slug}`);
    assert.match(sitemap, new RegExp(`<loc>${SITE}/${page.slug}</loc>`));
  }
});

test('new geo pages offer Request, Call and Text, with no street address', () => {
  for (const page of pages) {
    const html = read(page.file);
    const d = new JSDOM(html).window.document;
    assert.doesNotMatch(html, ADDRESS, page.file);
    const request = `/request-a-repair?service=${page.service}`;
    const hero = d.querySelector('.service-hero__actions');
    assert.ok(hero, page.file);
    const actions = [...hero.querySelectorAll('a')];
    assert.equal(actions[0].getAttribute('href'), request, page.file);
    assert.match(actions[0].textContent, /Request Repair/);
    assert.equal(actions[1].getAttribute('href'), 'tel:+12393972048', page.file);
    assert.match(actions[1].textContent, /Call/);
    const text = actions.find(a => a.getAttribute('href')?.startsWith('sms:+12393972048'));
    assert.ok(text, `${page.file}: Text Tony`);
    assert.equal(text.textContent.trim(), 'Text Tony');
    assert.ok(text.getAttribute('href').startsWith('sms:+12393972048'), page.file);
    const rating = d.querySelector('.service-hero .service-rating');
    assert.match(rating?.textContent || '', /★ 4\.8 from ~70 Google reviews/);
    assert.ok(d.querySelector(`a[href="tel:+12393972048"]`));
    assert.ok(d.querySelector(`a[href="${request}"]`));
  }
  const nfm = read('auto-repair-north-fort-myers.html').replace(/<script[\s\S]*?<\/script>/g, '');
  assert.match(nfm, /Also serving Tice and Olga/);
});

test('new geo pages keep banned words out of Google-facing text', () => {
  for (const page of pages) {
    const html = read(page.file);
    const title = decode((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
    assert.ok(title.length && title.length <= 60, `${page.file} title length ${title.length}`);
    const fields = [
      ['title', title],
      ['description', meta(html, 'name', 'description')],
      ['og:title', meta(html, 'property', 'og:title')],
      ['og:description', meta(html, 'property', 'og:description')],
      ['twitter:title', meta(html, 'name', 'twitter:title')],
      ['twitter:description', meta(html, 'name', 'twitter:description')],
    ];
    for (const [label, text] of fields) {
      assert.ok(text, `${page.file} ${label}`);
      if (label.endsWith('description')) assert.ok([...text].length <= 160, `${page.file} ${label} ${[...text].length}`);
      assert.doesNotMatch(text, BANNED, `${page.file} ${label}: ${text}`);
    }
    for (const value of ld(html).flatMap(strings)) {
      assert.doesNotMatch(value.replace(BBB_PROFILE, ''), BANNED, `${page.file} JSON-LD: ${value}`);
    }
  }
});
