import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {confirmationText} from '../_website-intake/customer-texts.mjs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const copy = 'We receive a lot of spam. Your name, callback number and a short repair description help us know who to contact. Vehicle details and a good callback time help us prepare, so requests with useful details are prioritized. Send what you know; partial information is welcome.';
const footerCopy = 'We receive a lot of spam. Name, callback number, repair details and a good callback time help us prepare and prioritize callbacks. Vehicle details help, but send what you know; partial information is welcome.';

test('notice accompanies saved receipts without becoming proof of receipt or confirmation', () => {
  const dom = new JSDOM(read('request-received.html')), d = dom.window.document;
  assert.equal(d.getElementById('receipt-priority-notice').textContent, copy);
  assert.equal(d.getElementById('receipt-next').hidden, true);
  assert.match(d.getElementById('receipt-empty').textContent, /cannot confirm a submission/);
  dom.window.close();
});

test('every existing footer inquiry disclosure explains priority and keeps response limits', () => {
  const pages = fs.readdirSync(root).filter(page => page.endsWith('.html'));
  let checked = 0;
  for (const page of pages) {
    const dom = new JSDOM(read(page)), d = dom.window.document;
    const notice = d.getElementById('hours-disclaimer');
    if (notice) {
      checked++;
      assert.ok(notice.textContent.includes(footerCopy), page);
      assert.match(notice.textContent, /Repair requests 24\/7/);
      assert.match(notice.textContent, /An immediate reply or visit is not guaranteed/);
      assert.match(notice.textContent, /requested times are penciled in until Tony confirms by phone/);
      assert.equal(notice.textContent.split(footerCopy).length, 2, page + ': no duplicate notice');
    }
    dom.window.close();
  }
  assert.ok(checked > 40, 'covers current shared footers');
});

test('new SMS acknowledgments retain priority, safety, consent language and bounded length', () => {
  for (const urgent of [false, true]) {
    for (const name of ['Al', 'A'.repeat(200)]) {
      const body = confirmationText({name, vehicle: 'V'.repeat(160), details: 'Problem: ' + 'Synthetic detail '.repeat(100)}, {urgent});
      assert.ok(body.length <= 320, body.length + ' characters');
      assert.match(body, /We receive spam\. Name, number, car, issue and callback time help us prepare and prioritize\. Send what you know\./);
      assert.match(body, /Call \(239\) 397-2048\. Reply STOP to opt out, HELP for help\.$/);
      assert.doesNotMatch(body, /right away|immediately|within \d|confirmed appointment/i);
      if (urgent) assert.match(body, /marked urgent\. If you're somewhere unsafe, call 911\./);
    }
  }
});

test('phone documentation preserves owner-reported name/car scope and separate website fields', () => {
  const doc = read('docs/CALLBACK-PRIORITY-NOTICE.md').replace(/\r\n/g, '\n');
  assert.match(doc, /Main phone \/ receptionist greeting/);
  assert.match(doc, /Voicemail greeting/);
  assert.match(doc, /actual provider control names and current setting values have not been inspected/);
  assert.match(doc, /proposed, not applied/);
  const phone = doc.slice(doc.indexOf('## Phone and Beside scope'));
  assert.match(phone, /name and car model only/i);
  assert.match(phone, /callback time is optional/i);
  assert.match(phone, /Do not ask repair-issue questions, offer\nappointments, or start a chat flow/);
  assert.match(phone, /not an independent provider readback/);
  assert.match(phone, /vehicle, symptoms and other details\nremain optional/);
  assert.doesNotMatch(phone, /Thanks for calling Perfect Timing|Please leave your message after the tone/);
  assert.match(doc, /does not rewrite queued messages or broadcast to old leads/);
});
