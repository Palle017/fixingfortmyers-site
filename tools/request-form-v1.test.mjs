// WU A replaces the former service/location/calendar/voice form. All submissions
// here use synthetic receivers or intercepted mailto navigation, never live intake.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {JSDOM, VirtualConsole} from 'jsdom';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const settle = async () => { for (let i=0; i<5; i++) await new Promise(setImmediate); };
const keys = ['name','phone','vehicle','vin','callback_preference','callback_at','service','notes','submitted_at','source'].sort();
const receipt = {ok:true,received:true,id:'12345678-1234-4234-8234-123456789012'};
const reply = (body=receipt,status=201) => ({ok:status>=200&&status<300,status,json:async()=>body});

function setup(t, {page='index.html', endpoint='https://receiver.invalid/request-v1', handler, config={}, nativeFetch=false, search=''}={}) {
  const errors=[], logs=[], console=new VirtualConsole();
  console.on('jsdomError', error=>{if(!/Not implemented: navigation/.test(error.message)) errors.push(error.message);});
  console.on('error', (...args)=>logs.push(args));
  const dom=new JSDOM(read(page), {url:'https://preview.invalid/'+(page==='index.html'?'':page)+search, runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:console});
  const w=dom.window, d=w.document, calls=[], tools=[];
  t.after(()=>{w.close();assert.deepEqual(errors,[]);});
  w.matchMedia=()=>({matches:false});
  if(nativeFetch) w.AbortController=AbortController;
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.PT_CONTACT_CONFIG={endpoint:'',requestEndpoint:endpoint,googleClientId:'',...config};
  d.modelContext={registerTool:tool=>{tools.push(tool);}};
  w.fetch=async (url, options)=>{
    const call={url:String(url),...options,body:JSON.parse(options.body)};
    calls.push(call);
    if(nativeFetch) return fetch(url,options);
    return handler ? handler(call,w) : reply();
  };
  w.eval(read('request-form-v1.js'));
  w.eval(read('site.js'));
  w.eval(read('repair-form-calm.js'));
  const form=d.getElementById('bookingForm');
  const enter=(id,value)=>{const field=d.getElementById(id);assert.ok(field,id);field.value=value;field.dispatchEvent(new w.Event('input',{bubbles:true}));};
  const fill=()=>{enter('request-name','Synthetic Customer');enter('request-phone','2395550100');enter('request-vehicle','2014 Honda Civic');};
  const send=()=>form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  const preference=value=>{const radio=form.querySelector(`[name="callback_preference"][value="${value}"]`);radio.checked=true;radio.dispatchEvent(new w.Event('change',{bubbles:true}));};
  return {w,d,form,calls,logs,tools,enter,fill,send,preference};
}

