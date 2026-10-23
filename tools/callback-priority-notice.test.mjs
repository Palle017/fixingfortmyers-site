import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {confirmationText} from '../_website-intake/customer-texts.mjs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const copy = 'We receive a high volume of calls. Please leave your name, vehicle year and model, and a good time to call back. Requests with these details are prioritized because they give us the information we need to prepare before calling you back. The more we know upfront, the sooner we can return your call.';
const footerCopy = 'Requests with your name, vehicle year and model, and a good callback time are prioritized so we can prepare before calling you back.';

test('contact and booking share the notice without requiring optional repair details', () => {
  for (const page of ['index.html', 'request-a-repair.html']) {
    const dom = new JSDOM(read(page)), d = dom.window.document;
    assert.equal(d.getElementById('request-priority-notice').textContent, copy);
    assert.match(d.getElementById('bookingForm').getAttribute('aria-describedby'), /request-priority-notice/);
    for (const id of ['request-vehicle-year', 'request-vehicle-model', 'request-details', 'request-timing'])
      assert.equal(d.getElementById(id).required, false, page + ': ' + id + ' remains optional');
    assert.equal(d.querySelectorAll('#bookingForm').length, 1);
    assert.match(d.getElementById('request-pencil-ack').closest('label').textContent, /Tony must speak with me by phone and verbally confirm/);
    assert.doesNotMatch(d.getElementById('request-priority-notice').textContent, /right away|immediate|within \d/i);
    dom.window.close();
  }
});

test('notice accompanies saved receipts without becoming proof of receipt or confirmation', () => {
  for (const page of ['index.html', 'request-a-repair.html']) {
    const dom = new JSDOM(read(page)), d = dom.window.document;
    assert.equal(d.getElementById('request-done-priority').textContent, copy);
    assert.equal(d.getElementById('request-done').hidden, true);
    assert.match(d.getElementById('request-done-note').textContent, /official until Tony confirms it with you by phone/);
    dom.window.close();
  }
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
      assert.match(body, /Requests with your name, vehicle year\/model and callback time are prioritized so we can prepare\./);
      assert.match(body, /Call \(239\) 397-2048\. Reply STOP to opt out, HELP for help\.$/);
      assert.doesNotMatch(body, /right away|immediately|within \d|confirmed appointment/i);
      if (urgent) assert.match(body, /marked urgent\. If you're somewhere unsafe, call 911\./);
    }
  }
});

test('phone rollout is explicit proposed copy and forbids broadcasts or routing changes', () => {
  const doc = read('docs/CALLBACK-PRIORITY-NOTICE.md');
  assert.match(doc, /Main phone \/ receptionist greeting/);
  assert.match(doc, /Voicemail greeting/);
  assert.match(doc, /actual provider control names and current setting values have not been inspected/);
  assert.match(doc, /proposed, not applied/);
  assert.match(doc, /does not rewrite queued messages or broadcast to old leads/);
});
