// Scripted fallback contract. Providers are mocked; no model or network is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createPublicChat,createOllamaProvider,INTAKE_SCHEMA} from './public-chat.mjs';

function open(t,options){
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'pt-scripted-'));
  const chat=createPublicChat({dataDir,...options});
  t.after(()=>{chat.close();fs.rmSync(dataDir,{recursive:true,force:true});});
  const visitor=ip=>{const token=chat.session({},ip).visitor_token;return message=>chat.message({visitor_token:token,request_id:randomUUID(),message,mode:'chat'},ip);};
  return {chat,visitor};
}

test('a model outage still walks the customer through every question using their own words',async t=>{
  let calls=0;
  const {chat,visitor}=open(t,{provider:async()=>{calls++;throw Object.assign(Error('ECONNREFUSED'),{status:503,code:'chat_unavailable'});}});
  const send=visitor('198.51.100.40');
  const first=await send('Transmission slips when it shifts into third');
  assert.equal(first.ok,true);assert.equal(first.assist,'scripted');assert.equal(first.intake.details,'Transmission slips when it shifts into third');assert.equal(first.nextField,'vehicle');
  assert.equal((await send('2012 Ford F-150')).intake.vehicle,'2012 Ford F-150');
  const unclear=await send('it is hard to say');assert.equal(unclear.nextField,'starts');assert.match(unclear.reply,/Does the vehicle start/);
  assert.equal((await send('No idea, my son drove it last')).intake.starts,'unknown');
  assert.equal((await send('nope, I am at home')).intake.stranded,'no');
  const last=await send('Cape Coral 33904');
  assert.equal(last.intake.city,'Cape Coral 33904');assert.equal(last.ready,true);assert.match(last.reply,/Add your name and number/);
  assert.equal(calls,6,'every non-rule answer tries the model first');
  const charged=chat.db.prepare("SELECT sum(budget) n FROM chat_requests WHERE state='done'").get().n;assert.ok(charged>0,'a failed model call is still charged to the daily budget');
});

test('bad model output falls back to the scripted answer instead of an error',async t=>{
  const {visitor}=open(t,{provider:async()=>({kind:'intake',relevant:true,intake:{recipient:'attacker@example.test'},extra:true})});
  const out=await visitor('198.51.100.41')('My brakes squeal when I stop');
  assert.equal(out.assist,'scripted');assert.equal(out.intake.details,'My brakes squeal when I stop');assert.equal(out.intake.recipient,undefined);assert.equal(out.recipient,undefined);
});

test('scripted answers never store markup and still show the hazard warning',async t=>{
  const {visitor}=open(t,{provider:async()=>{throw Error('down');}});
  const send=visitor('198.51.100.42');
  assert.equal((await send('<img src=x> it will not start')).intake.details,undefined);
  const hazard=await send('I smell gas under the hood');assert.match(hazard.reply,/Stop using the vehicle/);assert.equal(hazard.assist,'rules');
});

test('when the one GPU slot is busy, a second customer gets the scripted flow without waiting',async t=>{
  let release,calls=0;
  const hold=new Promise(resolve=>{release=resolve;});
  const {chat,visitor}=open(t,{providerName:'ollama',provider:async()=>{calls++;await hold;return {kind:'intake',relevant:true,intake:{details:'overheats in traffic'}};}});
  const firstReply=visitor('198.51.100.43')('It overheats in traffic');
  await new Promise(setImmediate);
  const second=await visitor('203.0.113.9')('Battery keeps dying overnight');
  assert.equal(second.assist,'scripted');assert.equal(second.intake.details,'Battery keeps dying overnight');assert.equal(calls,1);
  release();assert.equal((await firstReply).assist,'model');
  assert.equal(chat.db.prepare("SELECT budget FROM chat_requests WHERE message=?").get('Battery keeps dying overnight').budget,0);
});

test('past the daily model budget, chats keep working in scripted mode at no token cost',async t=>{
  let calls=0;
  const {chat,visitor}=open(t,{maxDailyRequests:1,provider:async()=>{calls++;return {kind:'intake',relevant:true,intake:{details:'no heat'}};}});
  assert.equal((await visitor('198.51.100.44')('The heater blows cold, no heat')).assist,'model');
  const over=await visitor('203.0.113.10')('A/C blows warm at idle');
  assert.equal(over.ok,true);assert.equal(over.assist,'scripted');assert.equal(calls,1);
  assert.equal(chat.db.prepare("SELECT budget FROM chat_requests WHERE message=?").get('A/C blows warm at idle').budget,0);
});

test('the Ollama schema covers exactly the intake fields and can be switched back to plain JSON',async()=>{
  assert.deepEqual(Object.keys(INTAKE_SCHEMA.properties.intake.properties).sort(),['callbackTime','city','details','drivable','starts','stranded','vehicle']);
  assert.equal(INTAKE_SCHEMA.additionalProperties,false);assert.equal(INTAKE_SCHEMA.properties.intake.additionalProperties,false);
  let body;
  await createOllamaProvider({model:'m',format:'json',fetchImpl:async(url,options)=>{body=JSON.parse(options.body);return {ok:true,text:async()=>JSON.stringify({done:true,done_reason:'stop',message:{content:'{}'}})};}})({messages:[]});
  assert.equal(body.format,'json');
});

test('urgency backstop: clear wording fills starts/stranded, negations and look-alikes never do',async t=>{
  const unknown=async()=>({kind:'intake',relevant:true,intake:{starts:'unknown',stranded:'unknown'}});
  const cases=[
    ['My car won’t start and I’m stranded at Publix','no','yes'],
    ["Check engine light is stuck on and the Civic won't start",'no','unknown'],
    ['will not start but I am not stranded','no','unknown'],
    ['AC is stuck on hot','unknown','unknown'],
    ['Battery died last week, now it starts fine','unknown','unknown'],
  ];
  for(const [i,[said,starts,stranded]] of cases.entries()){
    const {visitor}=open(t,{provider:unknown});
    const out=await visitor('198.51.100.'+(60+i))(said);
    assert.equal(out.intake.starts,starts,said);assert.equal(out.intake.stranded,stranded,said);
  }
});