test('both entry pages share the short callback form, optional notes, a hidden service and no Phase-2 controls', t=>{
  for(const page of ['index.html','request-a-repair.html']){
    const x=setup(t,{page});
    assert.deepEqual([...x.form.querySelectorAll('[required]')].map(input=>input.name),['name','phone','vehicle']);
    assert.deepEqual([...new Set([...x.form.querySelectorAll('input')].map(input=>input.name))],['name','phone','vehicle','service','vin','callback_preference','callback_at']);
    assert.equal(x.form.querySelectorAll('select,input[type="file"],input[type="checkbox"]').length,0);
    const notes=x.form.querySelector('textarea');
    assert.equal(notes?.id,'request-notes');
    assert.equal(notes.name,'notes');
    assert.equal(notes.required,false);
    assert.equal(notes.maxLength,2000);
    assert.equal(notes.labels[0].textContent,"What's going on? (symptoms, codes, promo code like WALNUT10)");
    const service=x.d.getElementById('request-service');
    assert.equal(service.type,'hidden');
    assert.equal(service.name,'service');
    assert.equal(service.required,false);
    assert.equal(service.value,'');
    for(const input of x.form.querySelectorAll('input,textarea')) if(input.type!=='hidden') assert.ok(input.labels.length,input.id+': visible label');
    for(const name of ['name','phone','vehicle','vin']) assert.equal(x.form.querySelectorAll(`[name="${name}"]`).length,1);
    assert.equal(x.d.getElementById('request-options').open,false);
    assert.equal(x.d.querySelector('#request-options>summary').textContent,'Add details (optional)');
    assert.equal(x.d.getElementById('request-vin').closest('details').id,'request-options');
    assert.equal(x.d.getElementById('callback-asap').checked,true);
    assert.equal(x.d.getElementById('request-callback-time').hidden,true);
    assert.equal(x.d.getElementById('request-callback-at').required,false);
    assert.equal(x.d.getElementById('request-vehicle').placeholder,'Year Make Model, e.g. 2014 Honda Civic');
    assert.equal(x.d.getElementById('request-submit').disabled,false);
    assert.equal(x.d.getElementById('request-heading').textContent,'Send a request. It takes 20 seconds. Tony calls back.');
    assert.equal(x.d.getElementById('request-review-note').textContent,'An AI assistant reviews your request, then Tony calls back to confirm.');
    assert.match(x.form.querySelector('.request-phone-footer').textContent,/Prefer to call\? \(239\) 397-2048/);
    assert.equal(x.form.querySelector('.request-phone-footer a').getAttribute('href'),'tel:+12393972048');
    assert.equal(x.form.hasAttribute('toolautosubmit'),false);
    assert.equal(x.form.querySelector('input[name="email"]'),null);
  }
});

test('blur validates each required field and empty submission shows three errors then focuses Name', async t=>{
  const x=setup(t);
  for(const id of ['request-name','request-phone','request-vehicle']){
    assert.equal(x.d.getElementById(id+'-error').hidden,true);
    x.d.getElementById(id).dispatchEvent(new x.w.FocusEvent('blur'));
    assert.equal(x.d.getElementById(id+'-error').hidden,false);
    assert.equal(x.d.getElementById(id).getAttribute('aria-invalid'),'true');
    assert.ok(x.d.getElementById(id).getAttribute('aria-describedby').split(' ').includes(id+'-error'));
  }
  x.send();await settle();
  assert.equal(x.form.querySelectorAll('.request-error:not([hidden])').length,3);
  assert.equal(x.d.activeElement.id,'request-name');
  assert.equal(x.calls.length,0);
  assert.equal(x.d.getElementById('request-submit').disabled,false);
  x.fill();
  assert.equal(x.form.querySelectorAll('.request-error:not([hidden])').length,0);
});

test('blank whitespace cannot satisfy Name or Vehicle and optional VIN validation never disables submit', async t=>{
  const x=setup(t);x.fill();x.enter('request-name','   ');x.enter('request-vehicle','  ');x.enter('request-vin','abc');x.send();await settle();
  assert.equal(x.calls.length,0);assert.equal(x.d.activeElement.id,'request-name');
  assert.equal(x.form.querySelectorAll('.request-error:not([hidden])').length,2);
  assert.equal(x.d.getElementById('request-submit').disabled,false);
});

test('US phone constraint accepts exactly ten digits or +1 plus ten digits', async t=>{
  for(const phone of ['2395550100','+12395550100']){
    const x=setup(t);x.fill();x.enter('request-phone',phone);x.send();await settle();
    assert.equal(x.calls.length,1,phone);
    assert.equal(x.calls[0].body.phone,phone);
    assert.equal(x.d.getElementById('request-phone').validity.patternMismatch,false);
  }
  for(const phone of ['','239555010','23955501000','12395550100','+442395550100','(239) 555-0100']){
    const x=setup(t);x.fill();x.enter('request-phone',phone);x.send();await settle();
    assert.equal(x.calls.length,0,phone);
    assert.equal(x.d.activeElement.id,'request-phone');
  }
});

