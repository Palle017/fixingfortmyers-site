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
  const fill = () => {
    for (const [id,value] of Object.entries({'request-city':'Fort Myers','request-name':'Synthetic Customer','request-phone':'2395550100','request-vehicle':'Synthetic test vehicle','request-details':'Synthetic repair symptoms','request-location-choice':'dropoff'})) {
      const field = d.getElementById(id); field.value=value; field.dispatchEvent(new w.Event(id==='request-location-choice'?'change':'input',{bubbles:true}));
    }
  };
  const submit = async () => {fill();d.getElementById('bookingForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();};
  const storage = () => Object.fromEntries(Array.from({length:w.sessionStorage.length},(_,n)=>w.sessionStorage.key(n)).map(key=>[key,w.sessionStorage.getItem(key)]));
  return {w,d,requests,submit,storage};
}

function draftMessages(x) {
  const sms = x.d.getElementById('request-text').getAttribute('href');
  const mail = new URL(x.d.getElementById('request-email').getAttribute('href'));
  assert.ok(sms.startsWith('sms:+12393972048?body='));
  assert.equal(mail.pathname,'fixingfortmyers@gmail.com');
  const smsBody = decodeURIComponent(sms.split('?body=')[1]);
  assert.equal(smsBody,x.d.getElementById('request-preview').value);
  assert.equal(mail.searchParams.get('body'),smsBody);
  assert.equal(x.d.getElementById('request-preview').readOnly,false);
  return smsBody;
}

test('the dedicated repair page retains service context and submits through the existing receiver contract', async t => {
  const inquiry = browser(t, {file:'request-a-repair.html', url:'https://preview.invalid/request-a-repair?service=transmission&utm_source=google', endpoint:'https://receiver.invalid', saved:{'pt-repair-source':'transmission-repair-fort-myers'}});
  await settle();
  await inquiry.submit();
  const leads = inquiry.requests.filter(request => request.path === '/hooks/lead/webform');
  assert.equal(leads.length, 1);
  assert.equal(leads[0].body.channel, 'google');
  assert.equal(leads[0].body.service, 'Transmission');
  assert.equal(leads[0].body.city, 'Fort Myers');
  assert.equal(leads[0].body.carLocation.type, 'dropoff');
  assert.equal(leads[0].body.smsConsent, false);
  assert.match(draftMessages(inquiry), /Website page context: \/transmission-repair-fort-myers/);
});

test('a shared specialty link keeps its source through the service page, inquiry and failed-receiver fallback', async t => {
  const landing = browser(t,{file:'walnut-blasting-fort-myers.html',url:'https://preview.invalid/walnut-blasting-fort-myers?utm_source=gbp_walnut&utm_content=PrivatePerson&phone=2395550199'});
  const inquiry = browser(t,{url:'https://preview.invalid/?service=walnut#contact',endpoint:'https://receiver.invalid',saved:landing.storage()});
  await settle(); await inquiry.submit();
  const leads = inquiry.requests.filter(r=>r.path==='/hooks/lead/webform');
  assert.equal(leads.length,1);assert.equal(leads[0].body.channel,'gbp_walnut');
  assert.equal(leads[0].body.service,'Walnut blasting / carbon cleaning');
  const message = draftMessages(inquiry);
  assert.match(message,/\nWebsite source: gbp_walnut\n/);
  assert.ok(message.endsWith('Website page context: /walnut-blasting-fort-myers (last guide or service viewed)'));
  assert.doesNotMatch(message,/PrivatePerson|2395550199|utm_/);
  assert.equal(inquiry.w.sessionStorage.getItem('pt-last-request'),null);
});

test('symptom-page repair links preserve the matching service and last viewed page in an unsent draft', async t => {
  for (const [page, service, label] of [
    ['transmission-slipping-fort-myers','transmission','Transmission'],
    ['engine-knocking-noise-fort-myers','engine','Engine']
  ]) {
    const landing = browser(t,{file:page+'.html',url:'https://preview.invalid/'+page});
    const actions = [...landing.d.querySelectorAll('a[href]')].filter(link => {
      const url = new URL(link.href);
      return url.origin === 'https://preview.invalid' && url.hash === '#contact';
    });
    assert.equal(actions.length,6,'all six repair actions use the same service');
    for (const action of actions) assert.equal(new URL(action.href).searchParams.get('service'),service);
    assert.equal(landing.w.PT_REPAIR_CONTEXT.service,service);
    assert.equal(landing.storage()['pt-repair-source'],page);
    const inquiry = browser(t,{url:actions[0].href,saved:landing.storage()});
    assert.equal(inquiry.d.getElementById('request-service').value,label);
    await inquiry.submit();
    const message = draftMessages(inquiry);
    assert.ok(message.includes('\nService: '+label+'\n'));
    assert.ok(message.endsWith('Website page context: /'+page+' (last guide or service viewed)'));
    assert.deepEqual(landing.requests,[]);
    assert.deepEqual(inquiry.requests,[],'preparing the draft never submits a lead');
  }
});

test('each approved free-channel link identifies itself in unsent text and email drafts', async t => {
  for (const source of ['google','nextdoor','referral','trade_referral','gbp_no_start','gbp_walnut','gbp_major','nextdoor_no_start','nextdoor_walnut','nextdoor_major']) {
    const x = browser(t,{url:'https://preview.invalid/?utm_source='+source});
    await x.submit();
    assert.ok(draftMessages(x).includes('\nWebsite source: '+source+'\n'));
    assert.equal(x.requests.length,0);
  }
});

test('unapproved URL and stored values cannot enter draft labels; generic lead channels remain compatible', async t => {
  for (const input of [
    {url:'https://preview.invalid/?utm_source=facebook',expectedChannel:'facebook'},
    {url:'https://preview.invalid/?utm_source=PrivatePerson',expectedChannel:'privateperson'},
    {saved:{'pt-lead-channel':'PrivatePerson?phone=2395550199'},expectedChannel:undefined},
    {url:'https://preview.invalid/?utm_source=google%0APrivatePerson',expectedChannel:undefined}
  ]) {
    const x = browser(t,{...input,endpoint:'https://receiver.invalid'});
    await settle();await x.submit();
    assert.equal(x.requests.find(r=>r.path==='/hooks/lead/webform').body.channel,input.expectedChannel);
    const message = draftMessages(x);
    assert.doesNotMatch(message,/Website source:|PrivatePerson|privateperson|2395550199/);
  }
});

test('blocked browser storage keeps current-link attribution and contacting the shop available with private anonymous analytics', async t => {
  const x = browser(t,{url:'https://fixingfortmyers.com/?utm_source=nextdoor_no_start&utm_content=PrivatePerson&phone=2395550199',endpoint:'https://receiver.invalid',blockedStorage:true});
  await settle();await x.submit();
  const lead = x.requests.find(r=>r.path==='/hooks/lead/webform');
  assert.equal(lead.body.channel,'nextdoor_no_start');
  assert.match(draftMessages(x),/\nWebsite source: nextdoor_no_start\n/);
  const events = x.requests.filter(r=>r.path==='/hooks/analytics/event');
  const visits = events.filter(r=>r.body.event==='visit');
  assert.equal(visits.length,1);
  for (const event of events) {
    assert.deepEqual(Object.keys(event.body).sort(),['event','event_id','page','source']);
    assert.equal(event.body.page,'/');
    assert.equal(event.body.source,'other','unlisted campaign labels never enter analytics');
    assert.match(event.body.event_id,/^[A-Za-z0-9_-]{8,100}$/);
    assert.doesNotMatch(JSON.stringify(event.body),/PrivatePerson|2395550199|nextdoor|utm_|visitor_id|Synthetic|2395550100/);
  }
  assert.deepEqual(events.map(r=>r.body.event),['visit','form_started','submit_attempted','submit_unconfirmed']);
});

test('anonymous acquisition survives internal navigation without becoming a raw UTM lead channel', async t => {
  const landing=browser(t,{file:'brake-repair-fort-myers.html',url:'https://fixingfortmyers.com/brake-repair-fort-myers',referrer:'https://www.google.com/search?q=PRIVATE_SEARCH',endpoint:'https://receiver.invalid'});
  await settle();
  assert.equal(landing.storage()['pt-metric-source-v1'],'google');
  const intermediate=browser(t,{file:'repair-guides.html',url:'https://www.fixingfortmyers.com/repair-guides',referrer:'https://fixingfortmyers.com/brake-repair-fort-myers?PRIVATE_QUERY',saved:landing.storage(),endpoint:'https://receiver.invalid'});
  await settle();
  const inquiry=browser(t,{file:'request-a-repair.html',url:'https://fixingfortmyers.com/request-a-repair',referrer:'https://www.fixingfortmyers.com/repair-guides',saved:intermediate.storage(),endpoint:'https://receiver.invalid'});
  await settle(); await inquiry.submit();
  for(const x of [landing,intermediate,inquiry]){
    assert.equal(x.requests.find(r=>r.body?.event==='visit').body.source,'google');
    assert.equal(x.w.PT_ANALYTICS_STATUS.source,'google');
    assert.doesNotMatch(JSON.stringify(x.storage()),/PRIVATE|google\.com|utm_/);
  }
  const lead=inquiry.requests.find(r=>r.path==='/hooks/lead/webform');
  assert.equal(lead.body.channel,undefined,'organic referrer does not invent an explicit campaign code');
  assert.match(lead.body.details,/Found via: google/);
});

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

