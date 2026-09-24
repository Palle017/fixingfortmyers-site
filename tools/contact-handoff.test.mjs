// DOM-only contract tests. All HTTP is mocked; no provider or live lead is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const root=new URL('../',import.meta.url);
const page=fs.readFileSync(new URL('index.html',root),'utf8');
const site=fs.readFileSync(new URL('site.js',root),'utf8');
const widget=fs.readFileSync(new URL('bay-one-widget.js',root),'utf8');
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
function setup(t,{url='https://preview.invalid/',handler,at='2026-09-24T16:00:00Z',enabled=true,publicContact=false,userAgent}={}){
  const dom=new JSDOM(page,{url,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,requests=[];
  t.after(()=>w.close());
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  w.HTMLElement.prototype.scrollIntoView=function(){};
  if(userAgent)Object.defineProperty(w.navigator,'userAgent',{value:userAgent,configurable:true});
  if(publicContact)w.eval(fs.readFileSync(new URL('contact-config.js',root),'utf8'));else w.PT_CONTACT_CONFIG={endpoint:'https://receiver.invalid'};
  // Parked intake is enabled only inside these fully mocked development tests.
  if(enabled)w.PT_BAYONE_CONFIG={enabled:true};else w.eval(fs.readFileSync(new URL('bay-one-config.js',root),'utf8'));
  const NativeDate=w.Date;w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[at]));}static now(){return NativeDate.parse(at);}};
  w.fetch=async(url,options={})=>{const route=new URL(url).pathname,body=JSON.parse(options.body||'{}');requests.push({route,body,headers:options.headers});return handler?handler(route,body,w):{ok:true,status:200,json:async()=>route==='/chat/session'?{ok:true,visitor_token:'synthetic-token'}:{ok:true,kind:'intake',reply:'Where is your vehicle?',intake:{}}};};
  w.eval(site);w.eval(widget);
  const enter=(id,value)=>{const field=w.document.getElementById(id);field.value=value;field.dispatchEvent(new w.Event('input',{bubbles:true}));};
  const say=async text=>{enter('b1-message',text);w.document.querySelector('.b1-composer').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();};
  return {w,requests,enter,say};
}
test('every intake reply carries customer words to editable form without a lead submit or forced vehicle repetition',async t=>{
  const x=setup(t,{handler:async(route)=>({ok:true,status:200,json:async()=>route==='/chat/session'?{ok:true,visitor_token:'synthetic-token'}:{ok:true,kind:'intake',reply:'Does it start?',intake:{vehicle:'2015 Honda Civic',city:'Fort Myers',starts:'no',stranded:'yes',recipient:'evil@example.invalid'}}})});
  await x.say('My 2015 Honda Civic clicks and will not start.');await x.say('I am stranded in Fort Myers.');
  const d=x.w.document;
  assert.equal(d.querySelectorAll('.b1-request-service').length,2);
  x.enter('request-vehicle','Honda, year uncertain');x.enter('request-starts','yes');
  [...d.querySelectorAll('.b1-request-service')].at(-1).click();
  assert.match(d.getElementById('request-details').value,/My 2015 Honda Civic clicks and will not start\./);
  assert.match(d.getElementById('request-details').value,/I am stranded in Fort Myers\./);
  assert.equal(d.getElementById('request-vehicle').value,'Honda, year uncertain');
  assert.equal(d.getElementById('request-starts').value,'yes');
  assert.equal(d.getElementById('request-city').value,'Fort Myers');assert.equal(d.getElementById('request-stranded').value,'yes');
  assert.equal(d.getElementById('request-vehicle').required,false);
  assert.equal(x.requests.some(r=>r.route==='/hooks/lead/webform'),false);
  assert.match(d.getElementById('request-instructions').textContent,/Nothing has been sent/);
  assert.equal(d.querySelector('[data-b1-mode="estimate"]'),null);assert.equal(d.querySelector('.b1-egg'),null);
  assert.ok(x.requests.filter(r=>r.route==='/chat/message').every(r=>r.body.mode==='chat'));
});
test('initial AI connection failure stays truthful and unsent notes still hand off to the normal form',async t=>{
  const x=setup(t,{handler:async(route,body,w)=>{throw new w.TypeError('Synthetic network outage');}}),d=x.w.document;
  d.querySelector('.b1-launcher').click();await settle();
  assert.match(d.querySelector('.b1-status').textContent,/could not connect/);
  assert.doesNotMatch(d.querySelector('.b1-status').textContent,/preserved|reply|still here/);
  x.enter('b1-message','The engine stopped; I do not know the model.');
  d.querySelector('.b1-contact').click();
  assert.match(d.getElementById('request-details').value,/The engine stopped/);
  assert.ok(d.querySelector('a[href="tel:+12393972048"]'));
  assert.equal(d.getElementById('request-submit').disabled,false);
});
test('service preselection is whitelisted, optional vehicle submits with explicit qualifiers, and uncertain retry is stable',async t=>{
  const x=setup(t,{url:'https://preview.invalid/?service=ac#contact',handler:async()=>({ok:false,status:503,json:async()=>({ok:false})})}),d=x.w.document;
  assert.equal(d.getElementById('request-service').value,'A/C repair');
  assert.equal(d.getElementById('request-phone').required,true);
  assert.equal(d.querySelector('.request-consent').hidden,false);assert.equal(d.getElementById('request-direct-consent').hidden,true);
  x.enter('request-name','Synthetic Customer');x.enter('request-phone','2395550100');x.enter('request-details','Only warm air at idle.');x.enter('request-city','33901');x.enter('request-starts','no');x.enter('request-stranded','yes');
  const consent=d.getElementById('request-sms-consent');consent.checked=true;consent.dispatchEvent(new x.w.Event('input',{bubbles:true}));
  const form=d.getElementById('bookingForm');
  form.dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));await settle();form.dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  const sent=x.requests.filter(r=>r.route==='/hooks/lead/webform');assert.equal(sent.length,2);
  assert.equal(sent[0].headers['Idempotency-Key'],sent[1].headers['Idempotency-Key']);assert.deepEqual(sent[0].body,sent[1].body);
  assert.equal(sent[0].body.starts,'no');assert.equal(sent[0].body.stranded,'yes');assert.equal(sent[0].body.city,'33901');assert.equal(sent[0].body.smsConsent,true);
  assert.match(sent[0].body.details,/City \/ ZIP: 33901/);assert.match(sent[0].body.details,/Vehicle starts: no/);assert.ok(sent[0].body.vehicle);
  assert.equal(form.method,'post');assert.match(d.getElementById('request-status').textContent,/could not confirm receipt/);
  const rejected=setup(t,{url:'https://preview.invalid/?service=%3Cscript%3Ebad%3C%2Fscript%3E'});assert.equal(rejected.w.document.getElementById('request-service').selectedIndex,0);
});
test('after-hours wording uses Eastern time and untrusted text is displayed as text',async t=>{
  const x=setup(t,{at:'2026-09-25T01:00:00Z'}),d=x.w.document;
  assert.match(d.querySelector('.b1-messages').textContent,/8 PM to 8 AM Eastern/);
  await x.say('<img src=x onerror="window.bad=true"> The car will not start.');
  assert.equal(x.w.bad,undefined);assert.equal(d.querySelector('.b1-user img'),null);
  d.querySelector('.b1-request-service').click();assert.match(d.getElementById('request-details').value,/<img src=x/);
  assert.equal(d.querySelector('.b1-estimate'),null);
});