test('valid submission sends exactly the v1 JSON contract and shows only the confirmation text', async t=>{
  const x=setup(t),events=[];
  x.w.PT_TRACK=event=>events.push(event);
  x.fill();x.send();await settle();
  assert.equal(x.calls.length,1);
  assert.equal(events.filter(event=>event==='form_submit_attempt').length,1);
  const call=x.calls[0], data=call.body;
  assert.equal(call.url,'https://receiver.invalid/request-v1');
  assert.equal(call.method,'POST');
  assert.equal(call.headers['Content-Type'],'application/json');
  assert.ok(call.headers['Idempotency-Key']);
  assert.equal(call.credentials,'omit');assert.equal(call.referrerPolicy,'no-referrer');
  assert.deepEqual(Object.keys(data).sort(),keys);
  assert.equal(data.name,'Synthetic Customer');assert.equal(data.vehicle,'2014 Honda Civic');
  assert.equal(data.vin,null);assert.equal(data.callback_preference,'asap');assert.equal(data.callback_at,null);
  assert.equal(data.service,null);assert.equal(data.notes,null);
  assert.equal(data.source,'site_form_v1');
  assert.equal(new Date(data.submitted_at).toISOString(),data.submitted_at);
  assert.equal(x.form.hidden,true);
  assert.equal(x.d.getElementById('request-done').textContent,'Got it, Synthetic Customer. Tony calls back ASAP.');
  assert.equal(x.d.activeElement.id,'request-done-heading');
  assert.deepEqual(x.logs,[]);
  assert.equal(x.w.sessionStorage.getItem('pt-last-request'),null,'no customer data persisted in browser storage');
});

test('VIN uppercases and gives advisory validation while a ten-character VIN still submits', async t=>{
  const x=setup(t);x.fill();x.enter('request-vin','abc1234567');
  x.d.getElementById('request-vin').dispatchEvent(new x.w.FocusEvent('blur'));
  assert.equal(x.d.getElementById('request-vin').value,'ABC1234567');
  assert.equal(x.d.getElementById('request-vin').maxLength,17);
  assert.match(x.d.getElementById('request-vin-help').textContent,/still send/);
  assert.equal(x.d.getElementById('request-vin').checkValidity(),true);
  assert.equal(x.d.getElementById('request-submit').disabled,false);
  x.send();await settle();
  assert.equal(x.calls[0].body.vin,'ABC1234567');
});

test('callback choices serialize independently of service scheduling, with optional local time converted to ISO', async t=>{
  for(const [value,copy] of [['asap','ASAP'],['today','ASAP'],['tomorrow','by tomorrow'],['next_week','next week'],['specific','ASAP']]){
    const x=setup(t);x.fill();x.preference(value);
    assert.equal(x.d.getElementById('request-callback-time').hidden,value!=='specific');
    x.send();await settle();
    assert.equal(x.calls[0].body.callback_preference,value);
    assert.equal(x.calls[0].body.callback_at,null,'a callback time is optional');
    assert.equal(x.d.getElementById('request-done-heading').textContent,`Got it, Synthetic Customer. Tony calls back ${copy}.`);
  }
  const x=setup(t);x.fill();x.preference('specific');x.enter('request-callback-at','2026-11-12T14:30');x.send();await settle();
  assert.equal(x.calls[0].body.callback_at,new x.w.Date('2026-11-12T14:30').toISOString());
  const y=setup(t);y.fill();y.preference('specific');y.enter('request-callback-at','2026-11-12T14:30');y.preference('tomorrow');y.send();await settle();
  assert.equal(y.calls[0].body.callback_at,null,'hidden stale time is omitted');
});

