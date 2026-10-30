// The A/C page reads like a mechanic talking; Tony's penguin ad stays byte-for-byte.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const PENGUIN_SECTION = '<section class="penguin-ac" id="penguin-ac" aria-labelledby="penguin-ac-title"><div class="container"><div class="penguin-ac__card"><a href="/ac-repair-fort-myers#penguin-ac" aria-label="Explore our auto air conditioning service"><img class="penguin-ac__image" src="/assets/penguin-ac-corrected.webp" srcset="/assets/penguin-ac-corrected-768.webp 768w, /assets/penguin-ac-corrected.webp 1448w" sizes="(max-width: 760px) calc(100vw - 48px), 1150px" width="1448" height="1086" alt="Perfect Timing Auto Repair A/C ad: a penguin in sunglasses surrounded by snow on a sunny beach. We’ll leave you feeling cooler than a penguin in sunglasses. Call (239) 397-2048." loading="lazy" decoding="async"></a><div class="penguin-ac__copy"><h2 id="penguin-ac-title">We’ll leave you feeling cooler than a penguin in sunglasses.</h2><p>Florida’s hot enough. Your car shouldn’t feel like a sauna.</p><p>A/C blowing warm? Weak airflow? Only cools while you’re driving? We’ll find out why, tell you what it takes, and nothing gets fixed until you say so.</p><p><strong>Stay cool, Fort Myers. Let’s get your A/C working right.</strong></p><div class="penguin-ac__actions"><a class="btn btn--primary" href="/request-a-repair?service=ac">Request A/C service</a><a class="btn btn--outline" href="tel:+12393972048">Call (239) 397-2048</a></div><p class="penguin-ac__note">Fort Myers · Service by appointment. Repair location and availability confirmed for your vehicle.</p></div></div></div></section>';

test('ac-repair-fort-myers.html: new car AC repair snippet, penguin ad unchanged', () => {
  const h = fs.readFileSync(new URL('../ac-repair-fort-myers.html', import.meta.url), 'utf8');
  assert.doesNotMatch(h, /seamless|elevate|unparalleled|top-notch|Structured electronic testing|keeps the engine itself alive|A\/C problems can involve|compare system operation/i);
  const start = h.indexOf('<section class="penguin-ac"');
  const end = h.indexOf('</section>', start) + '</section>'.length;
  assert.equal(h.slice(start, end), PENGUIN_SECTION);
  assert.match(h, /<h2 id="penguin-ac-title">We’ll leave you feeling cooler than a penguin in sunglasses\.<\/h2>/);
  assert.match(h, /Florida’s hot enough\. Your car shouldn’t feel like a sauna\./);
  assert.match(h, /<strong>Stay cool, Fort Myers\. Let’s get your A\/C working right\.<\/strong>/);
  assert.match(h, /alt="Perfect Timing Auto Repair A\/C ad: a penguin in sunglasses surrounded by snow on a sunny beach\. We’ll leave you feeling cooler than a penguin in sunglasses\. Call \(239\) 397-2048\."/);
  assert.match(h, /<meta property="og:image:alt" content="Cooler than a penguin in sunglasses — Perfect Timing Auto Repair A\/C service">/);
  assert.match(h, /<title>Car A\/C Repair in Fort Myers, FL \| Perfect Timing<\/title>/);
  assert.match(h, /<meta property="og:title" content="Car A\/C Repair in Fort Myers, FL \| Perfect Timing">/);
  assert.match(h, /<meta name="twitter:title" content="Car A\/C Repair in Fort Myers, FL \| Perfect Timing">/);
  const description = 'Car A/C repair in Fort Myers, rated 4.8★. AC blowing warm air? AC recharge and compressor repair. Fast replies: call (239) 397-2048.';
  for (const attr of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
    assert.ok(h.includes(`<meta ${attr} content="${description}">`), attr);
  }
  assert.doesNotMatch(h, /AC Repair in Fort Myers, FL \| Perfect Timing/);
  assert.doesNotMatch(h, /leak checks, pressure readings and compressor and fan tests before parts/);
  assert.match(h, /<h1 class="service-hero__title" id="service-title">AC Repair in Fort Myers<\/h1>/);
  assert.match(h, /Repair requests 24\/7/);
  assert.equal((h.match(/class="btn/g) || []).length, 5);
  assert.doesNotMatch(h, /13037|Second St/);
});
