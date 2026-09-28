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
function setup(t,{url='https://preview.invalid/',handler,at='2026-09-24T16:00:00Z',enabled=true,publicContact=false,userAgent,savedSource,beforeScripts}={}){
  const dom=new JSDOM(page,{url,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,requests=[];
  t.after(()=>w.close());
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  w.HTMLElement.prototype.scrollIntoView=function(){};
  if(userAgent)Object.defineProperty(w.navigator,'userAgent',{value:userAgent,configurable:true});
  if(publicContact)w.eval(fs.readFileSync(new URL('contact-config.js',root),'utf8'));else w.PT_CONTACT_CONFIG={endpoint:'https://receiver.invalid'};
  // Tests set the Bay One flag explicitly; the shipped flag is checked separately below.
  w.PT_BAYONE_CONFIG={enabled};
  const NativeDate=w.Date;w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[at]));}static now(){return NativeDate.parse(at);}};
  w.fetch=async(url,options={})=>{const route=new URL(url).pathname,body=typeof options.body==='string'||options.body===undefined?JSON.parse(options.body||'{}'):options.body;requests.push({route,body,headers:options.headers});return handler?handler(route,body,w):{ok:true,status:200,json:async()=>route==='/chat/session'?{ok:true,visitor_token:'synthetic-token'}:{ok:true,kind:'intake',reply:'Where is your vehicle?',intake:{}}};};
  if(savedSource)w.sessionStorage.setItem('pt-repair-source',savedSource);
  beforeScripts?.(w);
  w.eval(site);w.eval(widget);
  const enter=(id,value)=>{const field=w.document.getElementById(id);field.value=value;field.dispatchEvent(new w.Event('input',{bubbles:true}));};
  const say=async text=>{enter('b1-message',text);w.document.querySelector('.b1-composer').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();};
  return {w,requests,enter,say};
}
test('chat collects the problem, then its contact card sends one lead with the whole chat straight to Tony',async t=>{
  let turn=0;
  const x=setup(t,{handler:async(route,body)=>{
    if(route==='/healthz')return {ok:true,status:200,json:async()=>({ok:true,chat:'ready'})};
    if(route==='/chat/session')return {ok:true,status:200,json:async()=>({ok:true,visitor_token:'synthetic-token'})};
    if(route==='/hooks/lead/webform')return {ok:true,status:201,json:async()=>({ok:true,received:true,id:'12345678-1234-4234-8234-123456789012',receivedAt:'2026-09-24T16:00:00.000Z'})};
    turn++;return {ok:true,status:200,json:async()=>(turn===1?{ok:true,kind:'intake',reply:'Are you stranded?',ready:false,intake:{vehicle:'2015 Honda Civic',starts:'no'}}:{ok:true,kind:'intake',reply:'Add your name and number below.',ready:true,intake:{vehicle:'2015 Honda Civic',city:'Fort Myers',starts:'no',stranded:'yes',recipient:'evil@example.invalid'}})};
  }});
  await settle();await x.say('My 2015 Honda Civic clicks and will not start.');
  const d=x.w.document;
  assert.ok(d.querySelector('.b1-lead'),'the contact card appears right after the first message');
  assert.equal(d.querySelectorAll('.b1-request-service').length,0);
  await x.say('I am stranded in Fort Myers.');
  const card=d.querySelector('.b1-lead');assert.ok(card);assert.equal(d.querySelector('.b1-send-now').hidden,true);
  assert.equal(x.requests.some(r=>r.route==='/hooks/lead/webform'),false);
  // The customer sees and can correct the urgency answers the chat inferred, and the full SMS disclosure.
  assert.equal(card.querySelector('[name=starts]').value,'no');assert.equal(card.querySelector('[name=stranded]').value,'yes');
  assert.match(card.querySelector('.b1-lead-check').textContent,/Reply STOP to opt out[\s\S]*SMS terms/);
  card.querySelector('[name=name]').value='Synthetic';card.querySelector('[name=phone]').value='239-555-0100';card.querySelector('[name=sms]').checked=true;
  card.dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  const sent=x.requests.filter(r=>r.route==='/hooks/lead/webform');assert.equal(sent.length,1);
  assert.equal(sent[0].body.smsConsentDisclosure,card.querySelector('.b1-lead-check span').firstChild.textContent.trim());
  const lead=sent[0].body;
  assert.equal(lead.source,'ai');assert.equal(lead.name,'Synthetic');assert.equal(lead.phone,'239-555-0100');
  assert.equal(lead.vehicle,'2015 Honda Civic');assert.equal(lead.city,'Fort Myers');assert.equal(lead.starts,'no');assert.equal(lead.stranded,'yes');
  assert.match(lead.details,/clicks and will not start\.[\s\S]*stranded in Fort Myers/);assert.equal(lead.recipient,undefined);
  assert.equal(lead.smsConsent,true);assert.match(lead.smsConsentDisclosure,/text messages/);assert.match(sent[0].headers['Idempotency-Key'],/^[A-Za-z0-9-]{16,}$/);
  assert.equal(d.querySelector('.b1-lead'),null);assert.equal(d.querySelector('.b1-composer').hidden,true);
  assert.match(d.querySelector('.b1-messages').textContent,/request is saved[\s\S]*marked urgent/);
  assert.ok(d.querySelector('.b1-messages a[href="tel:+12393972048"]'));
  assert.ok(x.requests.filter(r=>r.route==='/chat/message').every(r=>r.body.mode==='chat'));
});
test('a failed lead send keeps the card and details, and never claims Tony has them',async t=>{
  const x=setup(t,{handler:async(route)=>route==='/hooks/lead/webform'?{ok:false,status:503,json:async()=>({ok:false,error:'The shop could not save your request.'})}:{ok:true,status:200,json:async()=>route==='/chat/session'?{ok:true,visitor_token:'synthetic-token'}:{ok:true,kind:'intake',reply:'Thanks.',ready:true,intake:{}}}});
  await settle();await x.say('Brakes grind.');const d=x.w.document,card=d.querySelector('.b1-lead');
  card.querySelector('[name=name]').value='Synthetic';card.querySelector('[name=phone]').value='2395550100';
  card.dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.ok(d.querySelector('.b1-lead'));assert.match(card.querySelector('.b1-lead-status').textContent,/could not save[\s\S]*397-2048/);
  assert.doesNotMatch(d.querySelector('.b1-messages').textContent,/Tony has your details/);
  assert.equal(x.requests.find(r=>r.route==='/hooks/lead/webform').body.smsConsent,false);
});