test('button disables only during an HTTP request and double submits in flight or after success do not duplicate it', async t=>{
  let finish;
  const x=setup(t,{handler:()=>new Promise(resolve=>{finish=resolve;})});
  x.fill();x.send();x.send();await settle();
  assert.equal(x.calls.length,1);assert.equal(x.d.getElementById('request-submit').disabled,true);
  finish(reply());await settle();
  assert.equal(x.d.getElementById('request-submit').disabled,false);
  x.send();await settle();assert.equal(x.calls.length,1);
});

test('failed submission preserves fields and retry reuses payload, timestamp and idempotency key with no PII logging', async t=>{
  let attempts=0;
  const x=setup(t,{handler:()=>++attempts===1?reply({ok:false},503):reply()});
  x.fill();x.enter('request-vin','abc1234567');x.send();await settle();
  assert.equal(x.form.hidden,false);assert.equal(x.d.getElementById('request-name').value,'Synthetic Customer');
  assert.equal(x.d.getElementById('request-phone').value,'2395550100');assert.equal(x.d.getElementById('request-vin').value,'ABC1234567');
  assert.equal(x.d.getElementById('request-submit').textContent,'Retry request');assert.equal(x.d.getElementById('request-submit').disabled,false);
  assert.equal(x.logs.length,1);assert.doesNotMatch(JSON.stringify(x.logs),/Synthetic|2395550100|ABC1234567|2014/);
  x.send();await settle();
  assert.deepEqual(x.calls[1].body,x.calls[0].body);assert.equal(x.calls[1].headers['Idempotency-Key'],x.calls[0].headers['Idempotency-Key']);
  assert.equal(x.form.hidden,true);
});

test('editing a failed request creates a new idempotency key and the next request uses current fields', async t=>{
  const x=setup(t,{handler:()=>{throw new Error('Private server detail Synthetic Customer 2395550100');}});
  x.fill();x.send();await settle();x.enter('request-vehicle','2018 Synthetic Van');x.send();await settle();
  assert.equal(x.calls[1].body.vehicle,'2018 Synthetic Van');
  assert.notEqual(x.calls[1].headers['Idempotency-Key'],x.calls[0].headers['Idempotency-Key']);
  assert.doesNotMatch(JSON.stringify(x.logs),/Private|Synthetic|2395550100/);
});

test('mailto fallback prepares encoded subject and exact JSON body without claiming receipt or sending HTTP', async t=>{
  const x=setup(t,{endpoint:''}),events=[];
  x.w.PT_TRACK=event=>events.push(event);
  x.fill();x.preference('tomorrow');x.send();await settle();
  const mail=new URL(x.d.getElementById('request-email').href);
  assert.equal(mail.protocol,'mailto:');assert.equal(mail.pathname,'fixingfortmyers@gmail.com');
  assert.equal(mail.searchParams.get('subject'),'Repair callback request');
  const data=JSON.parse(mail.searchParams.get('body'));
  assert.deepEqual(Object.keys(data).sort(),keys);assert.equal(data.callback_preference,'tomorrow');
  assert.equal(x.calls.length,0);assert.equal(x.form.hidden,false);assert.equal(x.d.getElementById('request-done').hidden,true);
  assert.equal(x.d.getElementById('request-submit').disabled,false);assert.match(x.d.getElementById('request-status').textContent,/has not been sent/);
  assert.equal(events.includes('form_submit_attempt'),false,'an email draft is not an HTTP submission attempt');
  assert.equal(events.includes('form_submit_success'),false,'draft creation does not confirm delivery');
});

test('editing fields or callback choice invalidates the previous mailto draft and retry rebuilds it', async t=>{
  const x=setup(t,{endpoint:''});x.fill();x.send();await settle();
  assert.equal(x.d.getElementById('request-email').hidden,false);
  x.enter('request-vehicle','2018 Synthetic Van');
  assert.equal(x.d.getElementById('request-email').hidden,true);
  assert.equal(x.d.getElementById('request-email').href,'mailto:fixingfortmyers@gmail.com');
  assert.equal(x.d.getElementById('request-status').textContent,'');
  x.send();await settle();
  assert.equal(JSON.parse(new URL(x.d.getElementById('request-email').href).searchParams.get('body')).vehicle,'2018 Synthetic Van');
  x.preference('tomorrow');
  assert.equal(x.d.getElementById('request-email').hidden,true);
  assert.equal(x.d.getElementById('request-email').href,'mailto:fixingfortmyers@gmail.com');
  x.send();await settle();
  assert.equal(JSON.parse(new URL(x.d.getElementById('request-email').href).searchParams.get('body')).callback_preference,'tomorrow');
  assert.equal(x.calls.length,0);
});

