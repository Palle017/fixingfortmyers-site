import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM, VirtualConsole} from 'jsdom';

const html = fs.readFileSync('parts.html', 'utf8');
const script = fs.readFileSync('parts-request.js', 'utf8');
const reference = '12345678-1234-4234-8234-123456789012';
const confirmed = () => ({ok:true,json:async()=>({ok:true,received:true,id:reference})});
const settle = async () => { for (let i=0; i<4; i++) await new Promise(setImmediate); };
function setup(t, {handler, endpoint='https://receiver.invalid', beforeScripts} = {}) {
  const v = new VirtualConsole(), errors = [];
  v.on('jsdomError', e => { if (!/Not implemented: navigation/.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(html, {url:'https://preview.invalid/parts',runScripts:'outside-only',virtualConsole:v});
  const w = dom.window, d = w.document, requests = [];
  t.after(() => { w.close(); assert.deepEqual(errors, []); });
  w.PT_CONTACT_CONFIG = {endpoint};
  w.fetch = async (url, options) => {
    assert.equal(url, endpoint + '/hooks/lead/webform');
    assert.equal(options.credentials, 'omit');
    const request = {body:JSON.parse(options.body),key:options.headers['Idempotency-Key']};
    requests.push(request);
    return handler ? handler(request) : {ok:false,json:async()=>({ok:false})};
  };
  beforeScripts?.(w);
  w.eval(script);
  const enter = (id, value) => { const el = d.getElementById('parts-' + id); el.value=value; el.dispatchEvent(new w.Event('input', {bubbles:true})); };
  const fill = () => { for (const [id,value] of [['name','Synthetic Customer'],['phone','2395550100'],['vehicle','2018 Example sedan'],['description','Front brake pads']]) enter(id,value); };
  const send = () => d.getElementById('partsForm').dispatchEvent(new w.Event('submit', {bubbles:true,cancelable:true}));
  return {w,d,requests,enter,fill,send};
}

test('parts confirms saved quote only after a receipt and keeps customer details out of receipt storage', async t => {
  const x=setup(t,{handler:confirmed}); x.fill(); x.enter('vin','1HGCM82633A004352'); x.enter('fulfillment','installation'); x.send(); await settle();
  const body=x.requests[0].body;
  assert.equal(body.requestType,'parts'); assert.equal(body.parts.quantity,1); assert.equal(body.parts.fulfillment,'installation');
  assert.equal(body.smsConsent,false); assert.equal(body.locationContract,undefined); assert.equal(body.carLocation,undefined);
  const receipt=JSON.parse(x.w.sessionStorage.getItem('pt-last-request'));
  assert.deepEqual(Object.keys(receipt).sort(),['confirmed','id','receivedAt','requestType','smsConsent'].sort());
  assert.equal(receipt.requestType,'parts'); assert.equal(receipt.id,reference);
  assert.equal(x.d.getElementById('parts-backup'),null);
  assert.match(x.d.getElementById('parts-status').textContent,/No order is confirmed/);
  x.send(); await settle(); assert.equal(x.requests.length,1);
});

test('parts uncertain retries preserve one key and edits create a new request', async t => {
  const x=setup(t); x.fill(); x.send(); await settle(); x.send(); await settle();
  assert.equal(x.requests[0].key,x.requests[1].key);
  assert.equal(x.w.sessionStorage.getItem('pt-last-request'),null);
  assert.match(x.d.getElementById('parts-status').textContent,/could not confirm receipt/);
  assert.equal(x.d.getElementById('parts-submit').textContent,'Retry Parts Quote Request');
  x.enter('quantity','2'); x.send(); await settle();
  assert.notEqual(x.requests[2].key,x.requests[0].key);
  assert.equal(x.requests[2].body.parts.quantity,2);
  assert.equal(x.d.getElementById('parts-quantity').value,'2');
  assert.equal(x.d.getElementById('parts-text'),null);
});

test('parts rejects incomplete or malformed acknowledgments instead of claiming receipt', async t => {
  for (const body of [{ok:true,id:reference},{ok:true,received:true,id:'not-a-reference'},null]) {
    const x=setup(t,{handler:()=>({ok:true,json:async()=>body})}); x.fill(); x.send(); await settle();
    assert.equal(x.w.sessionStorage.getItem('pt-last-request'),null);
    assert.match(x.d.getElementById('parts-status').textContent,/could not confirm receipt/);
  }
});

test('parts blocks whitespace-only required fields, invalid phone, quantity and VIN', async t => {
  const x=setup(t); x.fill();
  for (const [id,bad,good] of [['vehicle','   ','2018 Example sedan'],['name','   ','Synthetic Customer'],['description','   ','Front brake pads'],['phone','123','2395550100'],['quantity','0','1'],['quantity','1.5','1'],['vin','INVALID-VIN','']]) {
    x.enter(id,bad); x.send(); await settle(); assert.equal(x.requests.length,0,id);
    x.enter(id,good);
  }
});

test('parts missing endpoint retains every field and offers retry without drafts or email app navigation', async t => {
  const x=setup(t,{endpoint:''});x.fill();
  const optional={quantity:'2',vin:'1HGCM82633A004352',number:'SYNTHETIC-PART',fulfillment:'installation',email:'synthetic@example.invalid',notes:'Call in the afternoon.'};
  for(const [id,value] of Object.entries(optional))x.enter(id,value);
  x.send();await settle();
  assert.equal(x.requests.length,0);assert.equal(x.w.sessionStorage.getItem('pt-last-request'),null);
  assert.match(x.d.getElementById('parts-status').textContent,/temporarily unavailable/);
  assert.equal(x.d.getElementById('parts-submit').textContent,'Retry Parts Quote Request');
  assert.equal(x.d.getElementById('parts-submit').disabled,false);
  for(const [id,value] of Object.entries(optional))assert.equal(x.d.getElementById('parts-'+id).value,value);
  for(const id of ['backup','preview','text','email-draft'])assert.equal(x.d.getElementById('parts-'+id),null);
  assert.equal(x.w.location.href,'https://preview.invalid/parts');
  assert.ok(x.d.querySelector('#partsForm a[href="tel:+12393972048"]'));
  x.enter('quantity','3');assert.equal(x.d.getElementById('parts-status').textContent,'');
  x.send();await settle();assert.equal(x.d.getElementById('parts-quantity').value,'3');
  assert.equal(x.requests.length,0);
});

test('parts keeps a confirmed inline receipt when session storage is unavailable', async t => {
  const x=setup(t,{handler:confirmed,beforeScripts:w=>Object.defineProperty(w,'sessionStorage',{value:{setItem(){throw Error('blocked');}}})});
  x.fill(); x.send(); await settle(); x.send(); await settle();
  assert.equal(x.requests.length,1); assert.match(x.d.getElementById('parts-status').textContent,new RegExp(reference));
  assert.equal(x.d.getElementById('parts-backup'),null);
});

test('parts network failures retain entered values and unchanged retries send the identical request', async t => {
  const x=setup(t,{handler:()=>{throw Error('Synthetic unavailable receiver');}});x.fill();
  x.enter('email','synthetic@example.invalid');x.enter('notes','Call in the afternoon.');x.send();await settle();
  assert.equal(x.d.getElementById('parts-name').value,'Synthetic Customer');
  assert.equal(x.d.getElementById('parts-phone').value,'2395550100');
  assert.equal(x.d.getElementById('parts-vehicle').value,'2018 Example sedan');
  assert.equal(x.d.getElementById('parts-description').value,'Front brake pads');
  assert.equal(x.d.getElementById('parts-email').value,'synthetic@example.invalid');
  assert.equal(x.d.getElementById('parts-notes').value,'Call in the afternoon.');
  assert.equal(x.d.getElementById('parts-submit').disabled,false);
  assert.equal(x.d.getElementById('partsForm').hasAttribute('aria-busy'),false);
  assert.equal(x.w.location.href,'https://preview.invalid/parts');
  x.send();await settle();assert.deepEqual(x.requests[0],x.requests[1]);
  assert.equal(x.w.sessionStorage.getItem('pt-last-request'),null);
});

test('parts receipt explains quote approval without confirming an order or appointment', t => {
  const dom=new JSDOM(fs.readFileSync('request-received.html','utf8'),{url:'https://preview.invalid/request-received',runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  dom.window.sessionStorage.setItem('pt-last-request',JSON.stringify({id:reference,receivedAt:new Date().toISOString(),confirmed:true,requestType:'parts',smsConsent:false}));
  for (const script of dom.window.document.querySelectorAll('script:not([src])')) dom.window.eval(script.textContent);
  const d=dom.window.document;
  assert.equal(d.getElementById('receipt-detail').hidden,false);
  assert.match(d.getElementById('receipt-message').textContent,/No order or payment is confirmed/);
  assert.match(d.getElementById('receipt-saved-note').textContent,/not notification delivery/);
  assert.match(d.querySelector('#receipt-next ol').textContent,/approve the quote before any order/);
  assert.doesNotMatch(d.querySelector('#receipt-next ol').textContent,/we schedule/i);
});

test('parts activity records a fixed start event without form values', async t => {
  const dom=new JSDOM(html,{url:'https://fixingfortmyers.com/parts',runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w=dom.window, bodies=[];
  w.PT_CONTACT_CONFIG={endpoint:'https://receiver.invalid'};
  w.fetch=async(url,options)=>{bodies.push(JSON.parse(options.body));return {status:200};};
  w.eval(fs.readFileSync('site.js','utf8'));
  const input=w.document.getElementById('parts-vin'); input.value='1HGCM82633A004352';
  input.dispatchEvent(new w.Event('input',{bubbles:true})); input.dispatchEvent(new w.Event('input',{bubbles:true}));
  await settle();
  assert.deepEqual(bodies.map(x=>x.event),['visit','parts_quote_started']);
  assert.ok(bodies.every(x=>x.page==='/parts'));
  assert.doesNotMatch(JSON.stringify(bodies),/1HGCM82633A004352|vehicle|phone|description/);
});
