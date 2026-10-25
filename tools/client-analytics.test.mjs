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

function setup(t, {url = 'https://fixingfortmyers.com/', referrer, offline = false, analyticsHandler, leadHandler, ga4MeasurementId = '', saved = {}} = {}) {
  const errors = [], console = new VirtualConsole();
  console.on('jsdomError', error => { if (!/Not implemented: navigation/.test(error.message)) errors.push(error); });
  const dom = new JSDOM(html, {url, ...(referrer ? {referrer} : {}), runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:console});
  const w = dom.window, d = w.document, calls = [], retries = [], tools = [];
  t.after(() => { w.close(); assert.deepEqual(errors, []); });
  w.matchMedia = () => ({matches:false});
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.PT_CONTACT_CONFIG = {endpoint:'https://receiver.invalid', ga4MeasurementId};
  for (const [key,value] of Object.entries(saved)) w.sessionStorage.setItem(key,value);
  d.modelContext = {registerTool(tool) { tools.push(tool); return Promise.resolve(); }};
  const nativeTimeout = w.setTimeout.bind(w);
  w.setTimeout = (callback, delay, ...args) => {
    if (delay === 1500) { retries.push(callback); return 0; }
    return nativeTimeout(callback, delay, ...args);
  };
  w.fetch = async (target, options = {}) => {
    const address = new URL(target);
    assert.equal(address.origin, 'https://receiver.invalid');
    const call = {path:address.pathname, body:options.body && JSON.parse(options.body), headers:options.headers, credentials:options.credentials, referrerPolicy:options.referrerPolicy, keepalive:options.keepalive};
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
  const fill = () => { for (const [name,value] of Object.entries({name:'PRIVATE_CUSTOMER', phone:'2395550100', details:'PRIVATE_SYMPTOMS', city:'Fort Myers', locationChoice:'dropoff'})) enter(name,value); };
  const click = selector => d.querySelector(selector).dispatchEvent(new w.MouseEvent('click', {bubbles:true, cancelable:true}));
  return {w,d,calls,retries,tools,enter,metrics,submit,fill,click};
}

const localEvents = x => Array.from(x.w.dataLayer).filter(entry => entry.event);
const googleEvents = x => Array.from(x.w.dataLayer).filter(entry => entry[0] === 'event');

test('contact taps keep fixed per-page categories and never export request fields', async t => {
  const x=setup(t,{ga4MeasurementId:'G-TEST1234'});await settle();
  for(let i=0;i<2;i++)for(const selector of ['a[href^="tel:"]','a[href^="sms:"]','a[href^="mailto:"]'])x.click(selector);
  await settle();
  for(const name of ['call_clicked','text_clicked','email_clicked'])assert.equal(x.metrics(name).length,1,name);
  assert.equal(googleEvents(x).filter(entry=>entry[1]==='phone_click').length,2);
  assert.doesNotMatch(JSON.stringify(x.metrics()),/2395550100|Synthetic|vehicle|symptoms/);
});

test('anonymous metric retries reuse their event ID once and rate limits do not create retry loops', async t => {
  const x=setup(t,{analyticsHandler:()=>reply({ok:false},503)});await settle();
  assert.equal(x.metrics('visit').length,1);assert.equal(x.retries.length,1);
  x.retries.shift()();await settle();
  assert.equal(x.metrics('visit').length,2);assert.deepEqual(x.metrics('visit')[1].body,x.metrics('visit')[0].body);
  assert.equal(x.retries.length,0);
  const limited=setup(t,{analyticsHandler:()=>reply({ok:false},429)});await settle();
  assert.equal(limited.retries.length,0);
});

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
    assert.equal(metric.referrerPolicy,'no-referrer');
    assert.doesNotMatch(JSON.stringify(metric.body), /PRIVATE|visitor_id|utm_source|referrer/);
    assert.equal(x.w.localStorage.getItem('pt-website-visitor-v1'), null);
  }
});

test('GA4 stays honestly unconfigured until an actual ID is provided, and never loads on previews', async t => {
  for (const [options,expected] of [
    [{},'not_configured'],
    [{ga4MeasurementId:'PRIVATE_INVALID_ID'},'invalid_id'],
    [{url:'https://preview.invalid/',ga4MeasurementId:'G-TEST1234'},'preview_disabled']
  ]) {
    const x = setup(t,options); await settle();
    assert.equal(x.w.PT_ANALYTICS_STATUS.ga4,expected);
    assert.equal(x.d.querySelectorAll('script[src*="googletagmanager.com"]').length,0);
    assert.equal(localEvents(x).filter(event=>event.event==='page_view').length,1,'local diagnostics are not a claim of Google delivery');
    assert.equal(x.w.gtag,undefined);
  }
});