test('long conversation preserves all customer words and blocks sending until the customer shortens it',async t=>{
  const x=setup(t),d=x.w.document;
  const words=['First vehicle information '+ 'a'.repeat(1500),'Second symptom detail '+ 'b'.repeat(1500),'Third location detail '+ 'c'.repeat(1500)];
  for(const text of words)await x.say(text);
  [...d.querySelectorAll('.b1-request-service')].at(-1).click();
  const field=d.getElementById('request-details');for(const text of words)assert.ok(field.value.includes(text));
  assert.equal(field.validity.customError,true);assert.match(d.getElementById('request-status').textContent,/All your notes are preserved/);
  x.enter('request-details','Customer-edited shorter description.');assert.equal(field.validity.customError,false);
});

test('receipt page stays neutral without fresh backend-confirmed evidence and displays no stored customer identity',t=>{
  const html=fs.readFileSync(new URL('request-received.html',root),'utf8');
  const render=record=>{const dom=new JSDOM(html,{url:'https://preview.invalid/request-received.html',runScripts:'outside-only'});t.after(()=>dom.window.close());if(record)dom.window.sessionStorage.setItem('pt-last-request',JSON.stringify(record));for(const script of dom.window.document.querySelectorAll('script:not([src])'))dom.window.eval(script.textContent);return dom.window.document;};
  const empty=render();assert.equal(empty.getElementById('receipt-title').textContent,'Your request status');assert.equal(empty.getElementById('receipt-detail').hidden,true);assert.equal(empty.getElementById('receipt-next').hidden,true);
  const id='12345678-1234-4234-8234-123456789012';
  const stale=render({id,confirmed:true,receivedAt:'2020-01-01T00:00:00Z'});assert.equal(stale.getElementById('receipt-detail').hidden,true);
  const unconfirmed=render({id,receivedAt:new Date().toISOString()});assert.equal(unconfirmed.getElementById('receipt-detail').hidden,true);
  const valid=render({id,confirmed:true,receivedAt:new Date().toISOString(),smsConsent:true,name:'Private identity',vehicle:'Private vehicle'});assert.equal(valid.getElementById('receipt-title').textContent,'Request received');assert.equal(valid.getElementById('receipt-detail').hidden,false);assert.equal(valid.getElementById('receipt-ref').textContent,id);assert.doesNotMatch(valid.body.textContent,/Private identity|Private vehicle/);
});

