// Hidden Tony locator page and Worker handler. No live network, no real coordinates published.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {handleRequest, parseUpdate, validatePoint, timingSafeEqual, extractWriteKey} from '../worker/tony-locator/src/index.js';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const ADDRESS = /13037|Second St(?:reet)?\b|Saddleback/;
const BANNED = /\bshop\b|\bmobile\b|\bpick-?up\b|by appointment|24\/7/i;
const PAGE = 'where-is-tony.html';
const SMS_OR_NAV = /pt-layout-navigation|footer__links|footer__areas/;

const decode = s => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

test('locator page is noindex and stays out of the sitemap, nav and footer', () => {
  const html = read(PAGE);
  const sitemap = read('sitemap.xml');
  const index = read('index.html');
  const robots = html.match(/<meta name="robots" content="([^"]+)"/i);
  assert.match(robots?.[1] || '', /noindex/);
  assert.match(robots?.[1] || '', /nofollow/);
  assert.doesNotMatch(sitemap, /where-is-tony/);
  assert.doesNotMatch(index, /where-is-tony/);
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelector('nav a[href*="where-is-tony"]'), null);
  assert.equal(document.querySelector('footer a[href*="where-is-tony"]'), null);
  assert.doesNotMatch(html, /<a[^>]+href="\/where-is-tony"/);
});

test('locator page is not linked from site nav or footer chrome on other pages', () => {
  const files = fs.readdirSync(root).filter(name => name.endsWith('.html') && name !== PAGE);
  for (const file of files) {
    const html = read(file);
    if (!html.includes('footer') && !html.includes('pt-layout-navigation')) continue;
    const document = new JSDOM(html).window.document;
    assert.equal(document.querySelector('nav a[href*="where-is-tony"], footer a[href*="where-is-tony"]'), null, file);
  }
});

