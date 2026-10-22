// Homepage hero: six service links sit directly under the H1.
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
];

test('homepage H1 is followed by six service links to real pages', () => {
  const html = read('index.html');
  assert.match(html, /<h1 id="home-title">Car trouble has terrible timing\. <br><span>Luckily, you’ve got Perfect Timing\.<\/span><\/h1>/);
  const document = new JSDOM(html).window.document;
  const heading = document.getElementById('home-title');
  const row = heading.nextElementSibling;
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
