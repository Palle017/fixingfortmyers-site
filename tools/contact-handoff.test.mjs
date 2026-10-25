// DOM-only contract tests. All HTTP is mocked; no provider or live lead is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const root=new URL('../',import.meta.url);
const page=fs.readFileSync(new URL('index.html',root),'utf8');
const site=fs.readFileSync(new URL('site.js',root),'utf8');
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
function setup(t,{url='https://preview.invalid/',handler,at='2026-09-24T16:00:00Z',publicContact=false,userAgent,savedSource,beforeScripts,pageFile}={}){
  const dom=new JSDOM(pageFile?fs.readFileSync(new URL(pageFile,root),'utf8'):page,{url,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,requests=[];
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
