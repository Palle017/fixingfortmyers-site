// Mocked estimator contracts: no provider, customer or live receiver is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createPublicChat,createOllamaProvider,ASSISTANT_SCHEMA} from './public-chat.mjs';

const question='Estimate for a 2015 Honda Civic: replace front brake pads and rotors';
const range=()=>({kind:'estimate',estimate:{low:300,high:600,vehicle:'2015 Honda Civic',repair:'replace front brake pads and rotors',assumptions:['Typical aftermarket parts and normal access; diagnosis and tax may vary.']}});
function setup(t,options={}){
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'pt-estimator-'));
  let now=Date.parse('2026-10-12T16:00:00Z');
  const chat=createPublicChat({dataDir,now:()=>now,...options});
  t.after(()=>{chat.close();fs.rmSync(dataDir,{recursive:true,force:true});});
  const ip='198.51.100.77',session=chat.session({},ip);
  const send=(message=question,mode='estimate',id=randomUUID(),token=session.visitor_token,network=ip)=>chat.message({visitor_token:token,request_id:id,message,mode},network);
  return {chat,send,session,ip,advance:ms=>{now+=ms;}};
}
test('original question mode answers without using an estimate and can give normal numeric facts',async t=>{
  const x=setup(t,{provider:async()=>({kind:'answer',reply:'Two plus two equals 4.'})});
  assert.equal(x.session.canEstimate,true);assert.equal(x.session.capabilities.modelStatus,'configured_unverified');
  const out=await x.send('What is 2 plus 2?','chat');
  assert.equal(out.kind,'answer');assert.equal(out.usage.remaining,2);
});
test('two server-controlled estimates per day; retry is idempotent and new visitor on same network cannot reset quota',async t=>{
  let calls=0;const x=setup(t,{provider:async()=>{calls++;return range();}});
  const id=randomUUID(),a=await x.send(question,'estimate',id);
  assert.equal(a.estimate.low,300);assert.equal(a.usage.remaining,1);assert.match(a.reply,/not a confirmed shop quote/);
  const retry=await x.send(question,'estimate',id);assert.equal(retry.duplicate,true);assert.equal(retry.usage.remaining,1);assert.equal(calls,1);
  await x.send();assert.equal(calls,2);
  await assert.rejects(x.send(),{code:'estimate_limit'});
  const other=x.chat.session({},x.ip).visitor_token;await assert.rejects(x.send(question,'estimate',randomUUID(),other),{code:'estimate_limit'});
  x.advance(86400000);assert.equal((await x.send()).usage.remaining,1);
});
test('pricing phrased in question mode still uses quota; ordinary answers remain possible after the limit',async t=>{
  const x=setup(t,{provider:async({messages})=>messages.at(-1).content==='How do brakes work?'?{kind:'answer',reply:'Brake pads press against the rotors to slow the wheels.'}:range()});
  await x.send(question,'chat');await x.send(question,'chat');
  await assert.rejects(x.send(question,'chat'),{code:'estimate_limit'});
  x.advance(61000);const out=await x.send('How do brakes work?','chat');assert.equal(out.kind,'answer');assert.equal(out.usage.remaining,0);
});
test('missing or invented vehicle and repair details produce clarification without charging allowance',async t=>{
  const x=setup(t,{provider:async()=>range()});
  const out=await x.send('How much to fix my car?');
  assert.equal(out.kind,'clarify');assert.equal(out.estimate,undefined);assert.equal(out.usage.remaining,2);
});
test('provider failure and exhausted capacity cannot invent a price or spend an estimate',async t=>{
  for(const options of [{provider:async()=>{throw Error('offline');}},{provider:async()=>range(),dailyTokenBudget:0}]){
    const x=setup(t,options);await assert.rejects(x.send(),{code:'estimate_unavailable'});
    assert.equal(x.chat.usageFor(x.session.visitor_token,x.ip).remaining,2);
    assert.equal(x.chat.db.prepare("SELECT count(*) n FROM chat_requests WHERE estimate_count=1").get().n,0);
  }
});
test('prices outside the estimate object and invalid ranges are rejected with no fabricated fallback price',async t=>{
  for(const output of [{kind:'answer',reply:'Your repair will cost $450.'},{...range(),estimate:{...range().estimate,low:600,high:300}},{...range(),estimate:{...range().estimate,assumptions:['I have booked your appointment.']}}]){
    const x=setup(t,{provider:async()=>output});await assert.rejects(x.send(),{code:'estimate_unavailable'});assert.equal(x.chat.usageFor(x.session.visitor_token,x.ip).remaining,2);
  }
});
test('an unconfigured model advertises no estimates, while scripted repair collection stays honest',async t=>{
  const x=setup(t,{providerName:'deepseek',apiKey:''});
  assert.equal(x.session.canEstimate,false);assert.equal(x.session.capabilities.modelStatus,'unavailable');
  await assert.rejects(x.send(),{code:'estimate_unavailable'});
  x.advance(61000);const out=await x.send('The brakes squeal','chat');
  assert.equal(out.assist,'scripted');assert.match(out.reply,/AI answers are unavailable/);assert.equal(out.estimate,undefined);
});
test('Ollama assistant mode uses a schema that permits answers and grounded estimate objects',async()=>{
  let request;
  const provider=createOllamaProvider({model:'synthetic',fetchImpl:async(_,options)=>{request=JSON.parse(options.body);return {ok:true,text:async()=>JSON.stringify({done:true,done_reason:'stop',message:{content:JSON.stringify(range())}})};}});
  await provider({messages:[{role:'user',content:question}],canEstimate:true,mode:'estimate'});
  assert.deepEqual(request.format,ASSISTANT_SCHEMA);assert.match(request.messages[0].content,/no private shop records/i);
});
