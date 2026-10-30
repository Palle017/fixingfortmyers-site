// Homepage hero: a clear repair request precedes the service browsing links.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');

const links = [
  ['Module Programming', 'Module programming in Fort Myers', '/module-programming-fort-myers'],
  ['Engine', 'Engine repair in Fort Myers', '/engine-repair-fort-myers'],
  ['Transmission', 'Transmission repair in Fort Myers', '/transmission-repair-fort-myers'],
  ['Diesel', 'Diesel repair in Fort Myers', '/diesel-repair-fort-myers'],
  ['A/C', 'A/C repair in Fort Myers', '/ac-repair-fort-myers'],
  ['Car Audio', 'Car audio installation in Fort Myers', '/car-audio-installation-fort-myers'],
  ['Detailing', 'Car detailing in Fort Myers', '/detailing-fort-myers'],
];

test('homepage keeps all seven service links after its primary repair request', () => {
  const html = read('index.html');
  assert.match(html, /<h1 id="home-title">Car trouble has terrible timing\. <br><span>Luckily, you’ve got Perfect Timing\.<\/span><\/h1>/);
  const document = new JSDOM(html).window.document;
  assert.equal(document.title, 'Auto Repair Fort Myers, FL | Engine, Transmission & Diesel');
  const heading = document.getElementById('home-title');
  const row = document.querySelector('.home-start__services');
  const primary = document.querySelector('.home-start__actions .btn--primary');
  assert.equal(primary?.getAttribute('href'), '#contact');
  assert.ok(heading.compareDocumentPosition(primary) & 4, 'heading precedes the repair request');
  assert.ok(primary.compareDocumentPosition(row) & 4, 'repair request precedes secondary service navigation');
  assert.equal(row?.classList.contains('home-start__services'), true);
  assert.equal(row.querySelectorAll('a[href^="tel:"], a[href^="sms:"], button').length, 0);
  assert.doesNotMatch(row.textContent, /13037|Second St/);
  const anchors = [...row.querySelectorAll(':scope > a')];
  assert.deepEqual(anchors.map(anchor => [anchor.textContent.trim(), anchor.getAttribute('aria-label'), anchor.getAttribute('href')]), links);
  for (const [, , href] of links) {
    assert.equal(fs.existsSync(new URL(`.${href}.html`, root)), true, href);
  }
  const bundleHref = [...document.querySelectorAll('link[data-css-sources]')].find(link => link.getAttribute('data-css-sources').split(' ').includes('home-clean.css'))?.getAttribute('href');
  const bundle = read(bundleHref.split('?')[0].replace(/^\//, ''));
  assert.match(bundle, /\.home-start__services\{[^}]*display:flex[^}]*flex-wrap:wrap/);
  assert.match(read('home-clean.css'), /\.home-start__services\{[^}]*display:flex[^}]*flex-wrap:wrap/);
});
