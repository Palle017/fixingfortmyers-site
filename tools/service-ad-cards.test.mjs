// One service ad card per specialty page. Tony's penguin ad stays byte-for-byte.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const PENGUIN_AC = "<section class=\"penguin-ac\" id=\"penguin-ac\" aria-labelledby=\"penguin-ac-title\"><div class=\"container\"><div class=\"penguin-ac__card\"><a href=\"/ac-repair-fort-myers#penguin-ac\" aria-label=\"Explore our auto air conditioning service\"><img class=\"penguin-ac__image\" src=\"/assets/penguin-ac-corrected.webp\" srcset=\"/assets/penguin-ac-corrected-768.webp 768w, /assets/penguin-ac-corrected.webp 1448w\" sizes=\"(max-width: 760px) calc(100vw - 48px), 1150px\" width=\"1448\" height=\"1086\" alt=\"Perfect Timing Auto Repair A/C ad: a penguin in sunglasses surrounded by snow on a sunny beach. We’ll leave you feeling cooler than a penguin in sunglasses. Call (239) 397-2048.\" loading=\"lazy\" decoding=\"async\"></a><div class=\"penguin-ac__copy\"><h2 id=\"penguin-ac-title\">We’ll leave you feeling cooler than a penguin in sunglasses.</h2><p>Florida’s hot enough. Your car shouldn’t feel like a sauna.</p><p>A/C blowing warm? Weak airflow? Only cools while you’re driving? We’ll find out why, tell you what it takes, and nothing gets fixed until you say so.</p><p><strong>Stay cool, Fort Myers. Let’s get your A/C working right.</strong></p><div class=\"penguin-ac__actions\"><a class=\"btn btn--primary\" href=\"/request-a-repair?service=ac\">Request A/C service</a><a class=\"btn btn--outline\" href=\"tel:+12393972048\">Call (239) 397-2048</a></div><p class=\"penguin-ac__note\">Fort Myers · Service by appointment. Repair location and availability confirmed for your vehicle.</p></div></div></div></section>";
const PENGUIN_HOME = "<section class=\"penguin-ac\" id=\"penguin-ac\" aria-labelledby=\"penguin-ac-title\"><div class=\"container\"><div class=\"penguin-ac__card\"><a href=\"/ac-repair-fort-myers#penguin-ac\" aria-label=\"Explore our auto air conditioning service\"><img class=\"penguin-ac__image\" src=\"/assets/penguin-ac-corrected.webp\" srcset=\"/assets/penguin-ac-corrected-768.webp 768w, /assets/penguin-ac-corrected.webp 1448w\" sizes=\"(max-width: 760px) calc(100vw - 48px), 1150px\" width=\"1448\" height=\"1086\" alt=\"Perfect Timing Auto Repair A/C ad: a penguin in sunglasses surrounded by snow on a sunny beach. We’ll leave you feeling cooler than a penguin in sunglasses. Call (239) 397-2048.\" loading=\"lazy\" decoding=\"async\"></a><div class=\"penguin-ac__copy\"><h2 id=\"penguin-ac-title\">We’ll leave you feeling cooler than a penguin in sunglasses.</h2><p>Florida’s hot enough. Your car shouldn’t feel like a sauna.</p><p>A/C blowing warm? Weak airflow? Only cools while you’re driving? Perfect Timing Auto Repair will find the problem, explain your options, and get your approval before repairs begin.</p><p><strong>Stay cool, Fort Myers. Let’s get your A/C working right.</strong></p><div class=\"penguin-ac__actions\"><a class=\"btn btn--primary\" href=\"/?service=ac#contact\">Request A/C service</a><a class=\"btn btn--outline\" href=\"tel:+12393972048\">Call (239) 397-2048</a><a class=\"btn btn--outline\" href=\"/ac-repair-fort-myers\">Explore A/C repairs</a></div><p class=\"penguin-ac__note\">Fort Myers · Service by appointment. Repair location and availability confirmed for your vehicle.</p></div></div></div></section>";
const PENGUIN_CSS = "\n.penguin-ac{padding:clamp(24px,5vw,56px) 0}.penguin-ac__card{overflow:hidden;border:1px solid #23c6d0;border-radius:18px;background:#10232a;color:#f5f9fa}.penguin-ac__image{display:block;width:100%;height:auto}.penguin-ac__copy{padding:clamp(20px,4vw,36px)}.penguin-ac h2{color:#fff;font-size:clamp(26px,3.6vw,42px);line-height:1.15;margin:0 0 16px}.penguin-ac p{line-height:1.65;margin:12px 0}.penguin-ac__actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}.penguin-ac__actions .btn{white-space:normal;text-align:center}.penguin-ac__note{font-size:14px;color:#c9dce0}\n";

