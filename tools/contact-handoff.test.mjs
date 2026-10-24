// DOM-only contract tests. All HTTP is mocked; no provider or live lead is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const root=new URL('../',import.meta.url);
const page=fs.readFileSync(new URL('index.html',root),'utf8');
const site=fs.readFileSync(new URL('site.js',root),'utf8');
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
function mockRecorder(w) {
  Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})},configurable:true});
  w.URL.createObjectURL=()=> 'blob:synthetic-recording';w.URL.revokeObjectURL=()=>{};
  w.MediaRecorder=class extends w.EventTarget {
    static isTypeSupported(){return true;}
    constructor(_stream,options){super();this.mimeType=options.mimeType;this.state='inactive';}
    start(){this.state='recording';}
    stop(){this.state='inactive';const event=new w.Event('dataavailable');event.data=new w.Blob([new Uint8Array([0x1a,0x45,0xdf,0xa3])],{type:this.mimeType});this.dispatchEvent(event);this.dispatchEvent(new w.Event('stop'));}
  };
}
function setup(t,{url='https://preview.invalid/',handler,at='2026-09-24T16:00:00Z',publicContact=false,userAgent,savedSource,beforeScripts}={}){
  const dom=new JSDOM(page,{url,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,requests=[];
  t.after(()=>w.close());
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  w.HTMLElement.prototype.scrollIntoView=function(){};
  if(userAgent)Object.defineProperty(w.navigator,'userAgent',{value:userAgent,configurable:true});
  if(publicContact)w.eval(fs.readFileSync(new URL('contact-config.js',root),'utf8'));else w.PT_CONTACT_CONFIG={endpoint:'https://receiver.invalid'};
  const NativeDate=w.Date;w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[at]));}static now(){return NativeDate.parse(at);}};
  w.fetch=async(url,options={})=>{const route=new URL(url).pathname,body=typeof options.body==='string'||options.body===undefined?JSON.parse(options.body||'{}'):options.body;if(route.startsWith('/hooks/analytics/'))return {ok:true,status:200,json:async()=>({ok:true})};requests.push({url:String(url),route,body,headers:options.headers});return handler?handler(route,body,w):{ok:true,status:200,json:async()=>route==='/chat/session'?{ok:true,visitor_token:'synthetic-token'}:{ok:true,kind:'intake',reply:'Where is your vehicle?',intake:{}}};};
  if(savedSource)w.sessionStorage.setItem('pt-repair-source',savedSource);
  beforeScripts?.(w);
  w.eval(site);
  const enter=(id,value)=>{const field=w.document.getElementById(id);field.value=value;field.dispatchEvent(new w.Event('input',{bubbles:true}));};
  return {w,requests,enter};
}

test('published contact configuration sends a repair to cloud intake and keeps previews off production',async t=>{
  const cloud='https://perfect-timing-cloud-intake.prudhvi-pallempati.chatgpt.site';
  for(const url of ['https://fixingfortmyers.com/','https://www.fixingfortmyers.com/']){
    const x=setup(t,{url,publicContact:true,handler:async route=>({ok:true,status:route==='/healthz'?200:201,json:async()=>route==='/healthz'?{ok:true,storage:'cloud',media:'ready'}:{ok:true,received:true,id:'12345678-1234-4234-8234-123456789012'}})}),d=x.w.document;
    await settle();
    x.enter('request-name','Synthetic Customer');x.enter('request-phone','2395550100');x.enter('request-details','Synthetic concern.');x.enter('request-city','Fort Myers');
    x.enter('request-location-choice','dropoff');d.getElementById('request-location-choice').dispatchEvent(new x.w.Event('change'));
    d.getElementById('bookingForm').dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
    const sent=x.requests.filter(r=>r.route==='/hooks/lead/webform');assert.equal(sent.length,1);assert.equal(sent[0].url,cloud+'/hooks/lead/webform');
    assert.deepEqual(sent[0].body.carLocation,{type:'dropoff',preferredTime:''});assert.match(d.getElementById('request-status').textContent,/received/i);
  }
  for(const url of ['http://127.0.0.1/','http://localhost/','https://preview.invalid/']){
    const x=setup(t,{url,publicContact:true});await settle();assert.equal(x.w.PT_CONTACT_CONFIG.endpoint,'');assert.equal(x.requests.length,0);
  }
});

