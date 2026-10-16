// Public offer copy must be labor-only, conditional on shop-approved oil prepayment.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const root=new URL('../',import.meta.url);
const index=fs.readFileSync(new URL('index.html',root),'utf8');
const oil=fs.readFileSync(new URL('oil-change-fort-myers.html',root),'utf8');
const req=fs.readFileSync(new URL('request-a-repair.html',root),'utf8');
test('homepage offers only half-off oil-change labor, not half-off materials',()=>{
  const doc=new JSDOM(index).window.document;
  const oilCard=[...doc.querySelectorAll('.service-card')].find(card=>/LIQUI MOLY oil changes/.test(card.textContent));
  assert.ok(oilCard);
  assert.match(oilCard.textContent,/50% off (?:oil-change )?labor/);
  assert.match(oilCard.textContent,/Oil, filter, taxes and additional repairs are extra/);
  assert.ok(oilCard.querySelector('a[href*="offer=liquimoly-labor50"]'));
  assert.ok(doc.getElementById('hero-appointment-date'),'preserve compact calendar');
});
test('oil landing page states prepay condition and excludes materials from discount',()=>{
  const doc=new JSDOM(oil).window.document;
  const offer=doc.getElementById('oil-prepay-offer');
  assert.ok(offer);
  assert.match(offer.textContent,/50%/);
  assert.match(offer.textContent,/correct LIQUI MOLY motor oil approved for your vehicle/);
  assert.match(offer.textContent,/oil-change labor charge by 50%/);
  assert.match(offer.textContent,/motor oil, filter, taxes/);
  assert.match(offer.textContent,/No payment is collected on this page/);
  assert.ok(offer.querySelector('a[href*="offer=liquimoly-labor50"]'));
  assert.equal(doc.querySelector('link[rel="canonical"]').getAttribute('href'),'https://fixingfortmyers.com/oil-change-fort-myers');
});
test('both repair forms carry hidden offer disclosure until explicitly selected',()=>{
  for(const html of [index,req]){
    const doc=new JSDOM(html).window.document;
    const p=doc.getElementById('request-oil-offer');
    assert.ok(p?.hidden);
    assert.match(p.textContent,/50% off oil-change labor/);
    assert.match(p.textContent,/No payment is taken here/);
  }
});
