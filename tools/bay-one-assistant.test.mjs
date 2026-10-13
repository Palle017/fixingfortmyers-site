// DOM contracts with mocked HTTP; no real model or lead is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const source=fs.readFileSync(new URL('../bay-one-widget.js',import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};
const capabilities={version:'assistant-v1',questions:true,roughEstimates:true,intake:false,modelStatus:'configured_unverified'};
function setup(t,{handler}={}){
  const dom=new JSDOM('<!doctype html><html><head></head><body><main><h1>Auto repair</h1></main></body></html>',{url:'https://fixingfortmyers.com/',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());const w=dom.window,calls=[];
  w.matchMedia=()=>({matches:false});w.HTMLElement.prototype.scrollIntoView=function(){};
  w.PT_BAYONE_CONFIG={enabled:true,autoOpen:false,endpoint:'https://chat.invalid'};
  w.PT_CONTACT_CONFIG={endpoint:'https://leads.invalid'};
  w.fetch=async(url,options={})=>{
    const route=new URL(url).pathname,body=JSON.parse(options.body||'{}');calls.push({url:String(url),route,body,headers:options.headers});
    if(handler)return handler(route,body,url,w);
    return {ok:true,status:200,json:async()=>route==='/healthz'?{ok:true,chat:'ready',media:'ready'}:route==='/chat/session'?{ok:true,visitor_token:'synthetic-token',canEstimate:true,capabilities,usage:{remaining:2}}:{ok:true,kind:'answer',reply:'We can discuss that repair.',canEstimate:true,capabilities,usage:{remaining:2}}};
  };
  w.eval(source);
  const open=async()=>{w.document.querySelector('.b1-launcher').click();await settle();};
  const send=async(message)=>{const field=w.document.getElementById('b1-message');field.value=message;w.document.querySelector('.b1-composer').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();};
  return {w,d:w.document,calls,open,send};
}
test('entry stays optional with no chat network or images until opened; artwork and two modes then become available',async t=>{
  const x=setup(t);await settle();assert.ok(x.d.querySelector('.b1-launcher'));assert.equal(x.d.querySelector('.b1-panel').hidden,true);
  assert.equal(x.calls.length,0);assert.equal(x.d.querySelector('#bay-one-widget img[src]'),null);
  await x.open();assert.ok(x.d.querySelector('.b1-art-loaded'));assert.ok(x.d.querySelector('#bay-one-widget img[src]'));
  assert.equal(x.d.querySelector('[data-b1-mode=estimate]').disabled,false);assert.match(x.d.querySelector('.b1-allowance').textContent,/2 rough estimates/);
});
test('older intake-only receiver cannot advertise or enable estimates',async t=>{
  const x=setup(t,{handler:async route=>({ok:true,status:200,json:async()=>route==='/healthz'?{ok:true,chat:'ready'}:{ok:true,visitor_token:'synthetic-token'}})});
  await x.open();assert.equal(x.d.querySelector('[data-b1-mode=estimate]').disabled,true);assert.match(x.d.querySelector('.b1-allowance').textContent,/not connected/);
});
test('offline receiver keeps call and repair-form fallback without submitting or faking an answer',async t=>{
  const x=setup(t,{handler:async(_r,_b,_u,w)=>{throw new w.TypeError('offline');}});
  await x.open();assert.equal(x.d.querySelector('.b1-fallback').hidden,false);assert.match(x.d.querySelector('.b1-status').textContent,/offline/);
  assert.equal(x.calls.some(call=>call.route==='/chat/session'),false);assert.equal(x.d.querySelector('.b1-estimate'),null);
});
test('estimate UI displays the actual range, disables quota-exhausted mode and hands the range to the separate lead receiver',async t=>{
  const x=setup(t,{handler:async(route,body)=>({ok:true,status:200,json:async()=>{
    if(route==='/healthz')return {ok:true,chat:'ready',media:'ready'};
    if(route==='/chat/session')return {ok:true,visitor_token:'synthetic-token',canEstimate:true,capabilities,usage:{remaining:1}};
    if(route==='/hooks/lead/webform')return {ok:true,received:true,id:'12345678-1234-4234-8234-123456789012'};
    return {ok:true,kind:'estimate',reply:'A planning range, not a shop quote.',canEstimate:true,capabilities,usage:{remaining:0},estimate:{low:300,high:600,currency:'USD',vehicle:'2015 Honda Civic',repair:'replace brake pads',assumptions:['Typical parts and normal access.']}};
  }})});
  await x.open();x.d.querySelector('[data-b1-mode=estimate]').click();await x.send('2015 Honda Civic replace brake pads');
  assert.equal(x.calls.find(call=>call.route==='/chat/message').body.mode,'estimate');
  assert.match(x.d.querySelector('.b1-estimate-range').textContent,/\$300.*\$600/);
  assert.equal(x.d.querySelector('[data-b1-mode=estimate]').disabled,true);
  assert.equal(x.d.querySelector('.b1-lead'),null,'Q&A does not force the contact card');
  x.d.querySelector('.b1-send-now').click();const card=x.d.querySelector('.b1-lead');
  for(const [key,value] of Object.entries({name:'Synthetic',phone:'2395550100',city:'Fort Myers'}))card.querySelector('[name='+key+']').value=value;
  card.dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  const sent=x.calls.find(call=>call.route==='/hooks/lead/webform');
  assert.equal(sent.url,'https://leads.invalid/hooks/lead/webform');assert.match(sent.body.details,/not a shop quote[\s\S]*\$300/);
  assert.equal(x.calls.find(call=>call.route==='/chat/message').url,'https://chat.invalid/chat/message');
});
test('provider failure preserves the message for a real retry and never renders a synthetic estimate',async t=>{
  let fail=true;
  const x=setup(t,{handler:async(route)=>route==='/chat/message'?{ok:!fail,status:fail?503:200,json:async()=>fail?{ok:false,code:'estimate_unavailable',error:'Estimates are unavailable.'}:{ok:true,reply:'Which model is it?',kind:'clarify',usage:{remaining:2},canEstimate:true}}:{ok:true,status:200,json:async()=>route==='/healthz'?{ok:true,chat:'ready'}:{ok:true,visitor_token:'synthetic-token',canEstimate:true,capabilities,usage:{remaining:2}}}});
  await x.open();x.d.querySelector('[data-b1-mode=estimate]').click();await x.send('2015 Honda Civic replace brakes');
  assert.equal(x.d.querySelector('.b1-estimate'),null);assert.match(x.d.getElementById('b1-message').value,/Honda Civic/);assert.equal(x.d.querySelector('.b1-fallback').hidden,false);
  fail=false;await x.send('2015 Honda Civic replace brakes');assert.match(x.d.querySelector('.b1-messages').textContent,/Which model/);
});

test('malformed lead receipts preserve the card and reuse the exact request until the receiver confirms it', async t => {
  const id = '12345678-1234-4234-8234-123456789012';
  const invalid = [null, {received:true, id}, {ok:false, received:true, id}, {ok:true, received:true},
    {ok:true, received:true, id:''}, {ok:true, received:true, id:'   '}, {ok:true, received:false, id}, 'non-JSON'];
  for (const receipt of invalid) {
    let attempts = 0;
    const x = setup(t, {handler:async route => {
      if (route === '/hooks/lead/webform') {
        attempts++;
        return {ok:true, status:200, json:async () => {
          if (attempts > 1) return {ok:true, received:true, id};
          if (receipt === 'non-JSON') throw new SyntaxError('HTML response');
          return receipt;
        }};
      }
      return {ok:true, status:200, json:async () => route === '/healthz' ? {ok:true, chat:'ready'}
        : route === '/chat/session' ? {ok:true, visitor_token:'synthetic-token'}
        : {ok:true, kind:'intake', reply:'Please add your contact details.', intake:{}}};
    }});
    await x.open(); await x.send('Synthetic brake inquiry.');
    const card = x.d.querySelector('.b1-lead');
    for (const [key,value] of Object.entries({name:'Synthetic', phone:'2395550100', city:'Fort Myers'})) card.querySelector('[name='+key+']').value = value;
    const submit = () => card.dispatchEvent(new x.w.Event('submit', {bubbles:true, cancelable:true}));
    submit(); await settle();
    assert.equal(card.isConnected, true);
    assert.equal(card.querySelector('[name=phone]').disabled, true, 'an uncertain save keeps its payload for retry');
    assert.equal(card.querySelector('[name=vehicle]').disabled, true);
    assert.equal(card.querySelector('[name=details]').disabled, true, 'reviewed details stay locked to the uncertain payload');
    assert.match(card.querySelector('.b1-lead-status').textContent, /Receipt could not be confirmed/);
    assert.doesNotMatch(x.d.querySelector('.b1-messages').textContent, /Your request is saved/);
    assert.equal(x.w.sessionStorage.getItem('pt-last-request'), null);
    assert.equal(x.d.querySelector('.b1-contact').dispatchEvent(new x.w.MouseEvent('click',{bubbles:true,cancelable:true})), false, 'an uncertain save cannot start a second form submission path');
    assert.match(x.d.querySelector('.b1-status').textContent, /Retry the pending repair request/);
    assert.equal(x.w.sessionStorage.getItem('pt-bayone-service-draft-v1'), null);
    submit(); await settle();
    const calls = x.calls.filter(call => call.route === '/hooks/lead/webform');
    assert.deepEqual(calls[0].body, calls[1].body);
    assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
    assert.equal(card.isConnected, false);
    assert.equal(JSON.parse(x.w.sessionStorage.getItem('pt-last-request')).id, id);
    assert.equal(x.d.querySelector('.b1-receipt-reference').textContent, 'Reference: '+id);
  }
});

test('invalid answers and server errors preserve customer wording and offer honest review without a fake reply', async t => {
  for (const failure of [{status:503, code:'invalid_answer'}, {status:200, code:'invalid_answer'}, {status:502, code:'upstream_failed'}]) {
    const x = setup(t, {handler:async route => route === '/chat/message'
      ? {ok:failure.status < 400, status:failure.status, json:async () => ({ok:false, code:failure.code, error:'For repair pricing, ask for an estimate.'})}
      : {ok:true, status:200, json:async () => route === '/healthz' ? {ok:true, chat:'ready'} : {ok:true, visitor_token:'synthetic-token', capabilities}}});
    await x.open();
    const message = 'My 2018 Ford F-150 needs replacement TCM programming; do not quote yet.';
    await x.send(message);
    assert.equal(x.d.getElementById('b1-message').value, message);
    assert.match(x.d.querySelector('.b1-status').textContent, /reply is unavailable[\s\S]*message is preserved/);
    assert.doesNotMatch(x.d.querySelector('.b1-status').textContent, /For repair pricing/);
    assert.equal(x.d.querySelector('.b1-fallback').hidden, false);
    assert.match(x.d.querySelector('.b1-fallback p').textContent, /has not been answered/);
    assert.equal(x.d.querySelector('.b1-send-now').hidden, false);
    assert.equal(x.d.querySelectorAll('.b1-assistant').length, 1, 'only the initial greeting; no fabricated answer');
    assert.equal(x.calls.some(call => call.route === '/hooks/lead/webform'), false);
    await x.send(message);
    const chatCalls = x.calls.filter(call => call.route === '/chat/message');
    assert.equal(chatCalls[0].body.request_id, chatCalls[1].body.request_id, 'retry keeps the original chat request identity');
    assert.equal(x.d.querySelectorAll('.b1-user').length, 1, 'retry does not duplicate the customer wording');
    x.d.querySelector('.b1-send-now').click();
    assert.equal(x.d.querySelector('.b1-lead [name=details]').value, message);
    assert.equal(x.d.querySelector('.b1-lead [name=vehicle]').value, '', 'intake:false never invents an extracted vehicle');
  }
});

test('a failed hosted answer can be reviewed, corrected and explicitly submitted with a visible receipt', async t => {
  const id = 'bayone-reviewed-receipt';
  const x = setup(t, {handler:async route => {
    if (route === '/chat/message') return {ok:false, status:503, json:async () => ({ok:false, code:'invalid_answer', error:'Ask for pricing.'})};
    if (route === '/hooks/lead/webform') return {ok:true, status:201, json:async () => ({ok:true, received:true, id})};
    return {ok:true, status:200, json:async () => route === '/healthz' ? {ok:true, chat:'ready'} : {ok:true, visitor_token:'synthetic-token', capabilities}};
  }});
  await x.open(); await x.send('Synthetic original TCM concern.');
  x.d.querySelector('.b1-send-now').click();
  const card = x.d.querySelector('.b1-lead');
  const reviewed = {vehicle:'2018 Ford F-150', details:'CUSTOMER EDIT: compatibility check only; no booking.', name:'Owner Test', phone:'2395550102', city:'Fort Myers'};
  for (const [key,value] of Object.entries(reviewed)) {
    const field = card.querySelector('[name='+key+']'); field.value = value;
    field.dispatchEvent(new x.w.Event('input', {bubbles:true}));
  }
  assert.equal(card.querySelector('[name=sms]').checked, false);
  assert.equal(x.calls.some(call => call.route === '/hooks/lead/webform'), false, 'review and editing never submits');
  const submit = () => card.dispatchEvent(new x.w.Event('submit', {bubbles:true,cancelable:true}));
  submit(); submit(); await settle();
  const sent = x.calls.filter(call => call.route === '/hooks/lead/webform');
  assert.equal(sent.length, 1);
  for (const [key,value] of Object.entries(reviewed)) assert.equal(sent[0].body[key], value);
  assert.equal(sent[0].body.smsConsent, false);
  assert.equal(sent[0].body.source, 'ai');
  assert.equal(sent[0].url, 'https://leads.invalid/hooks/lead/webform');
  assert.equal(x.d.querySelector('.b1-receipt-reference').textContent, 'Reference: '+id);
  assert.match(x.d.querySelector('.b1-messages').textContent, /Booking is not confirmed/);
  assert.equal(x.d.querySelector('.b1-contact').dispatchEvent(new x.w.MouseEvent('click',{bubbles:true,cancelable:true})), true, 'a confirmed receipt no longer blocks normal form navigation as pending');
  assert.doesNotMatch(x.d.querySelector('.b1-status').textContent, /Retry the pending repair request/);
});

test('later provider extraction cannot overwrite customer-reviewed vehicle, details or urgency', async t => {
  let turn = 0;
  const x = setup(t, {handler:async route => ({ok:true, status:200, json:async () => {
    if (route === '/healthz') return {ok:true, chat:'ready'};
    if (route === '/chat/session') return {ok:true, visitor_token:'synthetic-token'};
    turn++;
    return {ok:true, kind:'intake', reply:'Please review the details.', intake:turn === 1 ? {vehicle:'2018 Ford F-150', city:'Fort Myers', stranded:'no'} : {vehicle:'Wrong vehicle', city:'Wrong city', stranded:'yes'}};
  }})});
  await x.open(); await x.send('My 2018 Ford F-150 needs module setup.');
  const card = x.d.querySelector('.b1-lead');
  assert.equal(card.querySelector('[name=vehicle]').value, '2018 Ford F-150');
  assert.match(card.querySelector('[name=details]').value, /needs module setup/);
  for (const [name,value] of Object.entries({vehicle:'2019 Ford F-150', details:'Customer corrected the year and asks for compatibility review.', city:'Cape Coral', stranded:'no'})) {
    const field = card.querySelector('[name='+name+']'); field.value = value;
    field.dispatchEvent(new x.w.Event('input', {bubbles:true}));
  }
  await x.send('Additional chat context.');
  assert.equal(card.querySelector('[name=vehicle]').value, '2019 Ford F-150');
  assert.equal(card.querySelector('[name=details]').value, 'Customer corrected the year and asks for compatibility review.');
  assert.equal(card.querySelector('[name=city]').value, 'Cape Coral');
  assert.equal(card.querySelector('[name=stranded]').value, 'no');
  assert.equal(x.calls.some(call => call.route === '/hooks/lead/webform'), false);
});

test('long preserved notes require review instead of silently truncating at submission', async t => {
  const x = setup(t); await x.open();
  for (let i=0; i<5; i++) await x.send('Turn '+i+' '+ 'x'.repeat(1500));
  x.d.querySelector('.b1-send-now').click();
  const card = x.d.querySelector('.b1-lead'), details = card.querySelector('[name=details]');
  assert.ok(details.value.length > 6000);
  for (const [key,value] of Object.entries({name:'Synthetic',phone:'2395550102',city:'Fort Myers'})) card.querySelector('[name='+key+']').value = value;
  card.dispatchEvent(new x.w.Event('submit', {bubbles:true,cancelable:true})); await settle();
  assert.equal(x.calls.some(call => call.route === '/hooks/lead/webform'), false);
  assert.match(details.validationMessage, /notes are preserved[\s\S]*6,000/);
  assert.ok(details.value.length > 6000, 'the full source wording remains available to edit');
});

test('a known validation refusal unlocks reviewed details and a correction gets a new request identity', async t => {
  let attempts = 0;
  const x = setup(t, {handler:async route => {
    if (route === '/hooks/lead/webform') return ++attempts === 1
      ? {ok:false,status:422,json:async()=>({ok:false,error:'Correct the repair details.'})}
      : {ok:true,status:201,json:async()=>({ok:true,received:true,id:'corrected-receipt'})};
    return {ok:true,status:200,json:async()=>route==='/healthz'?{ok:true,chat:'ready'}:route==='/chat/session'?{ok:true,visitor_token:'synthetic-token'}:{ok:true,kind:'intake',reply:'Review your details.',intake:{}}};
  }});
  await x.open(); await x.send('Synthetic concern.');
  const card = x.d.querySelector('.b1-lead');
  for (const [key,value] of Object.entries({name:'Synthetic',phone:'2395550102',city:'Fort Myers'})) card.querySelector('[name='+key+']').value = value;
  const submit = () => card.dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));
  submit(); await settle();
  const details = card.querySelector('[name=details]');
  assert.equal(details.disabled,false);
  details.value = 'Customer corrected details.'; details.dispatchEvent(new x.w.Event('input',{bubbles:true}));
  submit(); await settle();
  const sent = x.calls.filter(call=>call.route==='/hooks/lead/webform');
  assert.equal(sent.length,2);
  assert.notEqual(sent[0].headers['Idempotency-Key'],sent[1].headers['Idempotency-Key']);
  assert.equal(sent[1].body.details,'Customer corrected details.');
});