test('voice send needs an address only when the car is at one, and serializes it as multipart JSON',async t=>{
  const x=setup(t,{handler:async route=>({ok:true,status:route==='/healthz'?200:201,json:async()=>route==='/healthz'?{ok:true,media:'ready'}:{ok:true,received:true,id:'12345678-1234-4234-8234-123456789012'}}),beforeScripts:w=>{
    mockRecorder(w);
  }});
  const d=x.w.document;await settle();
  x.enter('request-name','Synthetic Voice Customer');x.enter('request-phone','2395550100');x.enter('request-vehicle','Synthetic car');
  d.getElementById('voice-start').click();await settle();d.getElementById('voice-stop').click();
  x.enter('request-city',' Fort Myers ');
  x.enter('request-location-choice','location');d.getElementById('request-location-choice').dispatchEvent(new x.w.Event('change'));
  x.enter('request-car-address','   ');d.getElementById('voice-send').click();await settle();assert.equal(x.requests.filter(r=>r.route==='/hooks/lead/voicenote').length,0);
  x.enter('request-car-address','123 Example St, Fort Myers');d.getElementById('voice-send').click();await settle();
  const sent=x.requests.filter(r=>r.route==='/hooks/lead/voicenote');assert.equal(sent.length,1);
  assert.equal(sent[0].body.get('city'),'Fort Myers');
  assert.ok(sent[0].body instanceof x.w.FormData);assert.ok(sent[0].body.get('audio').size>0);
  assert.deepEqual(JSON.parse(sent[0].body.get('carLocation')),{type:'address',address:'123 Example St, Fort Myers'});
  assert.equal(sent[0].body.get('source'),'voice');assert.match(sent[0].body.get('details'),/^$/);
  assert.match(d.getElementById('voice-status').textContent,/Recording received/);
});

test('unchanged voice retries preserve the snapshot, but removing a sender pin creates a pin-free update',async t=>{
  const x=setup(t,{handler:async route=>({ok:route==='/healthz',status:route==='/healthz'?200:503,json:async()=>route==='/healthz'?{ok:true}:{ok:false}}),beforeScripts:w=>{
    mockRecorder(w);
    Object.defineProperty(w.navigator,'geolocation',{value:{getCurrentPosition(ok){ok({coords:{latitude:26.6406,longitude:-81.8723,accuracy:18},timestamp:w.Date.now()});}},configurable:true});
  }});
  const d=x.w.document;await settle();
  x.enter('request-name','Synthetic Voice Customer');x.enter('request-phone','2395550100');x.enter('request-vehicle','Synthetic car');x.enter('request-city','Fort Myers');
  x.enter('request-location-choice','dropoff');d.getElementById('request-location-choice').dispatchEvent(new x.w.Event('change'));
  d.getElementById('request-use-my-location').click();d.getElementById('request-sms-consent').checked=true;
  d.getElementById('voice-start').click();await settle();d.getElementById('voice-stop').click();
  d.getElementById('voice-send').click();await settle();d.getElementById('voice-send').click();await settle();
  const sent=()=>x.requests.filter(r=>r.route==='/hooks/lead/voicenote'),first=sent()[0],retry=sent()[1];
  assert.equal(first.body.get('latitude'),'26.6406');assert.equal(retry.headers['Idempotency-Key'],first.headers['Idempotency-Key']);
  for(const [key,value] of first.body) if(key!=='audio')assert.equal(retry.body.get(key),value);
  d.getElementById('request-remove-my-location').click();d.getElementById('voice-send').click();await settle();
  const changed=sent()[2];assert.ok(changed);assert.notEqual(changed.headers['Idempotency-Key'],first.headers['Idempotency-Key']);
  for(const key of ['latitude','longitude','mapsLink','senderAccuracyMeters','senderCapturedAt'])assert.equal(changed.body.get(key),null);
  assert.equal(changed.body.get('city'),'Fort Myers');
});

