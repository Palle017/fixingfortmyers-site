// The workshop and engine pages show the same real Google rating and quote as the homepage, linked to the profile.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const home = read('index.html');
for (const page of ['workshop.html','engine-repair-fort-myers.html']) test(`${page}: hero shows the homepage's real Google rating`, () => {
  const d = new JSDOM(read(page)).window.document;
  const p = d.querySelector('.service-hero .service-rating');
  assert.ok(p);
  const a = p.querySelector('a');
  assert.match(a.href, /^https:\/\/www\.google\.com\/maps\/place\/Perfect\+Timing/);
  assert.match(a.textContent, /★ 4\.8 from ~70 Google reviews/);
  assert.ok(home.includes('★ 4.8</strong> from ~70 Google reviews'), 'rating must match the homepage');
  const quote = p.textContent.match(/“([^”]+)”/)[1];
  assert.ok(home.includes(`“${quote}”`), 'quote must be an existing homepage review');
});

const googleReviews = 'https://www.google.com/maps/place/Perfect+Timing+Auto+Repair+LLC/data=!4m2!3m1!1s0x88db6ffa0afe8209:0x90e69f392087435b';
const ratingLine = /★ 4\.8 on Google from Fort Myers drivers\. Read the reviews\./;

test('walnut blasting: hero offers Text Tony and the Google rating line', () => {
  const doc = new JSDOM(read('walnut-blasting-fort-myers.html')).window.document;
  const hero = doc.querySelector('.service-hero');
  const actions = [...hero.querySelectorAll('.service-hero__actions a')];
  const call = actions.find(a => a.getAttribute('href') === 'tel:+12393972048');
  const text = actions.find(a => a.getAttribute('href') === 'sms:+12393972048');
  assert.equal(call?.textContent.trim(), 'Call (239) 397-2048');
  assert.equal(text?.textContent.trim(), 'Text Tony');
  assert.match(text?.className || '', /btn--outline/);
  assert.ok(actions.indexOf(text) === actions.indexOf(call) + 1, 'Text Tony sits next to the call button');
  const rating = hero.querySelector('.service-rating a');
  assert.equal(rating?.getAttribute('href'), googleReviews);
  assert.match(rating?.textContent || '', ratingLine);
  assert.ok(hero.querySelector('.service-hero__actions').compareDocumentPosition(rating) & 4, 'rating line sits under the hero buttons');
});

test('walnut blasting: inquiry block offers Google review proof and a direct text action', () => {
  const doc = new JSDOM(read('walnut-blasting-fort-myers.html')).window.document;
  const block = [...doc.querySelectorAll('.service-panel')].find(el => el.querySelector('h2')?.textContent?.includes('Tell us about your engine'));
  assert.ok(block, 'walnut inquiry block exists');
  assert.equal(block.querySelector('a[href^="sms:"]')?.getAttribute('href'), 'sms:+12393972048');
  assert.match(block.querySelector('a[href^="sms:"]')?.textContent, /Text Tony/);
  const rating = block.querySelector('.service-rating a[href^="https://www.google.com/maps/place/"]');
  assert.equal(rating?.getAttribute('href'), googleReviews);
  assert.match(rating?.textContent || '', ratingLine);
  assert.equal(block.querySelector('a[href^="/request-a-repair"]')?.getAttribute('href'), '/request-a-repair?service=walnut');
});

test('request a repair: Google rating sits under the title and above submit', () => {
  const doc = new JSDOM(read('request-a-repair.html')).window.document;
  const title = doc.getElementById('request-page-title');
  const submit = doc.querySelector('#bookingForm button[type="submit"]');
  const rating = doc.querySelector('.request-page .service-rating');
  const link = rating?.querySelector('a');
  assert.equal(title?.textContent.trim(), 'Request a repair');
  assert.ok(submit, 'submit button exists');
  assert.ok(rating, 'service-rating line exists');
  assert.equal(link?.getAttribute('href'), googleReviews);
  assert.ok(home.includes(googleReviews), 'link must be the homepage Google Maps place');
  assert.equal(link?.getAttribute('target'), '_blank');
  assert.equal(link?.getAttribute('rel'), 'noopener');
  assert.equal(rating.textContent.trim(), '★ 4.8 from ~70 Google reviews');
  assert.ok(home.includes('★ 4.8</strong> from ~70 Google reviews'), 'rating must match the homepage');
  assert.ok(title.compareDocumentPosition(rating) & 4, 'rating sits under the request page title');
  assert.ok(rating.compareDocumentPosition(submit) & 4, 'rating sits above the submit button');
});
