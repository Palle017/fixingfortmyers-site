// Request-repair links pre-select the service that matches the page, not "Engine" by default.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
test('workshop.html: request links open the dedicated repair form on diagnostics, not Engine', () => {
  const h = read('workshop.html');
  assert.doesNotMatch(h, /\?service=engine/);
  assert.doesNotMatch(h, /href="\/\?service=diagnostics#contact"/);
  assert.ok((h.match(/href="\/request-a-repair\?service=diagnostics"/g) || []).length >= 5);
});
test('cooling-system-repair-fort-myers.html: request links pre-select the cooling service', () => {
  const h = read('cooling-system-repair-fort-myers.html');
  assert.doesNotMatch(h, /href="\/#contact"/);
  assert.ok((h.match(/href="\/\?service=cooling#contact"/g) || []).length >= 6);
});

test('walnut-blasting-fort-myers.html: all 7 repair CTAs open a preselected dedicated form', () => {
  const doc = new JSDOM(read('walnut-blasting-fort-myers.html')).window.document;
  const links = [...doc.querySelectorAll('a[href]')].filter(a => a.getAttribute('href')?.includes('service=walnut'));
  assert.equal(links.length, 7);
  for (const link of links) assert.equal(link.getAttribute('href'), '/request-a-repair?service=walnut');
  const dom = new JSDOM(read('request-a-repair.html'), {url:'https://preview.invalid/request-a-repair?service=walnut', runScripts:'outside-only', pretendToBeVisual:true});
  dom.window.matchMedia = () => ({matches:false, addEventListener(){}, removeEventListener(){}});
  dom.window.PT_CONTACT_CONFIG = {endpoint:''};
  dom.window.eval(read('site.js'));
  const service = dom.window.document.getElementById('request-service');
  assert.equal(service?.type, 'hidden', 'service from the link stays a hidden field');
  assert.equal(dom.window.document.querySelector('#bookingForm select'), null, 'baseline request does not add a service dropdown');
  assert.ok(dom.window.document.getElementById('request-vehicle').required);
  dom.window.close();
});
