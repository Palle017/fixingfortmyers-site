// Production-host DOM fixtures with every HTTP request mocked. No live stats/leads.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM, VirtualConsole} from 'jsdom';

const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const script = fs.readFileSync(new URL('site.js', root), 'utf8');
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(setImmediate); };
const reply = (body, status = 200) => ({ok:status >= 200 && status < 300, status, json:async () => body});
const receipt = {ok:true, received:true, id:'12345678-1234-4234-8234-123456789012'};

function setup(t, {url = 'https://fixingfortmyers.com/', referrer, offline = false, analyticsHandler, leadHandler} = {}) {
  const errors = [], console = new VirtualConsole();
  console.on('jsdomError', error => { if (!/Not implemented: navigation/.test(error.message)) errors.push(error); });
  const dom = new JSDOM(html, {url, ...(referrer ? {referrer} : {}), runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:console});
  const w = dom.window, d = w.document, calls = [], retries = [], tools = [];
  t.after(() => { w.close(); assert.deepEqual(errors, []); });
  w.matchMedia = () => ({matches:false});
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.PT_CONTACT_CONFIG = {endpoint:'https://receiver.invalid'};
  d.modelContext = {registerTool(tool) { tools.push(tool); return Promise.resolve(); }};
  const nativeTimeout = w.setTimeout.bind(w);
  w.setTimeout = (callback, delay, ...args) => {
    if (delay === 1500) { retries.push(callback); return 0; }
    return nativeTimeout(callback, delay, ...args);
  };
  w.fetch = async (target, options = {}) => {
    const address = new URL(target);
    assert.equal(address.origin, 'https://receiver.invalid');
    const call = {path:address.pathname, body:options.body && JSON.parse(options.body), headers:options.headers, credentials:options.credentials, keepalive:options.keepalive};
    calls.push(call);
    if (call.path === '/hooks/analytics/event') return analyticsHandler ? analyticsHandler(call) : reply({ok:true});
    if (call.path === '/healthz') {
      if (offline) throw new w.TypeError('Synthetic outage');
      return reply({ok:true});
    }
    assert.equal(call.path, '/hooks/lead/webform');
    return leadHandler ? leadHandler(call) : reply(receipt);
  };
  w.eval(script);
  const field = name => d.querySelector(`[name="${name}"]`);
  const enter = (name, value) => { field(name).value = value; field(name).dispatchEvent(new w.Event('input', {bubbles:true})); field(name).dispatchEvent(new w.Event('change', {bubbles:true})); };
  const metrics = name => calls.filter(call => call.path === '/hooks/analytics/event' && (!name || call.body.event === name));
  const submit = () => d.getElementById('bookingForm').dispatchEvent(new w.Event('submit', {bubbles:true, cancelable:true}));
  const fill = () => { for (const [name,value] of Object.entries({name:'PRIVATE_CUSTOMER', phone:'2395550100', details:'PRIVATE_SYMPTOMS', locationChoice:'dropoff'})) enter(name,value); };
  const click = selector => d.querySelector(selector).dispatchEvent(new w.MouseEvent('click', {bubbles:true, cancelable:true}));
  return {w,d,calls,retries,tools,enter,metrics,submit,fill,click};
}

test('analytics sends only fixed public categories and allowlisted sources, without persistent tracking or private data', async t => {
  for (const [url,referrer,page,source] of [
    ['https://fixingfortmyers.com/?utm_source=chatgpt&name=PRIVATE_QUERY', undefined, '/', 'chatgpt'],
    ['https://fixingfortmyers.com/module-programming-fort-myers.html?phone=PRIVATE_QUERY', 'https://www.google.com/search?q=PRIVATE_REFERRER', '/module-programming-fort-myers', 'google'],
    ['https://fixingfortmyers.com/repair-guide-ecu-tcm-programming?secret=PRIVATE_QUERY', 'https://gemini.google.com/app/PRIVATE_REFERRER', '/repair-guide-ecu-tcm-programming', 'gemini'],
    ['https://fixingfortmyers.com/PRIVATE_PATH?utm_source=PRIVATE_QUERY', undefined, '/other', 'other']
  ]) {
    const x = setup(t, {url, referrer}); await settle();
    assert.equal(x.metrics().length, 1);
    const metric = x.metrics()[0];
    assert.deepEqual(Object.keys(metric.body).sort(), ['event','event_id','page','source']);
    assert.equal(metric.body.event, 'visit'); assert.equal(metric.body.page, page); assert.equal(metric.body.source, source);
    assert.match(metric.body.event_id, /^[A-Za-z0-9_-]{8,100}$/);
    assert.equal(metric.credentials, 'omit'); assert.equal(metric.keepalive, true);
    assert.doesNotMatch(JSON.stringify(metric.body), /PRIVATE|visitor_id|utm_source|referrer/);
    assert.equal(x.w.localStorage.getItem('pt-website-visitor-v1'), null);
  }
});