test('mobile bar retains call and request actions, adds Bay One, and restores focus to the actual entry',async t=>{
  const x=setup(t),d=x.w.document,bar=d.querySelector('.mobile-contact-bar'),entry=bar.querySelector('.b1-bar-launcher');
  assert.equal(bar.children.length,3);assert.equal(bar.children[0].getAttribute('href'),'tel:+12393972048');assert.equal(bar.children[1].getAttribute('href'),'/#contact');
  assert.equal(entry.textContent,'Ask Bay One');assert.ok(d.getElementById('bay-one-widget').classList.contains('b1-has-contact-bar'));
  entry.click();await settle();assert.equal(d.getElementById('b1-panel').hidden,false);assert.equal(entry.getAttribute('aria-expanded'),'true');
  d.querySelector('.b1-close').click();assert.equal(d.getElementById('b1-panel').hidden,true);assert.equal(d.activeElement,entry);assert.equal(entry.getAttribute('aria-expanded'),'false');
  const inline=d.getElementById('request-bay-one');inline.click();await settle();d.querySelector('.b1-close').click();assert.equal(d.activeElement,inline);
  assert.ok(d.querySelector('.b1-launcher'));
});

test('public Bay One is disabled before UI/assets/network while normal contact remains available',async t=>{
  const x=setup(t,{enabled:false,publicContact:true,url:'https://fixingfortmyers.com/'}),d=x.w.document;
  assert.equal(x.w.PT_BAYONE_CONFIG.enabled,false);assert.equal(d.getElementById('bay-one-widget'),null);
  assert.equal(d.querySelector('link[href*="bay-one-widget.css"]'),null);assert.equal(d.querySelector('.b1-bar-launcher'),null);
  assert.equal(d.getElementById('request-bay-one').hidden,true);assert.equal(d.querySelector('.mobile-contact-bar').children.length,2);
  assert.equal(x.requests.length,0);assert.equal(d.getElementById('request-submit').disabled,false);assert.ok(d.querySelector('a[href="tel:+12393972048"]'));
  delete x.w.PT_BAYONE_CONFIG;x.w.eval(widget);assert.equal(d.getElementById('bay-one-widget'),null);assert.equal(x.requests.length,0);
});

test('public form prepares an editable native text intent with no HTTP delivery or receipt claim',async t=>{
  const x=setup(t,{enabled:false,publicContact:true,url:'https://fixingfortmyers.com/'}),d=x.w.document;
  assert.equal(x.w.PT_CONTACT_CONFIG.endpoint,'');assert.equal(d.getElementById('request-submit').textContent,'Prepare text to Tony');assert.equal(d.querySelector('.request-voice').hidden,true);
  assert.equal(d.getElementById('request-phone').required,false);
  assert.equal(d.querySelector('.request-consent').hidden,true);assert.equal(d.getElementById('request-direct-consent').hidden,false);
  x.enter('request-name','Synthetic Customer');x.enter('request-details','Synthetic vehicle will not start.');x.enter('request-city','33901');x.enter('request-starts','no');x.enter('request-stranded','yes');
  d.getElementById('bookingForm').dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal(x.requests.length,0);assert.equal(d.getElementById('request-backup').hidden,false);assert.equal(d.getElementById('request-preview').readOnly,false);
  const link=d.getElementById('request-text');assert.ok(link.getAttribute('href').startsWith('sms:+12393972048?body='));
  assert.match(decodeURIComponent(link.getAttribute('href').split('?body=')[1]),/Synthetic vehicle will not start\./);
  assert.match(d.getElementById('request-preview').value,/Callback: Please reply to this text/);
  assert.doesNotMatch(d.getElementById('request-preview').value,/No; please call/);
  assert.match(d.getElementById('request-preview').value,/Please reply about this repair inquiry\.$/);
  assert.match(d.getElementById('request-status').textContent,/Nothing has been sent yet/);assert.equal(x.w.sessionStorage.getItem('pt-last-request'),null);
  x.enter('request-preview','Customer edited message for Tony.');assert.equal(decodeURIComponent(link.getAttribute('href').split('?body=')[1]),'Customer edited message for Tony.');
  assert.equal(x.w.location.href,'https://fixingfortmyers.com/');assert.equal(x.requests.length,0);
});

test('iPhone text draft uses the Apple body separator and keeps edited customer words with a fixed recipient',t=>{
  const x=setup(t,{enabled:false,publicContact:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'}),d=x.w.document;
  const message='Edited symptoms & location? Please reply.\nNo diagnosis requested.';
  x.enter('request-preview',message);
  const url=d.getElementById('request-text').getAttribute('href');
  assert.equal(url,`sms:+12393972048&body=${encodeURIComponent(message)}`);
  assert.ok(d.getElementById('request-email').getAttribute('href').includes(encodeURIComponent(message)));
  assert.equal(x.requests.length,0);
});