test('a lost contact-card response retries the exact saved payload and key, including consent time',async t=>{
  let sent=0;
  const x=setup(t,{handler:async(route,body,w)=>{
    if(route==='/healthz')return {ok:true,status:200,json:async()=>({ok:true,chat:'ready'})};
    if(route==='/chat/session')return {ok:true,status:200,json:async()=>({ok:true,visitor_token:'synthetic-token'})};
    if(route==='/hooks/lead/webform'){
      if(++sent===1){const FirstDate=w.Date;w.Date=class extends FirstDate{constructor(...args){super(...(args.length?args:['2026-09-24T17:00:00Z']));}};throw new w.TypeError('Response lost after storage');}
      return {ok:true,status:200,json:async()=>({ok:true,received:true,id:'12345678-1234-4234-8234-123456789012',receivedAt:'2026-09-24T16:00:00.000Z'})};
    }
    return {ok:true,status:200,json:async()=>({ok:true,reply:'Your contact details?',ready:true,intake:{}})};
  }});
  await settle();await x.say('Synthetic brake inquiry');
  const card=x.w.document.querySelector('.b1-lead');
  card.querySelector('[name=name]').value='Synthetic';card.querySelector('[name=phone]').value='2395550100';card.querySelector('[name=sms]').checked=true;
  card.dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal(card.querySelector('[name=phone]').disabled,true);
  assert.match(card.textContent,/same request/);
  card.dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  const requests=x.requests.filter(r=>r.route==='/hooks/lead/webform');
  assert.equal(requests.length,2);assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);
  assert.deepEqual(requests[0].body,requests[1].body);
  assert.match(x.w.document.querySelector('.b1-messages').textContent,/request is saved/);
});
test('initial AI connection failure stays truthful and unsent notes still hand off to the normal form',async t=>{
  const x=setup(t,{handler:async(route,body,w)=>{if(route==='/healthz')return {ok:true,status:200,json:async()=>({ok:true,chat:'ready'})};throw new w.TypeError('Synthetic network outage');}}),d=x.w.document;
  await settle();d.querySelector('.b1-launcher').click();await settle();
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
  const x=setup(t,{at:'2026-09-25T01:00:00Z'}),d=x.w.document;await settle();
  assert.match(d.querySelector('.b1-messages').textContent,/overnight/);
  await x.say('<img src=x onerror="window.bad=true"> The car will not start.');
  assert.equal(x.w.bad,undefined);assert.equal(d.querySelector('.b1-user img'),null);
  d.querySelector('.b1-contact').click();assert.match(d.getElementById('request-details').value,/<img src=x/);
  assert.equal(d.querySelector('.b1-estimate'),null);
});

