// GitHub Pages serves workshop.html at /workshop and only serves /workshop/ from workshop/index.html.
// The directory page redirects to the slashless URL so both addresses resolve and the canonical stays /workshop.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const CANONICAL = 'https://fixingfortmyers.com/workshop';

test('/workshop/ redirects to the slashless workshop page', () => {
  const html = read('workshop/index.html');
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelector('meta[http-equiv="refresh"]')?.getAttribute('content'), '0; url=/workshop');
  assert.equal(document.querySelector('link[rel="canonical"]')?.getAttribute('href'), CANONICAL);
  assert.equal(document.querySelector('meta[name="robots"]')?.getAttribute('content'), 'noindex');
  assert.equal(document.querySelector('a')?.getAttribute('href'), '/workshop');
  assert.equal(document.querySelectorAll('script[type="application/ld+json"], meta[name="description"], meta[property^="og:"], meta[name^="twitter:"]').length, 0);
  assert.doesNotMatch(html, /13037|Second St|streetAddress|penguin-ac/i);
  assert.equal(fs.existsSync(new URL('../workshop.html', import.meta.url)), true);
});

test('the workshop page keeps its slashless canonical and hero rating', () => {
  const html = read('workshop.html');
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelector('link[rel="canonical"]')?.getAttribute('href'), CANONICAL);
  assert.equal(document.querySelector('meta[property="og:url"]')?.getAttribute('content'), CANONICAL);
  const rating = document.querySelector('.service-hero .service-hero__actions + .service-contact-note + .service-rating');
  assert.ok(rating, 'rating line sits with the hero buttons');
  assert.match(rating.textContent, /★ 4\.8 from ~70 Google reviews/);
  assert.match(rating.textContent, /Anthony was very honest, patient, and professional/);
});