test('before submission, the ordinary form handoff preserves reviewed vehicle and details instead of stale chat extraction', async t => {
  const x = setup(t);
  const form = x.d.createElement('form'); form.id = 'bookingForm';
  form.innerHTML = '<input id="request-vehicle"><textarea id="request-details" maxlength="6000"></textarea><input id="request-name"><input id="request-phone"><input id="request-city"><select id="request-starts"><option value="unknown">Unknown</option><option value="yes">Yes</option></select><select id="request-stranded"><option value="unknown">Unknown</option><option value="no">No</option></select><p id="request-instructions"></p>';
  x.d.body.append(form);
  await x.open(); await x.send('Original chat wording.');
  x.d.querySelector('.b1-send-now').click();
  const card = x.d.querySelector('.b1-lead');
  for (const [name,value] of Object.entries({vehicle:'2018 Ford F-150',details:'Reviewed replacement module compatibility request.',name:'Owner Test',phone:'2395550102',city:'Fort Myers',starts:'yes',stranded:'no'})) {
    const field = card.querySelector('[name='+name+']'); field.value = value;
    field.dispatchEvent(new x.w.Event('input',{bubbles:true}));
  }
  x.d.querySelector('.b1-contact').click();
  assert.equal(x.d.getElementById('request-vehicle').value,'2018 Ford F-150');
  assert.equal(x.d.getElementById('request-details').value,'Customer notes from Bay One:\nReviewed replacement module compatibility request.');
  assert.equal(x.d.getElementById('request-name').value,'Owner Test');
  assert.equal(x.d.getElementById('request-starts').value,'yes');
  assert.equal(x.d.getElementById('request-stranded').value,'no');
  assert.match(x.d.getElementById('request-instructions').textContent,/Nothing has been sent/);
  assert.equal(x.calls.some(call=>call.route==='/hooks/lead/webform'),false);
});