test('long conversation preserves all customer words and blocks sending until the customer shortens it',async t=>{
  const x=setup(t),d=x.w.document;await settle();
  const words=['First vehicle information '+ 'a'.repeat(1500),'Second symptom detail '+ 'b'.repeat(1500),'Third location detail '+ 'c'.repeat(1500)];
  for(const text of words)await x.say(text);
  d.querySelector('.b1-contact').click();
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

test('mobile bar retains call and text actions, adds Bay One in the mocked preview, and restores focus to the actual entry',async t=>{
  const x=setup(t),d=x.w.document;await settle();const bar=d.querySelector('.mobile-contact-bar'),entry=bar.querySelector('.b1-bar-launcher');
  assert.equal(bar.children.length,3);assert.equal(bar.children[0].getAttribute('href'),'tel:+12393972048');assert.equal(bar.children[1].getAttribute('href'),'sms:+12393972048');
  assert.equal(entry.textContent,'Ask Bay One');assert.ok(d.getElementById('bay-one-widget').classList.contains('b1-has-contact-bar'));
  entry.click();await settle();assert.equal(d.getElementById('b1-panel').hidden,false);assert.equal(entry.getAttribute('aria-expanded'),'true');
  d.querySelector('.b1-close').click();assert.equal(d.getElementById('b1-panel').hidden,true);assert.equal(d.activeElement,entry);assert.equal(entry.getAttribute('aria-expanded'),'false');
  const inline=d.getElementById('request-bay-one');inline.click();await settle();d.querySelector('.b1-close').click();assert.equal(d.activeElement,inline);
  assert.ok(d.querySelector('.b1-launcher'));
});

test('an unreachable Bay One server shows no launcher, loads no assets and still restores carried notes',async t=>{
  const draft=JSON.stringify({at:Date.parse('2026-09-24T15:55:00Z'),summary:'Customer notes from Bay One:\nGrinding when braking',service:'',intake:{city:'Fort Myers'}});
  const x=setup(t,{handler:async(route,body,w)=>{if(route!=='/healthz')w.bad=true;throw new w.TypeError('Synthetic outage');},beforeScripts:w=>w.sessionStorage.setItem('pt-bayone-service-draft-v1',draft)}),d=x.w.document;
  await settle();
  assert.ok(x.requests.every(r=>r.route==='/healthz'));assert.equal(x.w.bad,undefined);
  assert.equal(d.getElementById('bay-one-widget'),null);assert.equal(d.querySelector('link[href*="bay-one-widget.css"]'),null);
  assert.equal(d.querySelector('.b1-bar-launcher'),null);assert.equal(d.getElementById('request-bay-one').hidden,true);
  assert.match(d.getElementById('request-details').value,/Grinding when braking/);assert.equal(d.getElementById('request-city').value,'Fort Myers');
});

test('a server whose chat failed to start is treated as unavailable',async t=>{
  const x=setup(t,{handler:async route=>({ok:true,status:200,json:async()=>route==='/healthz'?{ok:true,chat:'unavailable'}:{ok:true}})}),d=x.w.document;
  await settle();assert.equal(d.getElementById('bay-one-widget'),null);assert.ok(x.requests.every(r=>r.route==='/healthz'));
});

test('shipped config enables public Bay One against the p15g2 receiver',()=>{
  const dom=new JSDOM('',{runScripts:'outside-only'});dom.window.eval(fs.readFileSync(new URL('bay-one-config.js',root),'utf8'));
  assert.equal(dom.window.PT_BAYONE_CONFIG.enabled,true);assert.equal(dom.window.PT_BAYONE_CONFIG.endpoint,'https://p15g2.tail68bd87.ts.net:10000');dom.window.close();
});

test('public Bay One is disabled before UI/assets/network while normal contact remains available',async t=>{
  const x=setup(t,{enabled:false,publicContact:true,url:'https://fixingfortmyers.com/',handler:async()=>{throw new TypeError('offline');}}),d=x.w.document;
  await settle();x.requests.length=0;
  assert.equal(x.w.PT_BAYONE_CONFIG.enabled,false);assert.equal(d.getElementById('bay-one-widget'),null);
  assert.equal(d.querySelector('link[href*="bay-one-widget.css"]'),null);assert.equal(d.querySelector('.b1-bar-launcher'),null);
  assert.equal(d.getElementById('request-bay-one').hidden,true);assert.equal(d.querySelector('.mobile-contact-bar').children.length,2);
  assert.equal(x.requests.length,0);assert.equal(d.getElementById('request-submit').disabled,false);assert.ok(d.querySelector('a[href="tel:+12393972048"]'));
  delete x.w.PT_BAYONE_CONFIG;x.w.eval(widget);assert.equal(d.getElementById('bay-one-widget'),null);assert.equal(x.requests.length,0);
});

test('with the shop receiver offline, the public form falls back to an editable native text intent with no receipt claim',async t=>{
  const x=setup(t,{enabled:false,publicContact:true,url:'https://fixingfortmyers.com/',handler:async()=>{throw new TypeError('offline');}}),d=x.w.document;
  await settle();
  assert.equal(x.w.PT_CONTACT_CONFIG.endpoint,'https://p15g2.tail68bd87.ts.net:10000');assert.ok(x.requests.some(r=>r.route==='/healthz'));x.requests.length=0;
  assert.equal(d.getElementById('request-submit').textContent,'Prepare text to Tony');assert.equal(d.querySelector('.request-voice').hidden,true);
  assert.equal(d.getElementById('request-phone').required,false);
  assert.equal(d.querySelector('.request-consent').hidden,true);assert.equal(d.getElementById('request-direct-consent').hidden,false);
  x.enter('request-name','Synthetic Customer');x.enter('request-details','Synthetic vehicle will not start.');x.enter('request-city','33901');x.enter('request-starts','no');x.enter('request-stranded','yes');
  d.getElementById('bookingForm').dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal(x.requests.length,0);assert.equal(d.getElementById('request-backup').hidden,false);assert.equal(d.getElementById('request-preview').readOnly,false);
  const link=d.getElementById('request-text');assert.ok(link.getAttribute('href').startsWith('sms:+12393972048?body='));
  assert.match(decodeURIComponent(link.getAttribute('href').split('?body=')[1]),/Synthetic vehicle will not start\./);
  assert.match(d.getElementById('request-preview').value,/Callback: Please reply to this text/);
  assert.doesNotMatch(d.getElementById('request-preview').value,/No; please call/);
  assert.match(d.getElementById('request-preview').value,/Please reply about this repair inquiry\.\nWebsite page context: \/$/);
  assert.match(d.getElementById('request-status').textContent,/Nothing has been sent yet/);assert.equal(x.w.sessionStorage.getItem('pt-last-request'),null);
  x.enter('request-preview','Customer edited message for Tony.');assert.equal(decodeURIComponent(link.getAttribute('href').split('?body=')[1]),'Customer edited message for Tony.');
  assert.equal(x.w.location.href,'https://fixingfortmyers.com/');assert.equal(x.requests.length,0);
});

test('iPhone text draft uses the Apple body separator and keeps edited customer words with a fixed recipient',async t=>{
  const x=setup(t,{enabled:false,publicContact:true,handler:async()=>{throw new TypeError('offline');},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'}),d=x.w.document;
  await settle();x.requests.length=0;
  const message='Edited symptoms & location? Please reply.\nNo diagnosis requested.';
  x.enter('request-preview',message);
  const url=d.getElementById('request-text').getAttribute('href');
  assert.equal(url,`sms:+12393972048&body=${encodeURIComponent(message)}`);
  assert.ok(d.getElementById('request-email').getAttribute('href').includes(encodeURIComponent(message)));
  assert.equal(x.requests.length,0);
});

test('draft source carries only known page categories, never URL or session-injected personal data',async t=>{
  const cases=[
    {url:'https://preview.invalid/repair-guide-car-overheating?name=PrivatePerson&phone=2395550199',source:'repair-guide-car-overheating'},
    {url:'https://preview.invalid/?service=cooling&name=PrivatePerson',savedSource:'repair-guide-car-overheating',source:'repair-guide-car-overheating'},
    {url:'https://preview.invalid/',savedSource:'PrivatePerson?phone=2395550199',source:''},
    {url:'https://preview.invalid/PrivatePerson',source:''}
  ];
  for(const input of cases){
    const x=setup(t,{...input,enabled:false,publicContact:true,handler:async()=>{throw new TypeError('offline');}}),d=x.w.document;
    await settle();x.requests.length=0;
    x.enter('request-name','Synthetic Customer');x.enter('request-details','Synthetic symptoms');
    d.getElementById('bookingForm').dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));
    const draft=d.getElementById('request-preview').value;
    assert.ok(draft.endsWith('Website page context: /'+input.source+(input.source?' (last guide or service viewed)':'')));
    assert.doesNotMatch(draft,/PrivatePerson|2395550199/);assert.equal(x.requests.length,0);
    if(input.url.includes('service=cooling'))assert.equal(d.getElementById('request-service').value,'Engine / transmission');
    assert.ok(d.getElementById('request-text').getAttribute('href').startsWith('sms:+12393972048?body='));
  }
});
test('the site form and Bay One store the exact SMS consent wording shown beside the site checkbox',t=>{
  const shown=new JSDOM(page).window.document.querySelector('.request-consent span').firstChild.textContent.trim();
  assert.match(shown,/Reply STOP to opt out or HELP for help\.$/);
  assert.ok(site.includes(`'${shown}'`),'site.js consentDisclosure matches index.html');
  assert.ok(widget.includes(`'${shown}'`),'bay-one-widget.js CONSENT matches index.html');
});
test('Bay One card sends photos and video to Tony after the request is saved, only when the receiver supports it',async t=>{
  const id='12345678-1234-4234-8234-123456789012';
  const x=setup(t,{handler:async(route,body)=>{
    if(route==='/healthz')return {ok:true,status:200,json:async()=>({ok:true,chat:'ready',media:'ready'})};
    if(route==='/chat/session')return {ok:true,status:200,json:async()=>({ok:true,visitor_token:'synthetic-token'})};
    if(route==='/hooks/lead/webform')return {ok:true,status:201,json:async()=>({ok:true,received:true,id,receivedAt:'2026-09-24T16:00:00.000Z',mediaToken:'synthetic-media-token-000000000000'})};
    if(route.startsWith('/hooks/lead/media/'))return body.name==='bad.mov'?{ok:false,status:415,json:async()=>({ok:false,error:'no'})}:{ok:true,status:201,json:async()=>({ok:true,received:true,index:1,count:1})};
    return {ok:true,status:200,json:async()=>({ok:true,kind:'intake',reply:'Add your name and number below.',ready:true,intake:{vehicle:'2015 Honda Civic'}})};
  }});
  await settle();await x.say('Oil leak under the engine.');
  const d=x.w.document,card=d.querySelector('.b1-lead'),picker=card.querySelector('[name=media]');
  assert.equal(picker.closest('label').hidden,false);assert.equal(picker.accept,'image/*,video/*');assert.equal(picker.multiple,true);
  const files=[new x.w.File([new Uint8Array([255,216,255,224,1,2,3])],'leak.jpg',{type:'image/jpeg'}),new x.w.File([new Uint8Array(20)],'IMG_0001.HEIC',{type:''}),new x.w.File([new Uint8Array(20)],'bad.mov',{type:'video/quicktime'}),new x.w.File(['x'],'notes.pdf',{type:'application/pdf'})];
  Object.defineProperty(picker,'files',{value:files,configurable:true});picker.dispatchEvent(new x.w.Event('change'));
  assert.match(card.querySelector('.b1-lead-status').textContent,/3 files will go to Tony[\s\S]*Not added: notes\.pdf/);
  card.querySelector('[name=name]').value='Synthetic';card.querySelector('[name=phone]').value='239-555-0100';
  card.dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));await settle();await settle();
  const uploads=x.requests.filter(r=>r.route===`/hooks/lead/media/${id}`);
  assert.deepEqual(uploads.map(r=>[r.headers['Content-Type'],r.headers['X-Media-Token'],r.body.name]),[['image/jpeg','synthetic-media-token-000000000000','leak.jpg'],['image/heic','synthetic-media-token-000000000000','IMG_0001.HEIC'],['video/quicktime','synthetic-media-token-000000000000','bad.mov']]);
  assert.ok(x.requests.findIndex(r=>r.route==='/hooks/lead/webform')<x.requests.findIndex(r=>r.route.startsWith('/hooks/lead/media/')),'the lead is saved before any upload');
  assert.match(d.querySelector('.b1-messages').textContent,/Tony has your 2 files\. 1 did not go through \(bad\.mov\)\. You can text it to Tony at \(239\) 397-2048\./);
});
test('without receiver support the photo picker stays hidden and nothing is uploaded',async t=>{
  const x=setup(t,{handler:async(route)=>route==='/healthz'?{ok:true,status:200,json:async()=>({ok:true,chat:'ready'})}:{ok:true,status:200,json:async()=>route==='/chat/session'?{ok:true,visitor_token:'synthetic-token'}:{ok:true,kind:'intake',reply:'Thanks.',ready:true,intake:{}}}});
  await settle();await x.say('Brakes grind.');
  assert.equal(x.w.document.querySelector('.b1-lead [name=media]').closest('label').hidden,true);
});
