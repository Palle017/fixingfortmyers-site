// Request-repair links pre-select the service that matches the page, not "Engine" by default.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
test('request-a-repair accepts ac and diagnostics service params', () => {
  const page = read('request-a-repair.html');
  const site = read('site.js');
  const selectDom = new JSDOM(page);
  const select = selectDom.window.document.getElementById('request-service');
  assert.ok([...select.options].some(option => option.value === 'A/C repair'));
  assert.ok([...select.options].some(option => option.value === 'Diagnosis / not sure yet'));
  selectDom.window.close();
  for (const [slug, label] of [['ac', 'A/C repair'], ['diagnostics', 'Diagnosis / not sure yet']]) {
    const dom = new JSDOM(page, {url:`https://preview.invalid/request-a-repair?service=${slug}`, runScripts:'outside-only', pretendToBeVisual:true});
    const w = dom.window;
    w.matchMedia = () => ({matches:false, addEventListener(){}, removeEventListener(){}});
    w.PT_CONTACT_CONFIG = {endpoint:''};
    w.eval(site);
    assert.equal(w.document.getElementById('request-service').value, label);
    w.close();
  }
});
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
