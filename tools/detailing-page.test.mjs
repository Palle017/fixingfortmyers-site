// Educational detailing page, linked from the nav, menu, listing, sitemap and request form.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const banned = /seamless|elevate|unparalleled|top-notch|cutting-edge|state-of-the-art|peace of mind/i;

test('detailing page explains each service in plain language', () => {
  const html = read('detailing-fort-myers.html');
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelector('title').textContent, 'Car Detailing in Fort Myers | Perfect Timing Auto Repair');
  assert.equal(document.querySelector('h1').textContent, 'Car Detailing in Fort Myers');
  assert.equal(document.querySelector('link[rel="canonical"]').getAttribute('href'), 'https://fixingfortmyers.com/detailing-fort-myers');
  const visible = document.body.textContent.replace(/\s+/g, ' ');
  assert.match(visible, /compound/i);
  assert.match(visible, /polish/i);
  assert.match(visible, /finish/i);
  assert.match(visible, /ceramic coating/i);
  assert.match(visible, /wax/i);
  assert.match(visible, /sun/i);
  assert.match(visible, /salt air/i);
  assert.match(visible, /bugs/i);
  assert.match(visible, /water spots/i);
  assert.match(visible, /black light|UV light/i);
  assert.match(visible, /body fluids/i);
  assert.match(visible, /ozone/i);
  assert.match(visible, /smoke/i);
  assert.match(visible, /closed/i);
  assert.match(visible, /before (?:a )?coating|coating goes on after|after correction/i);
  const questions = [...document.querySelectorAll('.faq-item h3')].map(node => node.textContent.trim());
  assert.ok(questions.length >= 3 && questions.length <= 5, 'short FAQ');
  assert.doesNotMatch(html, banned);
  assert.doesNotMatch(html, /\$\d|\bwarranty\b|\bcertified\b|\bcertification\b|\d+\s*years/i);
  assert.doesNotMatch(html, /13037|Second St/);
  assert.equal(document.querySelectorAll('.service-ad a[href^="tel:"], .service-ad a[href^="sms:"]').length, 0);
});

test('detailing is linked from the nav, menu, listing, sitemap, footer and schema', () => {
  const home = read('index.html');
  const document = new JSDOM(home).window.document;
  assert.equal(document.querySelector('.nav__links a[href="/detailing-fort-myers"]').textContent.trim(), 'Detailing');
  assert.equal(document.querySelector('#mobileMenu a[href="/detailing-fort-myers"]').textContent.trim(), 'Detailing');
  assert.ok([...document.querySelectorAll('.service-directory a')].some(anchor => anchor.getAttribute('href') === '/detailing-fort-myers'));
  assert.ok([...document.querySelectorAll('footer a')].some(anchor => anchor.getAttribute('href') === '/detailing-fort-myers'));
  assert.match(home, /"url": "https:\/\/fixingfortmyers\.com\/detailing-fort-myers"/);
  assert.match(home, /<h1 id="home-title">Car trouble has terrible timing\. <br><span>Luckily, you’ve got Perfect Timing\.<\/span><\/h1>/);
  assert.match(read('sitemap.xml'), /<loc>https:\/\/fixingfortmyers\.com\/detailing-fort-myers<\/loc>/);
  assert.match(read('parts.html'), /href="\/detailing-fort-myers">Detailing</);
  assert.match(read('request-a-repair.html'), /href="\/detailing-fort-myers">Detailing</);
});

test('detailing keeps service attribution while the baseline form stays minimal', () => {
  const site = read('site.js');
  assert.match(site, /detailing:'Detailing \/ paint correction'/);
  assert.match(site, /'detailing-fort-myers':'detailing'/);
  assert.match(site, /'\/detailing-fort-myers'/);
  for (const file of ['request-a-repair.html', 'index.html']) {
    const doc = new JSDOM(read(file)).window.document;
    assert.equal(doc.getElementById('request-service'), null);
    assert.ok(doc.getElementById('request-vehicle').required);
  }
});
