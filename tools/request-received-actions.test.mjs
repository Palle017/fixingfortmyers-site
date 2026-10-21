// After a request, the receipt's contact buttons say who you reach and invite photos by text.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
test('request-received.html: receipt actions use plain shop labels', () => {
  const d = new JSDOM(fs.readFileSync(new URL('../request-received.html', import.meta.url), 'utf8')).window.document;
  const labels = [...d.querySelectorAll('.receipt-actions a')].map(a => [a.getAttribute('href'), a.textContent.trim()]);
  assert.deepEqual(labels, [['tel:+12393972048','Call the shop (239) 397-2048'],['sms:+12393972048','Text photos to the shop'],['mailto:fixingfortmyers@gmail.com','Email the shop']]);
  assert.match(d.querySelector('.receipt-help').textContent, /Text them to the shop with your reference number/);
});
