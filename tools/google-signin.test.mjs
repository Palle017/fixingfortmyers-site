// Optional Google sign-in prefill. Synthetic intake and a stubbed Google script: no live network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM, VirtualConsole} from 'jsdom';

const root = new URL('../', import.meta.url);
const script = fs.readFileSync(new URL('site.js', root), 'utf8');
const config = fs.readFileSync(new URL('contact-config.js', root), 'utf8');
const clientId = '123456789012-synthetic.apps.googleusercontent.com';
const settle = async () => { for (let n = 0; n < 6; n++) await new Promise(setImmediate); };
const response = (body, status = 200) => ({ok:status >= 200 && status < 300, status, json:async () => body});
const b64url = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const idToken = claims => `${b64url({alg:'RS256', typ:'JWT'})}.${b64url(claims)}.synthetic-signature`;

function setup(t, {page = 'index.html', googleClientId = ''} = {}) {
  const html = fs.readFileSync(new URL(page, root), 'utf8');
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!/Not implemented: navigation/.test(error.message)) errors.push(error); });
  const dom = new JSDOM(html, {url:'https://preview.invalid/', runScripts:'outside-only', pretendToBeVisual:true, virtualConsole});
  const w = dom.window, d = w.document, requests = [];
  t.after(() => { w.close(); assert.deepEqual(errors, []); });
  w.matchMedia = () => ({matches:false});
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.PT_CONTACT_CONFIG = {endpoint:'https://receiver.invalid', googleClientId};
  w.fetch = async (target, options = {}) => {
    const address = new URL(target);
    assert.equal(address.origin, 'https://receiver.invalid', 'every request stays inside the mock');
    requests.push({path:address.pathname, body:typeof options.body === 'string' ? JSON.parse(options.body) : options.body});
    if (address.pathname === '/healthz') return response({ok:true});
    assert.equal(address.pathname, '/hooks/lead/webform');
    return response({ok:true, received:true, id:'12345678-1234-4234-8234-123456789012', receivedAt:new Date().toISOString()}, 201);
  };
  w.eval(script);
  const enter = (fieldId, value) => { const field = d.getElementById(fieldId); field.value = value; field.dispatchEvent(new w.Event('input', {bubbles:true})); };
  const gsiTags = () => [...d.querySelectorAll('script[src]')].filter(tag => /accounts\.google\.com/.test(tag.src));
  const leads = () => requests.filter(request => request.path === '/hooks/lead/webform');
  const send = () => d.getElementById('bookingForm').dispatchEvent(new w.Event('submit', {bubbles:true, cancelable:true}));
  return {w, d, enter, gsiTags, leads, send};
}

test('public config ships an empty googleClientId and no secrets', () => {
  const w = new JSDOM('', {url:'https://fixingfortmyers.com/', runScripts:'outside-only'}).window;
  w.eval(config);
  assert.equal(w.PT_CONTACT_CONFIG.googleClientId, '');
  assert.doesNotMatch(config, /client_secret|GOCSPX-/i);
  w.close();
});

for (const page of ['index.html', 'request-a-repair.html']) {
  test(`${page}: empty client ID renders no Google button or script, and the form still submits`, async t => {
    const x = setup(t, {page}); await settle();
    x.d.getElementById('bookingForm').dispatchEvent(new x.w.FocusEvent('focusin', {bubbles:true}));
    assert.equal(x.d.getElementById('request-google'), null);
    assert.equal(x.gsiTags().length, 0);
    assert.doesNotMatch(fs.readFileSync(new URL(page, root), 'utf8'), /accounts\.google\.com\/gsi/);
    x.enter('request-vehicle', '2015 BMW 335i');
    x.enter('request-details', 'Rough idle and misfire when cold.');
    x.enter('request-name', 'Synthetic Customer');
    x.enter('request-phone', '239-555-0100');
    x.send(); await settle();
    assert.equal(x.leads().length, 1);
    assert.equal(x.leads()[0].body.name, 'Synthetic Customer');
    assert.equal(Object.hasOwn(x.leads()[0].body, 'google_id_token'), false);
  });
}

test('with a client ID the button loads Google lazily, pre-fills the name, and sends no token', async t => {
  const x = setup(t, {googleClientId:clientId}); await settle();
  const box = x.d.getElementById('request-google');
  assert.ok(box, 'optional sign-in renders');
  assert.equal(x.d.getElementById('request-instructions').nextElementSibling, box, 'sits below the form heading text');
  assert.match(box.textContent, /Optional/);
  assert.ok(x.gsiTags().length <= 1);
  x.d.getElementById('bookingForm').dispatchEvent(new x.w.FocusEvent('focusin', {bubbles:true}));
  const [tag] = x.gsiTags();
  assert.equal(tag.src, 'https://accounts.google.com/gsi/client');
  assert.equal(tag.async, true);
  let options, rendered;
  x.w.google = {accounts:{id:{initialize:o => { options = o; }, renderButton:(el, o) => { rendered = {el, o}; }}}};
  tag.dispatchEvent(new x.w.Event('load'));
  assert.equal(options.client_id, clientId);
  assert.equal(options.auto_select, false);
  assert.equal(Object.hasOwn(options, 'scope'), false, 'default ID token only');
  assert.equal(rendered.el.id, 'request-google-button');
  options.callback({credential:idToken({aud:'someone-else.apps.googleusercontent.com', name:'Wrong Audience'})});
  assert.equal(x.d.getElementById('request-name').value, '', 'tokens for another client are ignored');
  options.callback({credential:idToken({aud:clientId, name:'José Synthetic', email:'jose@example.invalid', email_verified:true})});
  assert.equal(x.d.getElementById('request-name').value, 'José Synthetic');
  assert.equal(x.d.querySelector('input[name="google_id_token"]'), null, 'raw credential is not placed in the form');
  for (const fieldId of ['request-details', 'request-name', 'request-phone']) assert.equal(x.d.getElementById(fieldId).required, true, `${fieldId} stays required`);
  x.enter('request-vehicle', '2015 BMW 335i');
  x.enter('request-details', 'Rough idle and misfire when cold.');
  x.enter('request-phone', '239-555-0100');
  x.send(); await settle();
  assert.equal(x.leads().length, 1);
  const body = JSON.stringify(x.leads()[0].body);
  assert.equal(x.leads()[0].body.name, 'José Synthetic');
  assert.doesNotMatch(body, /synthetic-signature|google_id_token/);
});

test('a name the customer already typed is never overwritten', async t => {
  const x = setup(t, {googleClientId:clientId}); await settle();
  x.enter('request-name', 'Typed Name');
  x.d.getElementById('bookingForm').dispatchEvent(new x.w.FocusEvent('focusin', {bubbles:true}));
  let options;
  x.w.google = {accounts:{id:{initialize:o => { options = o; }, renderButton:() => {}}}};
  x.gsiTags()[0].dispatchEvent(new x.w.Event('load'));
  options.callback({credential:idToken({aud:clientId, name:'Google Name'})});
  assert.equal(x.d.getElementById('request-name').value, 'Typed Name');
});

test('a blocked Google script removes the sign-in and leaves the form alone', async t => {
  const x = setup(t, {googleClientId:clientId}); await settle();
  x.d.getElementById('bookingForm').dispatchEvent(new x.w.FocusEvent('focusin', {bubbles:true}));
  x.gsiTags()[0].dispatchEvent(new x.w.Event('error'));
  assert.equal(x.d.getElementById('request-google'), null);
  assert.ok(x.d.getElementById('request-name'));
});