test('malformed and unacknowledged 2xx responses preserve data and show Retry instead of a confirmation', async t=>{
  for(const body of [null,{}, {ok:true}, {ok:true,received:false,id:receipt.id}, {ok:false,received:true,id:receipt.id}, {ok:true,received:true,id:''}, {ok:true,received:true,id:'  '}, {ok:true,received:true,id:123}]){
    const x=setup(t,{handler:()=>reply(body,200)});x.fill();x.send();await settle();
    assert.equal(x.form.hidden,false,JSON.stringify(body));
    assert.equal(x.d.getElementById('request-done').hidden,true);
    assert.equal(x.d.getElementById('request-submit').textContent,'Retry request');
    assert.equal(x.d.getElementById('request-name').value,'Synthetic Customer');
    assert.equal(x.d.getElementById('request-phone').value,'2395550100');
  }
  const x=setup(t,{handler:()=>({ok:true,status:200,json:async()=>{throw new SyntaxError('PRIVATE_SERVER_BODY');}})});x.fill();x.send();await settle();
  assert.equal(x.form.hidden,false);assert.equal(x.d.getElementById('request-submit').textContent,'Retry request');
  assert.doesNotMatch(JSON.stringify(x.logs),/PRIVATE_SERVER_BODY|Synthetic|2395550100/);
});

test('public configuration keeps the verified legacy endpoint separate until the v1 backend contract is ready', t=>{
  for(const url of ['https://fixingfortmyers.com/','https://www.fixingfortmyers.com/','http://127.0.0.1:18909/']){
    const dom=new JSDOM('',{url,runScripts:'outside-only'});t.after(()=>dom.window.close());
    dom.window.eval(read('contact-config.js'));
    const config=dom.window.PT_CONTACT_CONFIG;
    assert.equal(config.requestEndpoint,'');assert.equal(config.googleClientId,'');
    assert.equal(config.endpoint,url.includes('fixingfortmyers.com')?'https://perfect-timing-cloud-intake.prudhvi-pallempati.chatgpt.site':'');
  }
  assert.match(read('deliverables/form-backend-spec.md'),/site_form_v1/);
});

test('confirmation renders customer text safely without interpreting it as HTML', async t=>{
  const x=setup(t);x.fill();x.enter('request-name','<img src=x onerror=alert(1)>');x.send();await settle();
  assert.equal(x.d.getElementById('request-done').querySelector('img,script'),null);
  assert.match(x.d.getElementById('request-done').textContent,/<img src=x onerror=alert\(1\)>/);
});

test('legacy calm, Google and imperative WebMCP helpers do not add fields, scripts or automatic requests to v1', async t=>{
  const x=setup(t,{config:{googleClientId:'synthetic-client.apps.googleusercontent.com'}});await settle();
  assert.equal(x.tools.length,0);assert.equal(x.calls.length,0);
  assert.equal(x.d.querySelectorAll('script[src*="accounts.google.com"]').length,0);
  assert.equal(x.form.querySelector('input[name="email"]'),null);
  assert.equal(x.form.querySelector('select'),null);
  assert.equal(x.d.getElementById('request-submit').disabled,false);
});

