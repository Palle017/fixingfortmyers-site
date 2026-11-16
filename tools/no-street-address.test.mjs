// Tony's rule: never publish a street address anywhere in the public site or the public repo,
// including docs, handoff notes and the tests themselves. Static files only; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { findPrivateAddress } from './private-address.mjs';

const root = new URL('../', import.meta.url);
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|pdf|woff2?|ttf|otf|mp4|webm|mov|zip|gz)$/i;
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(f => f && !BINARY.test(f) && f !== 'package-lock.json');

test('the guard recognises street-address shapes without storing the real address', () => {
  assert.notEqual(findPrivateAddress('Visit us at 999 Main Street, Springfield'), null);
  assert.notEqual(findPrivateAddress('{"streetAddress": "anything"}'), null);
  assert.equal(findPrivateAddress('Fort Myers, FL · Bayshore Ranch (North Fort Myers area) · (239) 397-2048'), null);
  assert.equal(findPrivateAddress('Location: 123 Example St, Fort Myers'), null, 'synthetic intake placeholder');
});

test('no tracked text file publishes a street address', () => {
  assert.ok(tracked.length > 100, 'git ls-files returned the repo');
  const hits = [];
  for (const f of tracked) {
    let text;
    try { text = fs.readFileSync(new URL(f, root), 'utf8'); } catch { continue; }
    const hit = findPrivateAddress(text);
    if (hit) hits.push(`${f}: ${hit}`);
  }
  assert.deepEqual(hits, []);
});