test('service preselection is whitelisted, optional vehicle submits with explicit qualifiers, and uncertain retry is stable',async t=>{
  const x=setup(t,{url:'https://preview.invalid/?service=ac#contact',handler:async()=>({ok:false,status:503,json:async()=>({ok:false})})}),d=x.w.document;
  assert.equal(d.getElementById('request-service').value,'A/C repair');
  assert.equal(d.getElementById('request-phone').required,true);
  assert.equal(d.querySelector('.request-consent').hidden,false);assert.equal(d.getElementById('request-direct-consent').hidden,true);
  x.enter('request-name','Synthetic Customer');x.enter('request-phone','2395550100');x.enter('request-details','Only warm air at idle.');x.enter('request-city','33901');x.enter('request-starts','no');x.enter('request-stranded','yes');
  const consent=d.getElementById('request-sms-consent');consent.checked=true;consent.dispatchEvent(new x.w.Event('input',{bubbles:true}));
  x.enter('request-location-choice','dropoff');d.getElementById('request-location-choice').dispatchEvent(new x.w.Event('change'));
  const form=d.getElementById('bookingForm');
  form.dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));await settle();form.dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  const sent=x.requests.filter(r=>r.route==='/hooks/lead/webform');assert.equal(sent.length,2);
  assert.equal(sent[0].headers['Idempotency-Key'],sent[1].headers['Idempotency-Key']);assert.deepEqual(sent[0].body,sent[1].body);
  assert.equal(sent[0].body.starts,'no');assert.equal(sent[0].body.stranded,'yes');assert.equal(sent[0].body.city,'33901');assert.equal(sent[0].body.smsConsent,true);
  assert.match(sent[0].body.details,/City \/ ZIP: 33901/);assert.match(sent[0].body.details,/Does it drive: no/);assert.ok(sent[0].body.vehicle);
  assert.equal(form.method,'post');assert.match(d.getElementById('request-status').textContent,/could not confirm receipt/);
  const rejected=setup(t,{url:'https://preview.invalid/?service=%3Cscript%3Ebad%3C%2Fscript%3E'});assert.equal(rejected.w.document.getElementById('request-service').selectedIndex,0);
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

test('mobile bar keeps only the call and request actions, call first',async t=>{
  const x=setup(t),d=x.w.document;await settle();const bar=d.querySelector('.mobile-contact-bar');
  assert.equal(bar.children.length,2);assert.equal(bar.children[0].getAttribute('href'),'tel:+12393972048');assert.equal(bar.children[1].getAttribute('href'),'#contact');
  assert.deepEqual([...bar.children].map(node=>node.textContent),['Call the shop','Request a repair']);
});

test('careers preserves the applicant-specific mobile introduction action',t=>{
  const html=fs.readFileSync(new URL('careers.html',root),'utf8');
  const dom=new JSDOM(html,{url:'https://preview.invalid/careers',runScripts:'outside-only'}),w=dom.window;
  t.after(()=>w.close());w.eval(site);
  const actions=[...w.document.querySelectorAll('.mobile-contact-bar a')];
  assert.deepEqual(actions.map(link=>[link.textContent,link.getAttribute('href')]),[['Call the shop','tel:+12393972048'],['Introduce yourself','#apply']]);
  assert.ok(w.document.querySelector('#apply #careers-form'));
});

test('the Bay One chat is removed: no page loads it or mentions it, and normal contact remains available',async t=>{
  const x=setup(t,{publicContact:true,url:'https://fixingfortmyers.com/',handler:async()=>{throw new TypeError('offline');}}),d=x.w.document;
  await settle();x.requests.length=0;
  assert.equal(d.getElementById('bay-one-widget'),null);assert.equal(d.getElementById('request-bay-one'),null);assert.equal(d.querySelector('[class^="b1-"],[class*=" b1-"]'),null);
  assert.equal(d.querySelector('.mobile-contact-bar').children.length,2);
  assert.equal(x.requests.length,0);assert.equal(d.getElementById('request-submit').disabled,false);assert.ok(d.querySelector('a[href="tel:+12393972048"]'));
  for(const file of ['bay-one-widget.js','bay-one-config.js','bay-one-widget.css'])assert.equal(fs.existsSync(new URL(file,root)),false,file+' should not be published');
  for(const file of fs.readdirSync(root).filter(name=>name.endsWith('.html'))){
    const html=fs.readFileSync(new URL(file,root),'utf8');
    assert.doesNotMatch(html,/bay-one-(?:widget|config)/,file+': loads the removed Bay One chat');
    assert.doesNotMatch(html,/Bay One/i,file+': mentions the removed Bay One chat');
  }
});