const pages = [
  {
    file: 'module-programming-fort-myers.html',
    h1: 'ECU, PCM & TCM Programming in Fort Myers',
    id: 'programming-ad',
    headline: "If it's got a chip in it, we'll take a crack at it.",
    service: 'programming',
    image: '/assets/gbp-bmw-e60-dash-removal-hero.webp',
    brands: true
  },
  {
    file: 'engine-repair-fort-myers.html',
    h1: 'Engine Repair in Fort Myers',
    id: 'engine-ad',
    headline: "If it's knocking, ticking, or leaving a puddle, we'll get in there.",
    service: 'engine',
    image: '/assets/campaign-engine.webp'
  },
  {
    file: 'transmission-repair-fort-myers.html',
    h1: 'Transmission Repair in Fort Myers',
    id: 'transmission-ad',
    headline: "If it's slipping, banging, or slow to grab a gear, we'll sort that shift.",
    service: 'transmission',
    image: '/assets/campaign-transmission.webp'
  },
  {
    file: 'diesel-repair-fort-myers.html',
    h1: 'Diesel Repair in Fort Myers',
    id: 'diesel-ad',
    headline: "If it smokes, limps, or won't fire up, we'll test that diesel.",
    service: 'diesel',
    image: '/assets/campaign-truck.webp'
  }
];

function penguinSection(html) {
  const start = html.indexOf('<section class="penguin-ac"');
  assert.ok(start >= 0, 'penguin section missing');
  return html.slice(start, html.indexOf('</section>', start) + '</section>'.length);
}

for (const page of pages) {
  test(`${page.file}: service ad card, one request link, penguin ad unchanged`, () => {
    assert.equal(penguinSection(read('ac-repair-fort-myers.html')), PENGUIN_AC);
    assert.equal(penguinSection(read('index.html')), PENGUIN_HOME);
    assert.equal(read('index.html').includes('class="service-ad"'), false);

    const html = read(page.file);
    const site = read('site.js');
    assert.match(html, /Repair requests 24\/7/);
    assert.match(html, /requested times are penciled in until Tony confirms by phone/);
    assert.doesNotMatch(html, /13037|Second St/);
    assert.match(site, new RegExp(page.service + ":'"));
    const adCss = html.match(/<style id="service-ad-styles">([\s\S]*?)<\/style>/);
    assert.ok(adCss, 'sibling card styles');
    assert.equal(adCss[1], PENGUIN_CSS.replaceAll('penguin-ac', 'service-ad'));

    const dom = new JSDOM(html);
    const d = dom.window.document;
    assert.equal(d.querySelector('h1').textContent, page.h1);
    const main = d.querySelector('main');
    const hero = d.querySelector('.service-hero');
    assert.equal(hero.nextElementSibling, main);
    const card = main.firstElementChild;
    assert.equal(card.className, 'service-ad');
    assert.equal(card.id, page.id);
    assert.equal(d.querySelectorAll('.service-ad').length, 1);
    assert.equal(card.querySelector('h2').textContent, page.headline);
    const lines = [...card.querySelectorAll('.service-ad__copy > p')];
    assert.ok(lines.length >= 1 && lines.length <= 2, 'one or two plain lines');
    const copy = lines.map(p => p.textContent).join(' ');
    assert.match(copy, /appointment/i);
    assert.doesNotMatch(card.textContent, /24\/7/);
    if (page.brands) assert.match(copy, /all major brands/i);
    assert.doesNotMatch(copy + ' ' + page.headline, /seamless|elevate|top-notch|unparalleled|cutting-edge|state-of-the-art/i);
    assert.equal(card.querySelectorAll('.service-ad__note, .service-ad__copy strong').length, 0);

    const actions = [...card.querySelectorAll('.service-ad__actions a, .service-ad__actions button')];
    assert.equal(actions.length, 1);
    assert.equal(actions[0].className, 'btn btn--primary');
    assert.equal(actions[0].getAttribute('href'), `/request-a-repair?service=${page.service}`);
    assert.equal(card.querySelectorAll('a.btn, button').length, 1);
    assert.equal(card.querySelectorAll('a[href^="tel:"], a[href^="sms:"]').length, 0);
    const requestLinks = [...card.querySelectorAll('a')].filter(a => (a.getAttribute('href') || '').includes('/request-a-repair'));
    assert.equal(requestLinks.length, 1);

    const img = card.querySelector('img.service-ad__image');
    assert.equal(img.getAttribute('src'), page.image);
    assert.ok(img.getAttribute('src').startsWith('/assets/'));
    assert.ok((img.getAttribute('alt') || '').length > 20);
    assert.doesNotMatch(img.getAttribute('alt'), /239|call|text/i);
    dom.window.close();
  });
}
