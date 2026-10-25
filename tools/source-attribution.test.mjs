// Customer journeys against synthetic endpoints only; no live visits or inquiries.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM, VirtualConsole} from 'jsdom';

const root = new URL('../', import.meta.url);
const script = fs.readFileSync(new URL('site.js', root), 'utf8');
const settle = async () => { for (let n = 0; n < 5; n++) await new Promise(setImmediate); };
const response = (body, status = 200) => ({ok:status < 400, status, json:async () => body});

function browser(t, {file = 'index.html', url = 'https://preview.invalid/', referrer, endpoint = '', saved = {}, blockedStorage = false} = {}) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(fs.readFileSync(new URL(file, root), 'utf8'), {url, ...(referrer?{referrer}:{}), runScripts:'outside-only', pretendToBeVisual:true, virtualConsole});
  const w = dom.window, d = w.document, requests = [];
  t.after(() => { w.close(); assert.deepEqual(errors, []); });
  w.matchMedia = () => ({matches:false});
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.PT_CONTACT_CONFIG = {endpoint};
  for (const [key,value] of Object.entries(saved)) w.sessionStorage.setItem(key,value);
  if (blockedStorage) for (const key of ['sessionStorage','localStorage']) Object.defineProperty(w,key,{get(){throw new w.DOMException('Storage blocked','SecurityError');}});
  w.fetch = async (target, options = {}) => {
    const address = new URL(target);
    assert.equal(address.origin, 'https://receiver.invalid', 'all traffic stays in the synthetic receiver');
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({path:address.pathname,body});
    if (address.pathname === '/healthz' || address.pathname === '/hooks/analytics/event') return response({ok:true});
    assert.equal(address.pathname, '/hooks/lead/webform');
    return response({ok:false},503);
  };
  w.eval(script);
  const storage = () => Object.fromEntries(Array.from({length:w.sessionStorage.length},(_,n)=>w.sessionStorage.key(n)).map(key=>[key,w.sessionStorage.getItem(key)]));
  return {w,d,requests,storage};
}

test('new campaign/external arrivals replace acquisition while empty referrers preserve a validated session category', async t => {
  for(const [options,expected] of [
    [{},'google'],
    [{url:'https://fixingfortmyers.com/?utm_source=chatgpt'},'chatgpt'],
    [{referrer:'https://www.bing.com/search?q=PRIVATE_SEARCH'},'bing'],
    [{url:'https://fixingfortmyers.com/?utm_source=PRIVATE_CAMPAIGN'},'other'],
    [{saved:{'pt-metric-source-v1':'PRIVATE_STORED_SOURCE'}},'direct']
  ]){
    const x=browser(t,{url:'https://fixingfortmyers.com/',saved:{'pt-metric-source-v1':'google'},...options,endpoint:'https://receiver.invalid'});
    await settle();
    assert.equal(x.requests.find(r=>r.body?.event==='visit').body.source,expected);
    assert.equal(x.storage()['pt-metric-source-v1'],expected);
    assert.doesNotMatch(JSON.stringify(x.w.dataLayer),/PRIVATE/);
  }
});

test('organic acquisition survives internal navigation without storing raw referrer or URL text', async t => {
  const landing=browser(t,{file:'brake-repair-fort-myers.html',url:'https://fixingfortmyers.com/brake-repair-fort-myers',referrer:'https://www.google.com/search?q=PRIVATE_SEARCH',endpoint:'https://receiver.invalid'});
  await settle();
  const intermediate=browser(t,{file:'repair-guides.html',url:'https://www.fixingfortmyers.com/repair-guides',referrer:'https://fixingfortmyers.com/brake-repair-fort-myers?PRIVATE_QUERY',saved:landing.storage(),endpoint:'https://receiver.invalid'});
  await settle();
  const inquiry=browser(t,{file:'request-a-repair.html',url:'https://fixingfortmyers.com/request-a-repair',referrer:'https://www.fixingfortmyers.com/repair-guides',saved:intermediate.storage(),endpoint:'https://receiver.invalid'});
  await settle();
  for(const x of [landing,intermediate,inquiry]){
    assert.equal(x.requests.find(r=>r.body?.event==='visit').body.source,'google');
    assert.equal(x.w.PT_ANALYTICS_STATUS.source,'google');
    assert.doesNotMatch(JSON.stringify(x.storage()),/PRIVATE|google\.com|utm_/);
  }
});

test('blocked browser storage still permits a sanitized page visit', async t => {
  const x=browser(t,{url:'https://fixingfortmyers.com/?utm_source=nextdoor_no_start&utm_content=PRIVATE_NAME&phone=PRIVATE_PHONE',endpoint:'https://receiver.invalid',blockedStorage:true});
  await settle();
  assert.equal(x.requests.length,1);
  assert.deepEqual(Object.keys(x.requests[0].body).sort(),['event','event_id','page','source']);
  assert.equal(x.requests[0].body.source,'other');
  assert.doesNotMatch(JSON.stringify(x.requests),/PRIVATE|utm_|nextdoor|visitor_id/);
});

