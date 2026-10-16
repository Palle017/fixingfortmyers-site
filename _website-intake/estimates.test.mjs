// Synthetic estimator contracts: no live customer, receiver or provider is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createPublicChat,createOllamaProvider,ASSISTANT_SCHEMA} from './public-chat.mjs';

const question='How much might it cost for a 2015 Honda Civic to replace front brake pads and rotors?';
const range=()=>({kind:'estimate',estimate:{low:300,high:600,vehicle:'2015 Honda Civic',repair:'replace front brake pads and rotors',assumptions:['Typical aftermarket parts and normal access; diagnosis and tax may vary.']}});
function setup(t,options={}){
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'pt-estimator-'));
  let now=Date.parse('2026-10-12T16:00:00Z');
  const chat=createPublicChat({dataDir,now:()=>now,...options});
  t.after(()=>{chat.close();fs.rmSync(dataDir,{recursive:true,force:true});});
  const ip='198.51.100.77',session=chat.session({},ip);
  const send=(message=question,mode='chat',id=randomUUID(),token=session.visitor_token,network=ip)=>chat.message({visitor_token:token,request_id:id,message,mode},network);
  return {chat,send,session,ip,advance:ms=>{now+=ms;}};
}
test('ordinary questions and arithmetic need no special mode or estimate',async t=>{
  const x=setup(t,{provider:async()=>({kind:'answer',reply:'Two plus two equals 4.'})});
  assert.equal(x.session.canEstimate,true);assert.equal(x.session.capabilities.modelStatus,'configured_unverified');
  const out=await x.send('What is 2 plus 2?');
  assert.equal(out.kind,'answer');assert.equal(out.usage.remaining,null);
});
test('natural price questions produce planning ranges without quota, preserving request idempotency',async t=>{
  let calls=0;
  const x=setup(t,{provider:async({mode,canEstimate})=>{calls++;assert.equal(mode,'estimate');assert.equal(canEstimate,true);return range();}});
  const id=randomUUID(),a=await x.send(question,'chat',id);
  assert.equal(a.estimate.low,300);assert.equal(a.usage.limit,null);assert.match(a.reply,/not a confirmed shop quote/);
  const retry=await x.send(question,'chat',id);
  assert.equal(retry.duplicate,true);assert.equal(calls,1);
  assert.equal((await x.send()).kind,'estimate');
  assert.equal((await x.send()).kind,'estimate');
  const secondVisitor=x.chat.session({},x.ip).visitor_token;
  assert.equal((await x.send(question,'chat',randomUUID(),secondVisitor)).kind,'estimate');
  assert.equal(calls,4);
});
test('price requests and general answers share one chat stream',async t=>{
  const x=setup(t,{provider:async({messages})=>messages.at(-1).content==='How do brakes work?'?{kind:'answer',reply:'Brake pads press against the rotors to slow the wheels.'}:range()});
  await x.send(question);await x.send(question);await x.send(question);
  const out=await x.send('How do brakes work?');
  assert.equal(out.kind,'answer');assert.equal(out.usage.remaining,null);
});
test('insufficient vehicle and repair details trigger clarification, not a made-up price',async t=>{
  const x=setup(t,{provider:async()=>range()});
  const out=await x.send('How much to fix my car?');
  assert.equal(out.kind,'clarify');assert.equal(out.estimate,undefined);
});
test('provider failures and exhausted model capacity fall back to repair intake without fabricating prices',async t=>{
  for(const options of [{provider:async()=>{throw Error('offline');}},{provider:async()=>range(),dailyTokenBudget:0}]){
    const x=setup(t,options);const out=await x.send();
    assert.equal(out.assist,'scripted');assert.equal(out.estimate,undefined);
    assert.match(out.reply,/AI answers are unavailable/);
    assert.equal(x.chat.db.prepare("SELECT count(*) n FROM chat_requests WHERE estimate_count=1").get().n,0);
  }
});
test('invalid ranges and price claims outside estimate objects never surface as prices',async t=>{
  for(const output of [{kind:'answer',reply:'Your repair will cost $450.'},{...range(),estimate:{...range().estimate,low:600,high:300}},{...range(),estimate:{...range().estimate,assumptions:['I have booked your appointment.']}}]){
    const x=setup(t,{provider:async()=>output});const out=await x.send();
    assert.equal(out.assist,'scripted');assert.equal(out.estimate,undefined);
    assert.doesNotMatch(out.reply,/\$450/);
  }
});
test('unconfigured provider transparently falls back to collecting a repair request',async t=>{
  const x=setup(t,{providerName:'deepseek',apiKey:''});
  assert.equal(x.session.canEstimate,false);assert.equal(x.session.capabilities.modelStatus,'unavailable');
  const out=await x.send();
  assert.equal(out.assist,'scripted');assert.equal(out.estimate,undefined);
  assert.match(out.reply,/AI answers are unavailable/);
});
test('Ollama assistant mode uses a schema that permits answers and preliminary estimates',async()=>{
  let request;
  const provider=createOllamaProvider({model:'synthetic',fetchImpl:async(_,options)=>{request=JSON.parse(options.body);return {ok:true,text:async()=>JSON.stringify({done:true,done_reason:'stop',message:{content:JSON.stringify(range())}})};}});
  await provider({messages:[{role:'user',content:question}],canEstimate:true,mode:'estimate'});
  assert.deepEqual(request.format,ASSISTANT_SCHEMA);assert.match(request.messages[0].content,/no private shop records/i);
});
