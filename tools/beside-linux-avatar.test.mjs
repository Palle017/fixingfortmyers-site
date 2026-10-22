import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {JSDOM} from 'jsdom';

// Synthetic names, content and IDs only. Execute the real extractor in a DOM,
// without Chromium, network access, stored browser profiles or private settings.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, '_website-intake/dashboard-sync/capture_beside_linux.py'), 'utf8');
const extractor = source.match(/DOM_NODES_JS = r"""([\s\S]*?)"""/)[1];
const cid = 'prv_01HZZZZZZZZZZZZZZZZZZZZZZA';
const url = `https://app.beside.com/chats/${cid}`;
const python = process.env.BESIDE_TEST_PYTHON || (process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA, 'Programs/Python/Python312/python.exe') : 'python3');

function extract({avatarStyle = 'overflow:hidden;flex-shrink:0', avatarRect = '696,14,36,36',
  rowStyle = 'border-bottom:1px solid black', rowRect = '680,0,600,64',
  title = 'Jane Synthetic', avatar = 'Q', link = '/contacts/synthetic-person', body = 'Synthetic repair details'} = {}) {
  const dom = new JSDOM(`<!doctype html><body>
    <a href="${url}" data-rect="392,68,252,36">${title} 2h</a>
    <a href="https://app.beside.com/chats/prv_01HZZZZZZZZZZZZZZZZZZZZZZB" data-rect="392,130,252,36">Bob Example 3h</a>
    <div style="${rowStyle}" data-rect="${rowRect}">
      <a href="${link}" data-rect="696,0,440,64"><span style="${avatarStyle}" data-rect="${avatarRect}"><span data-rect="709,21,9,21">${avatar}</span></span><span id="contact-title" data-rect="744,21,120,21">${title}</span></a>
    </div>
    <div data-rect="780,120,300,24">11:05 AM</div>
    <div data-rect="780,150,300,24">Today</div>
    <div data-rect="780,180,300,24">${body}</div>
    <textarea data-rect="780,220,300,24">Unsent synthetic draft</textarea>
    <span aria-hidden="true" data-rect="780,260,30,24">Hidden</span>
  </body>`, {url, runScripts: 'outside-only'});
  const {window} = dom;
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {get() { return this.textContent; }});
  window.Element.prototype.getBoundingClientRect = function () {
    const [left, top, width, height] = (this.getAttribute('data-rect') || '0,0,1280,900').split(',').map(Number);
    return {left, top, width, height, right: left + width, bottom: top + height};
  };
  try { return window.eval(`(${extractor})`)({maxNodes: 2500, maxDepth: 45}); }
  finally { window.close(); }
}

function candidate(nodes, title = 'Jane Synthetic') {
  const observations = ['2026-10-21T16:00:00.000Z', '2026-10-21T16:00:00.400Z', '2026-10-21T16:00:00.800Z']
    .map(observed_at => ({observed_at, observed_url_before: url, observed_url_after: url,
      title: 'Chats - Synthetic Shop - Beside', nodes}));
  return {format: 'beside-uia-thread/v1', identity_format: 'beside-uia-identity/v1',
    conversation_id: cid, source_url: url, inventory_label: `${title} 2h`,
    ...observations[2], prior_samples: observations.slice(0, 2)};
}

function verifies(value) {
  const checked = spawnSync(python, [path.join(root, '_website-intake/dashboard-sync/beside_uia.py'), '--verify-stdin'],
    {input: JSON.stringify(value), encoding: 'utf8', env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});
  assert.ifError(checked.error);
  assert.ok([0, 1].includes(checked.status), `Validator failed unexpectedly: ${checked.stderr}`);
  return checked.status === 0;
}

const textNames = nodes => nodes.filter(n => n.role === 'ControlType.Text').map(n => n.name);

test('capture unit omits PrivateTmp=yes and keeps existing security/resource bounds', () => {
  const unit = fs.readFileSync(path.join(root, '_website-intake/dashboard-sync/linux/beside-capture.service'), 'utf8');
  assert.doesNotMatch(unit, /^PrivateTmp=yes$/m);
  for (const line of ['NoNewPrivileges=yes', 'UMask=0077', 'MemoryMax=1G', 'CPUQuota=150%'])
    assert.ok(unit.split(/\r?\n/).includes(line));
});

test('header fallback avatar is excluded and full existing validator passes', () => {
  const nodes = extract();
  assert.ok(!textNames(nodes).includes('Q'));
  assert.ok(textNames(nodes).includes('Jane Synthetic'));
  assert.ok(textNames(nodes).includes('Synthetic repair details'));
  assert.ok(!textNames(nodes).includes('Unsent synthetic draft'));
  assert.ok(!textNames(nodes).includes('Hidden'));
  assert.ok(verifies(candidate(nodes)));
});

test('short real contact name and one-letter message remain intact', () => {
  const nodes = extract({title: 'J', body: 'Q'});
  assert.equal(textNames(nodes).filter(name => name === 'J').length, 1);
  assert.equal(textNames(nodes).filter(name => name === 'Q').length, 1);
  assert.ok(verifies(candidate(nodes, 'J')));
});

for (const [name, options] of [
  ['non-square text container', {avatarRect: '696,14,60,36'}],
  ['large text container', {avatarRect: '696,14,80,80'}],
  ['normal shrinking text', {avatarStyle: 'overflow:hidden;flex-shrink:1'}],
  ['unclipped text', {avatarStyle: 'overflow:visible;flex-shrink:0'}],
  ['outside header row', {rowStyle: '', rowRect: '680,0,600,200'}],
  ['missing header border', {rowStyle: ''}],
  ['substantive content', {avatar: 'Synthetic content'}],
  ['conversation-list link', {link: url}],
]) {
  test(`preserves ${name}; does not broadly discard short text`, () => {
    const nodes = extract(options);
    assert.ok(textNames(nodes).includes(options.avatar || 'Q'));
  });
}

test('wrong header and unstable content still fail the existing validator', () => {
  const nodes = extract();
  const wrong = structuredClone(nodes);
  wrong.find(n => n.role === 'ControlType.Text' && n.name === 'Jane Synthetic').name = 'Different Synthetic';
  assert.ok(!verifies(candidate(wrong)));
  const unstable = candidate(nodes);
  unstable.prior_samples = structuredClone(unstable.prior_samples);
  unstable.prior_samples[0].nodes.find(n => n.name === 'Synthetic repair details').name = 'Different synthetic details';
  assert.ok(!verifies(unstable));
});