test('with cloud intake offline, the public form falls back to an editable native text intent with no receipt claim',async t=>{
  const x=setup(t,{publicContact:true,url:'https://fixingfortmyers.com/',handler:async()=>{throw new TypeError('offline');}}),d=x.w.document;
  await settle();
  assert.equal(x.w.PT_CONTACT_CONFIG.endpoint,'https://perfect-timing-cloud-intake.prudhvi-pallempati.chatgpt.site');assert.ok(x.requests.some(r=>r.route==='/healthz'));x.requests.length=0;
  assert.equal(d.getElementById('request-submit').textContent,'Prepare text to the shop');assert.equal(d.querySelector('.request-voice').hidden,true);
  assert.equal(d.getElementById('request-phone').required,false);
  assert.equal(d.querySelector('.request-consent').hidden,true);assert.equal(d.getElementById('request-direct-consent').hidden,false);
  x.enter('request-name','Synthetic Customer');x.enter('request-details','Synthetic vehicle will not start.');x.enter('request-city','33901');x.enter('request-starts','no');x.enter('request-stranded','yes');
  x.enter('request-location-choice','dropoff');d.getElementById('request-location-choice').dispatchEvent(new x.w.Event('change'));
  d.getElementById('bookingForm').dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal(x.requests.length,0);assert.equal(d.getElementById('request-backup').hidden,false);assert.equal(d.getElementById('request-preview').readOnly,false);
  const link=d.getElementById('request-text');assert.ok(link.getAttribute('href').startsWith('sms:+12393972048?&body='));
  assert.match(decodeURIComponent(link.getAttribute('href').slice('sms:+12393972048?&body='.length)),/Synthetic vehicle will not start\./);
  assert.match(d.getElementById('request-preview').value,/Callback: Please reply to this text/);
  assert.doesNotMatch(d.getElementById('request-preview').value,/No; please call/);
  assert.match(d.getElementById('request-preview').value,/Please reply about this repair inquiry\.\nWebsite page context: \/$/);
  assert.match(d.getElementById('request-status').textContent,/Nothing has been sent yet/);assert.equal(x.w.sessionStorage.getItem('pt-last-request'),null);
  x.enter('request-preview','Customer edited message for Tony.');assert.equal(decodeURIComponent(link.getAttribute('href').slice('sms:+12393972048?&body='.length)),'Customer edited message for Tony.');
  assert.equal(x.w.location.href,'https://fixingfortmyers.com/');assert.equal(x.requests.length,0);
});

test('iPhone text draft uses the shared ?&body= separator and keeps edited customer words with a fixed recipient',async t=>{
  const x=setup(t,{publicContact:true,handler:async()=>{throw new TypeError('offline');},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'}),d=x.w.document;
  await settle();x.requests.length=0;
  const message='Edited symptoms & location? Please reply.\nNo diagnosis requested.';
  x.enter('request-preview',message);
  const url=d.getElementById('request-text').getAttribute('href');
  assert.equal(url,`sms:+12393972048?&body=${encodeURIComponent(message)}`);
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
    const x=setup(t,{...input,publicContact:true,handler:async()=>{throw new TypeError('offline');}}),d=x.w.document;
    await settle();x.requests.length=0;
    x.enter('request-name','Synthetic Customer');x.enter('request-details','Synthetic symptoms');x.enter('request-city','Fort Myers');
    x.enter('request-location-choice','dropoff');d.getElementById('request-location-choice').dispatchEvent(new x.w.Event('change'));
    d.getElementById('bookingForm').dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));
    const draft=d.getElementById('request-preview').value;
    assert.ok(draft.endsWith('Website page context: /'+input.source+(input.source?' (last guide or service viewed)':'')));
    assert.doesNotMatch(draft,/PrivatePerson|2395550199/);assert.equal(x.requests.length,0);
    if(input.url.includes('service=cooling'))assert.equal(d.getElementById('request-service').value,'Engine');
    assert.ok(d.getElementById('request-text').getAttribute('href').startsWith('sms:+12393972048?&body='));
  }
});
test('the site form stores the exact SMS consent wording shown beside the site checkbox',t=>{
  const shown=new JSDOM(page).window.document.querySelector('.request-consent span').firstChild.textContent.trim();
  assert.match(shown,/Reply STOP to opt out or HELP for help\.$/);
  assert.ok(site.includes(`'${shown}'`),'site.js consentDisclosure matches index.html');
});