test('conversion events wait for an acknowledged receipt and contain fixed categories without request details', async t=>{
  const x=setup(t);x.fill();x.send();await settle();
  const events=Array.from(x.w.dataLayer).filter(entry=>entry.event);
  assert.equal(events.filter(entry=>entry.event==='form_submit_success').length,1);
  assert.doesNotMatch(JSON.stringify(events),/Synthetic|2395550100|2014 Honda|ABC123/);
  const y=setup(t,{handler:()=>({ok:false,status:400})});y.fill();y.send();await settle();
  assert.equal(Array.from(y.w.dataLayer).filter(entry=>entry.event==='form_submit_success').length,0);
});

test('optional notes and a sanitized ?service= value are included in the payload and the email draft', async t=>{
  const walnut=setup(t,{page:'request-a-repair.html',search:'?service=walnut'});
  assert.equal(walnut.d.getElementById('request-service').value,'walnut');
  walnut.fill();
  walnut.enter('request-notes','  Rough idle. Code P0301. Promo WALNUT10  ');
  walnut.send();await settle();
  assert.equal(walnut.calls[0].body.service,'walnut');
  assert.equal(walnut.calls[0].body.notes,'Rough idle. Code P0301. Promo WALNUT10');
  assert.equal(walnut.d.getElementById('request-notes').required,false);
  assert.doesNotMatch(JSON.stringify(Array.from(walnut.w.dataLayer)),/P0301|WALNUT10/);

  const draft=setup(t,{endpoint:'',page:'request-a-repair.html',search:'?service=ENGINE'});
  draft.fill();draft.enter('request-notes','Send the estimate');draft.send();await settle();
  const mailed=JSON.parse(new URL(draft.d.getElementById('request-email').href).searchParams.get('body'));
  assert.equal(mailed.service,'engine');assert.equal(mailed.notes,'Send the estimate');
  assert.equal(draft.calls.length,0);assert.match(draft.d.getElementById('request-status').textContent,/has not been sent/);
  draft.enter('request-notes','P0300');
  assert.equal(draft.d.getElementById('request-email').hidden,true);

  const plain=setup(t,{search:'?service=Timing%20Chain'});
  plain.fill();plain.send();await settle();
  assert.equal(plain.calls[0].body.service,'Timing Chain');assert.equal(plain.calls[0].body.notes,null);
  const flood=setup(t,{search:'?service=water-damage'});
  flood.fill();flood.send();await settle();
  assert.equal(flood.calls[0].body.service,'water-damage');
  for(const query of ['?service=%3Cscript%3Ealert(1)%3C/script%3E','?service=javascript:alert(1)','?service=','?service=%20%20']){
    const blocked=setup(t,{search:query});blocked.fill();blocked.send();await settle();
    assert.equal(blocked.calls[0].body.service,null,query);
  }
  const blank=setup(t,{endpoint:''});
  blank.fill();blank.enter('request-notes','   ');blank.send();await settle();
  assert.equal(JSON.parse(new URL(blank.d.getElementById('request-email').href).searchParams.get('body')).notes,null);
  const tamper=setup(t);tamper.fill();tamper.d.getElementById('request-service').value='<img src=x onerror=alert(1)>';tamper.send();await settle();
  assert.equal(tamper.calls[0].body.service,null);
});

test('exact JSON reaches a real isolated HTTP receiver and its 201 response confirms the form', async t=>{
  let received;
  const server=http.createServer((req,res)=>{
    let body='';req.on('data',chunk=>{body+=chunk;});req.on('end',()=>{received={method:req.method,path:req.url,body:JSON.parse(body)};res.writeHead(201,{'Content-Type':'application/json'});res.end(JSON.stringify(receipt));});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const x=setup(t,{endpoint:`http://127.0.0.1:${server.address().port}/request-v1`,nativeFetch:true});x.fill();x.send();
  for(let i=0;i<200&&!x.form.hidden;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(received.method,'POST');assert.equal(received.path,'/request-v1');assert.deepEqual(Object.keys(received.body).sort(),keys);
  assert.equal(x.form.hidden,true);
});