test('human starts, contact clicks and the discreet AI disclosure are bounded per page and kept separate', async t => {
  const x = setup(t); await settle(); x.fill(); x.enter('details','PRIVATE_UPDATED_SYMPTOMS');
  for (let i=0; i<3; i++) { x.click('a[href^="tel:"]'); x.click('a[href^="sms:"]'); x.click('a[href^="mailto:"]'); }
  const disclosure = x.d.querySelector('.request-ai-help');
  disclosure.open = true; disclosure.dispatchEvent(new x.w.Event('toggle'));
  disclosure.open = false; disclosure.dispatchEvent(new x.w.Event('toggle'));
  disclosure.open = true; disclosure.dispatchEvent(new x.w.Event('toggle'));
  await settle();
  for (const name of ['form_started','call_clicked','text_clicked','email_clicked','ai_help_opened']) assert.equal(x.metrics(name).length, 1, name);
  assert.equal(x.metrics('submit_attempted').length, 0);
  assert.equal(x.metrics('submit_unconfirmed').length, 0);
  assert.doesNotMatch(JSON.stringify(x.metrics()), /PRIVATE|2395550100/);
});

test('WebMCP preparation is separate from human form starts and attempts reflect actual HTTP requests', async t => {
  let attempts = 0;
  const x = setup(t, {leadHandler:() => ++attempts === 1 ? reply({ok:false}, 503) : reply(receipt)}); await settle();
  const input = {name:'PRIVATE_CUSTOMER', phone:'2395550100', details:'PRIVATE_SYMPTOMS', locationChoice:'dropoff'};
  x.tools[0].execute(input); x.tools[0].execute(input); await settle();
  assert.equal(x.metrics('webmcp_prepared').length, 1);
  assert.equal(x.metrics('form_started').length, 0);
  assert.equal(x.metrics('submit_attempted').length, 0);
  x.submit(); await settle();
  assert.equal(x.metrics('form_started').length, 1);
  assert.equal(x.metrics('submit_attempted').length, 1);
  assert.equal(x.metrics('submit_unconfirmed').length, 1);
  const first = x.calls.find(call => call.path === '/hooks/lead/webform');
  x.tools[0].execute(input); x.submit(); await settle();
  const leads = x.calls.filter(call => call.path === '/hooks/lead/webform');
  assert.equal(x.metrics('submit_attempted').length, 2);
  assert.equal(x.metrics('submit_unconfirmed').length, 1);
  assert.equal(leads[1].headers['Idempotency-Key'], first.headers['Idempotency-Key']);
  assert.deepEqual(leads[1].body, first.body);
  assert.equal(x.metrics().some(call => /received|success|durable/.test(call.body.event)), false, 'durable counts belong to the backend');
  assert.doesNotMatch(JSON.stringify(x.metrics()), /PRIVATE|2395550100/);
});

test('validation failures and offline manual drafts are never counted as network submission attempts', async t => {
  for (const offline of [false,true]) {
    const x = setup(t,{offline}); await settle(); x.submit(); await settle();
    assert.equal(x.metrics('submit_attempted').length,0);
    assert.equal(x.metrics('submit_unconfirmed').length,0);
    if (offline) { x.fill(); x.submit(); await settle(); assert.equal(x.metrics('submit_attempted').length,0); assert.match(x.d.getElementById('request-status').textContent,/Nothing has been sent yet/); }
  }
});

test('analytics retries at most once with the same event ID and cannot block a repair submission', async t => {
  const x = setup(t,{analyticsHandler:() => reply({ok:false},503)}); await settle();
  assert.equal(x.metrics('visit').length,1); assert.equal(x.retries.length,1);
  x.retries.shift()(); await settle();
  assert.equal(x.metrics('visit').length,2);
  assert.deepEqual(x.metrics('visit')[1].body,x.metrics('visit')[0].body);
  assert.equal(x.retries.length,0,'a failed retry does not schedule a third attempt');
  x.fill(); x.submit(); await settle();
  assert.equal(x.calls.filter(call=>call.path==='/hooks/lead/webform').length,1);
  assert.equal(JSON.parse(x.w.sessionStorage.getItem('pt-last-request')).confirmed,true);
  const limited=setup(t,{analyticsHandler:()=>reply({ok:false},429)}); await settle();
  assert.equal(limited.retries.length,0,'rate limits do not trigger retries');
});

test('preview hosts create no analytics events even when the normal form is used', async t => {
  const x = setup(t,{url:'https://preview.invalid/'}); await settle(); x.fill(); x.submit(); await settle();
  assert.equal(x.metrics().length,0);
  assert.equal(x.calls.filter(call=>call.path==='/hooks/lead/webform').length,1);
});