test('locator defaults to a disabled, no-pin state and keeps Google-facing text clean', () => {
  const html = read(PAGE);
  const document = new JSDOM(html).window.document;
  const title = decode((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
  const description = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
  const og = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
  const twitter = document.querySelector('meta[name="twitter:description"]')?.getAttribute('content') || '';
  assert.ok(title.length && title.length <= 60);
  for (const text of [title, description, og, twitter]) {
    assert.ok(text, 'missing snippet field');
    assert.doesNotMatch(text, BANNED);
  }
  assert.doesNotMatch(html, ADDRESS);
  assert.match(document.getElementById('locator-empty').textContent, /Tony's location isn't shared right now/);
  assert.ok(document.querySelector('#locator-empty a[href="tel:+12393972048"]'));
  assert.ok(document.querySelector('#locator-empty a[href="/request-a-repair"]'));
  assert.ok(document.getElementById('locator-map').classList.contains('is-hidden'));
  const fallback = JSON.parse(read('data/tony-location.json'));
  assert.equal(fallback.enabled, false);
  assert.match(html, /const LOCATION_URL = 'https:\/\/fixingfortmyers-tony-locator\.prudhvi-tools\.workers\.dev\/where'/);
  assert.match(html, /const FALLBACK_URL = '\/data\/tony-location\.json'/);
  assert.doesNotMatch(html, /"lat"\s*:\s*-?\d/);
});

test('homepage logo opens the locator after five taps in three seconds, without a visible control', () => {
  const index = read('index.html');
  const site = read('site.js');
  assert.doesNotMatch(index, /where-is-tony/);
  assert.match(site, /taps\.length >= 5/);
  assert.match(site, /\/where-is-tony/);
  assert.match(site, /pt-layout-brand/);
  const dom = new JSDOM(index, {url: 'https://fixingfortmyers.com/', runScripts: 'outside-only', pretendToBeVisual: true});
  const {window} = dom;
  const assigned = [];
  window.PT_OPEN_TONY_LOCATOR = url => assigned.push(url);
  window.eval(site);
  const logo = window.document.querySelector('a.pt-layout-brand');
  assert.ok(logo);
  for (let i = 0; i < 4; i += 1) logo.dispatchEvent(new window.MouseEvent('click', {bubbles: true, cancelable: true}));
  assert.deepEqual(assigned, []);
  logo.dispatchEvent(new window.MouseEvent('click', {bubbles: true, cancelable: true}));
  assert.deepEqual(assigned, ['/where-is-tony']);
  window.close();
});

function memoryKv(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
    store,
  };
}

async function worker(request, env) {
  return handleRequest(request, env);
}

test('Worker GET /where is public, no-store, and CORS-limited to the site', async () => {
  const env = {LOCATION: memoryKv(), WRITE_KEY: 'unit-test-key'};
  const allowed = await worker(new Request('https://locator.example/where', {
    headers: {Origin: 'https://fixingfortmyers.com'},
  }), env);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('Cache-Control'), 'no-store');
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://fixingfortmyers.com');
  assert.deepEqual(await allowed.json(), {enabled: false});

  const www = await worker(new Request('https://locator.example/where', {
    headers: {Origin: 'https://www.fixingfortmyers.com'},
  }), env);
  assert.equal(www.headers.get('Access-Control-Allow-Origin'), 'https://www.fixingfortmyers.com');

  const other = await worker(new Request('https://locator.example/where', {
    headers: {Origin: 'https://example.com'},
  }), env);
  assert.equal(other.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(other.headers.get('Cache-Control'), 'no-store');
});

test('Worker POST /update requires a write key and accepts OwnTracks or plain JSON', async () => {
  const env = {LOCATION: memoryKv(), WRITE_KEY: 'unit-test-key'};
  const url = 'https://locator.example/update';
  const missing = await worker(new Request(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({lat: 26.6, lng: -81.9, acc: 12}),
  }), env);
  assert.equal(missing.status, 401);

  const wrong = await worker(new Request(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: 'Bearer no-match'},
    body: JSON.stringify({lat: 26.6, lng: -81.9, acc: 12}),
  }), env);
  assert.equal(wrong.status, 401);
  assert.equal(await env.LOCATION.get('latest'), null);

  const bearer = await worker(new Request(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: 'Bearer unit-test-key'},
    body: JSON.stringify({lat: 26.64, lng: -81.87, acc: 8}),
  }), env);
  assert.equal(bearer.status, 200);
  assert.deepEqual((await bearer.json()).ok, true);
  const stored = JSON.parse(await env.LOCATION.get('latest'));
  assert.equal(stored.lat, 26.64);
  assert.equal(stored.lng, -81.87);

  const owntracks = await worker(new Request(url + '?key=unit-test-key', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({_type: 'location', lat: 26.65, lon: -81.86, acc: 15, tst: 1730000000}),
  }), env);
  assert.equal(owntracks.status, 200);
  assert.equal(await owntracks.text(), '[]');
  const latest = JSON.parse(await env.LOCATION.get('latest'));
  assert.equal(latest.lat, 26.65);
  assert.equal(latest.lng, -81.86);
  assert.equal(latest.updated, 1730000000000);

  const live = await worker(new Request('https://locator.example/where'), env);
  const payload = await live.json();
  assert.equal(payload.enabled, true);
  assert.equal(payload.lat, 26.65);
});

test('Worker helpers reject out-of-range points and compare keys in constant time', () => {
  assert.equal(validatePoint(91, -81, 1), null);
  assert.equal(validatePoint(26, -181, 1), null);
  assert.ok(validatePoint(26.6, -81.9, 10));
  assert.equal(parseUpdate({hello: true}), null);
  assert.equal(timingSafeEqual('unit-test-key', 'unit-test-key'), true);
  assert.equal(timingSafeEqual('unit-test-key', 'unit-test-kez'), false);
  const url = new URL('https://locator.example/update?key=from-query');
  const request = new Request(url, {headers: {Authorization: 'Bearer from-header'}});
  assert.equal(extractWriteKey(request, url), 'from-header');
  assert.equal(extractWriteKey(new Request('https://locator.example/update?key=from-query'), url), 'from-query');
});