test('configured GA4 sends one sanitized page view and reports only tag loading, not confirmed collection', async t => {
  const x = setup(t,{
    url:'https://fixingfortmyers.com/transmission-repair-fort-myers.html?utm_source=PRIVATE_CAMPAIGN&name=PRIVATE_NAME#PRIVATE_FRAGMENT',
    referrer:'https://www.google.com/search?q=PRIVATE_SEARCH', ga4MeasurementId:'G-TEST1234'
  });
  await settle();
  const config = Array.from(x.w.dataLayer).find(entry=>entry[0]==='config');
  assert.equal(config[1],'G-TEST1234');
  assert.equal(config[2].send_page_view,false);
  assert.equal(config[2].page_location,'https://fixingfortmyers.com/transmission-repair-fort-myers');
  assert.equal(config[2].page_referrer,'');
  assert.equal(googleEvents(x).filter(entry=>entry[1]==='page_view').length,1);
  const tag=x.d.querySelector('script[src*="googletagmanager.com"]');
  assert.equal(tag.referrerPolicy,'no-referrer');
  assert.equal(x.w.PT_ANALYTICS_STATUS.ga4,'loading');
  tag.dispatchEvent(new x.w.Event('load'));
  assert.equal(x.w.PT_ANALYTICS_STATUS.ga4,'tag_loaded_unverified');
  assert.doesNotMatch(JSON.stringify(x.w.dataLayer),/PRIVATE|utm_source/);
  assert.equal(x.metrics('visit')[0].body.page,'/other','do not expand the unknown cloud receiver schema');
});

test('GA4 page detail covers known public pages but arbitrary paths and event parameters cannot expose private text', async t => {
  for (const page of ['brake-repair-fort-myers','repair-guide-car-wont-start','careers','request-a-repair','request-received','PRIVATE_PATH']) {
    const x=setup(t,{url:'https://fixingfortmyers.com/'+page+'.html?phone=PRIVATE_NUMBER'}); await settle();
    const event=localEvents(x).find(entry=>entry.event==='page_view');
    assert.equal(event.page_path,page==='PRIVATE_PATH'?'/other':'/'+page);
    assert.equal(event.page_referrer,'');
    x.w.PT_LEAD_CHANNEL='PRIVATE_LEAD_CHANNEL';
    x.w.PT_TRACK('form_submit_attempt',{service:'PRIVATE_CUSTOMER',name:'PRIVATE_NAME',vehicle:'PRIVATE_VEHICLE',page_path:'/PRIVATE_PATH',lead_source:'PRIVATE_SOURCE',attempt:1});
    x.w.PT_TRACK('PRIVATE_EVENT',{details:'PRIVATE_DETAILS'});
    assert.doesNotMatch(JSON.stringify(x.w.dataLayer),/PRIVATE|phone=/);
    assert.equal(localEvents(x).at(-1).lead_source,'direct');
    assert.equal(localEvents(x).at(-1).service,'not_given');
  }
});

test('every public content page keeps its exact approved path for page-level reporting', async t => {
  // Scoped bearer conversations intentionally load no analytics or normal site script.
  // Keep the privacy exception explicit; every existing public content path is still checked.
  const privateHtml=fs.readFileSync(new URL('customer-conversation.html',root),'utf8');
  const privateDom=new JSDOM(privateHtml),privatePage=privateDom.window.document;
  assert.deepEqual([...privatePage.querySelectorAll('script[src]')].map(node=>node.getAttribute('src')),['customer-conversation-config.js','customer-conversation.js']);
  assert.doesNotMatch(privateHtml,/site\.js|gtag|google-analytics|googletagmanager|analytics/i);
  for(const node of privatePage.querySelectorAll('[src],[href]'))assert.doesNotMatch(node.getAttribute('src')||node.getAttribute('href'),/^(?:https?:)?\/\//,'private page has no third-party assets or links');
  assert.equal(privatePage.querySelector('meta[name="referrer"]').content,'no-referrer');
  privateDom.window.close();
  const pages=fs.readdirSync(root).filter(file=>file.endsWith('.html') && file!=='404.html' && file!=='customer-conversation.html' && !/^google[a-z0-9]+\.html$/.test(file));
  for(const file of pages){
    const x=setup(t,{url:'https://fixingfortmyers.com/'+file}); await settle();
    assert.equal(x.w.PT_ANALYTICS_STATUS.page,file==='index.html'?'/':'/'+file.replace(/\.html$/,''),file);
  }
});

