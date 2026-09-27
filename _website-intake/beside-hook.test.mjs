import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createLeadServers} from './server.mjs';

const origin='https://fixingfortmyers.com';
const token='x'.repeat(32);
const fakeChannel=name=>{const sent=[];return {name,sent,async send(message){sent.push(message);return {id:name};}};};
const count=(db,table)=>db.prepare(`SELECT count(*) n FROM ${table}`).get().n;
const hasStatus=status=>err=>{assert.equal(err.status,status,err.message);return true;};
async function setup(t,options={}){
  const channel=fakeChannel('email');
  const app=createLeadServers({dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'pt-beside-')),besideToken:token,notifyChannels:[channel],alertWorker:false,...options});
  const ports=await app.start(0,0);t.after(()=>app.close());
  const base='http://127.0.0.1:'+ports.publicPort,admin='http://127.0.0.1:'+ports.adminPort;
  return {app,db:app.db,desk:app.desk,channel,base,admin,
    beside:(body,{key=token,form=false,method='POST'}={})=>fetch(`${base}/hooks/lead/beside/${key}`,{method,
      ...(method==='POST'?{headers:{'Content-Type':form?'application/x-www-form-urlencoded':'application/json'},body:form?new URLSearchParams(body).toString():JSON.stringify(body)}:{})}),
    webform:input=>fetch(base+'/hooks/lead/webform',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify(input)}),
    inbox:async()=>(await(await fetch(admin+'/api/leads')).json()).leads};
}
const call={phone:'(239) 555-0142',name:'Synthetic Beside Caller',summary:'Synthetic test only. Brakes grinding on a 2012 F-150.',type:'call'};

// ---------- Beside webhook through the receiver ----------

test('Beside call creates a manual lead (source beside_call) and queues its notification',async t=>{
  const x=await setup(t);
  const response=await x.beside(call);
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.ok,true);assert.equal(result.duplicate,false);assert.match(result.id,/^[a-f0-9-]{36}$/);
  const row=x.db.prepare('SELECT kind,status,payload_json FROM leads WHERE id=?').get(result.id);
  assert.equal(row.kind,'manual');assert.equal(row.status,'new');
  const payload=JSON.parse(row.payload_json);
  assert.equal(payload.source,'beside_call');assert.equal(payload.name,call.name);assert.equal(payload.phone,call.phone);assert.equal(payload.details,call.summary);
  assert.deepEqual([x.desk.pipeline(result.id).stage,x.desk.pipeline(result.id).source],['new','beside_call']);
  assert.deepEqual(x.db.prepare('SELECT channel FROM lead_notifications WHERE lead_id=?').all(result.id).map(r=>r.channel),['email']);
  await x.app.notifier.tick();
  assert.equal(x.channel.sent.length,1);
  assert.equal(x.channel.sent[0].title,'New repair request: vehicle not given');
  assert.match(x.channel.sent[0].text,/Name: Synthetic Beside Caller/);
  assert.match(x.channel.sent[0].text,/Brakes grinding/);
  const lead=(await x.inbox()).find(l=>l.id===result.id);
  assert.equal(lead.pipeline.source,'beside_call');
  assert.deepEqual(lead.notifications.map(n=>[n.channel,n.state]),[['email','sent']]);
});

test('same phone within 7 days is a touch on the existing lead, not a new lead; after 7 days it is new',async t=>{
  const x=await setup(t);
  const first=await(await x.beside(call)).json();
  await x.app.notifier.tick();
  const again=await(await x.beside({phone:'+1 239-555-0142',summary:'Synthetic follow-up text.',type:'sms'})).json();
  assert.deepEqual(again,{ok:true,id:first.id,duplicate:true});
  assert.equal(count(x.db,'leads'),1);
  assert.equal(count(x.db,'lead_notifications'),1,'a repeat contact does not alert again');
  await x.app.notifier.tick();
  assert.equal(x.channel.sent.length,1);
  const touches=x.desk.touches(first.id);
  assert.deepEqual(touches.map(r=>[r.channel,r.note]),[['beside_text','Synthetic follow-up text.']]);
  assert.deepEqual((await x.inbox())[0].touches.map(r=>r.channel),['beside_text']);
  // A website lead from the same number also absorbs the Beside call.
  const web=await(await x.webform({name:'Synthetic Web Customer',phone:'2395550177',vehicle:'QA sedan',details:'Synthetic test only.',smsConsent:false})).json();
  const webCall=await(await x.beside({...call,phone:'239.555.0177'})).json();
  assert.deepEqual([webCall.id,webCall.duplicate],[web.id,true]);
  assert.equal(count(x.db,'leads'),2);
  // Older than 7 days: the same number is a new inquiry.
  x.db.prepare('UPDATE leads SET received_at=? WHERE id=?').run(new Date(Date.now()-8*86400000).toISOString(),first.id);
  const later=await(await x.beside(call)).json();
  assert.equal(later.duplicate,false);assert.notEqual(later.id,first.id);
  assert.equal(count(x.db,'leads'),3);
  assert.equal(count(x.db,'lead_notifications'),3);
});

test('form-encoded Beside events work and message events become beside_text',async t=>{
  const x=await setup(t);
  const response=await x.beside({from:'2395550155',contact_name:'Synthetic Form Caller',body:'Synthetic test only. Can you check my AC?',event:'message'},{form:true});
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.duplicate,false);
  const payload=JSON.parse(x.db.prepare('SELECT payload_json FROM leads WHERE id=?').get(result.id).payload_json);
  assert.deepEqual([payload.name,payload.phone,payload.details,payload.source],['Synthetic Form Caller','2395550155','Synthetic test only. Can you check my AC?','beside_text']);
  assert.equal(x.desk.pipeline(result.id).source,'beside_text');
  assert.equal(count(x.db,'lead_notifications'),1);
});

test('Beside hook: wrong token 404, bad method 405, invalid JSON 400, nothing saved',async t=>{
  const x=await setup(t);
  assert.equal((await x.beside(call,{key:'y'.repeat(32)})).status,404);
  assert.equal((await x.beside(call,{key:token+'x'})).status,404);
  assert.equal((await x.beside(call,{key:'x'.repeat(10)})).status,404,'too short to match the route');
  assert.equal((await x.beside(null,{method:'GET'})).status,405);
  assert.equal((await fetch(`${x.base}/hooks/lead/beside/${token}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{not json'})).status,400);
  assert.equal(count(x.db,'leads'),0);assert.equal(count(x.db,'lead_notifications'),0);
});

test('Beside hook is closed (404) when no token, or a token under 24 characters, is configured',async t=>{
  const none=await setup(t,{besideToken:''});
  assert.equal((await none.beside(call)).status,404);
  assert.throws(()=>none.desk.besideHook('',call),hasStatus(404));
  const short=await setup(t,{besideToken:'z'.repeat(20)});
  assert.equal((await short.beside(call,{key:'z'.repeat(24)})).status,404);
  assert.throws(()=>short.desk.besideHook('z'.repeat(20),call),hasStatus(404));
  assert.equal(count(none.db,'leads')+count(short.db,'leads'),0);
});

// Regression: Beside calls and texts must not be labelled as website form leads.
test('Beside notification says where the lead came from',async t=>{
  const x=await setup(t);
  await x.beside(call);await x.app.notifier.tick();
  assert.match(x.channel.sent[0].text,/Came from: (?:Phone call|Text) \(Beside\)/);
});

// ---------- desk.addManual / setStage ----------

test('desk.addManual requires a name or phone, a valid phone, and a real, non-future date',async t=>{
  const x=await setup(t);
  assert.throws(()=>x.desk.addManual({}),err=>err.status===400&&/name or a phone/.test(err.message));
  assert.throws(()=>x.desk.addManual({name:'   ',phone:''}),hasStatus(400));
  for(const phone of ['12345','abc','1234567890123456'])assert.throws(()=>x.desk.addManual({name:'Synthetic',phone}),err=>err.status===400&&/valid phone/.test(err.message),phone);
  for(const receivedAt of [new Date(Date.now()+3600000).toISOString(),'not a date',new Date(Date.now()-401*86400000).toISOString()])assert.throws(()=>x.desk.addManual({name:'Synthetic',receivedAt}),err=>err.status===400&&/valid date/.test(err.message),receivedAt);
  assert.equal(count(x.db,'leads'),0);
  const walkIn=x.desk.addManual({name:'Synthetic Walk-in',source:'referral',receivedAt:new Date(Date.now()-2*86400000).toISOString()});
  assert.equal(walkIn.ok,true);
  assert.deepEqual([x.desk.pipeline(walkIn.id).stage,x.desk.pipeline(walkIn.id).source],['new','referral']);
  const phoneOnly=x.desk.addManual({phone:'+1 (239) 555-0199',source:'myspace'});
  assert.equal(JSON.parse(x.db.prepare('SELECT payload_json FROM leads WHERE id=?').get(phoneOnly.id).payload_json).name,'Unknown caller');
  assert.equal(x.desk.pipeline(phoneOnly.id).source,'other','unknown sources fall back to other');
  // Admin API path reaches the same validation.
  const api=await fetch(x.admin+'/api/desk/leads',{method:'POST',headers:{'Content-Type':'application/json',Origin:x.admin},body:JSON.stringify({phone:'123'})});
  assert.equal(api.status,400);
  assert.equal(count(x.db,'leads'),2);
});

test('setStage estimate_sent requires a Tony-approved price (estimateLow + tonyApproved === true)',async t=>{
  const x=await setup(t);
  const {id}=x.desk.addManual({name:'Synthetic Estimate Customer',phone:'2395550133'});
  const attempt=input=>()=>x.desk.setStage(id,{stage:'estimate_sent',...input});
  assert.throws(attempt({}),err=>err.status===400&&/price Tony approved/.test(err.message));
  assert.throws(attempt({estimateLow:''}),hasStatus(400));
  assert.throws(attempt({estimateLow:300}),err=>err.status===400&&/Confirm that Tony approved/.test(err.message));
  assert.throws(attempt({estimateLow:300,tonyApproved:'true'}),hasStatus(400));
  assert.throws(attempt({estimateLow:300,estimateHigh:200,tonyApproved:true}),err=>err.status===400&&/high end/.test(err.message));
  assert.throws(attempt({estimateLow:-5,tonyApproved:true}),err=>err.status===400&&/dollar amount/.test(err.message));
  assert.equal(x.desk.pipeline(id).stage,'new','rejected attempts change nothing');
  assert.equal(x.desk.touches(id).length,0);
  // Admin API rejects the unapproved price too.
  const api=await fetch(`${x.admin}/api/leads/${id}/stage`,{method:'POST',headers:{'Content-Type':'application/json',Origin:x.admin},body:JSON.stringify({stage:'estimate_sent',estimateLow:300})});
  assert.equal(api.status,400);
  assert.deepEqual(x.desk.setStage(id,{stage:'estimate_sent',estimateLow:300,estimateHigh:450,tonyApproved:true,estimateNote:'Synthetic front pads'}),{ok:true,stage:'estimate_sent'});
  const row=x.desk.pipeline(id);
  assert.deepEqual([row.stage,row.estimate_low,row.estimate_high,row.estimate_note,row.estimate_approved_by],['estimate_sent',300,450,'Synthetic front pads','Tony']);
  assert.ok(row.estimate_sent_at&&row.contacted_at,'estimate implies contact');
  assert.equal(x.db.prepare('SELECT status FROM leads WHERE id=?').get(id).status,'contacted');
  assert.deepEqual(x.desk.touches(id).map(r=>[r.channel,r.note]),[['stage','estimate_sent']]);
  assert.throws(()=>x.desk.setStage(randomUUID(),{stage:'contacted'}),hasStatus(404));
  assert.throws(()=>x.desk.setStage(id,{stage:'archived'}),hasStatus(400));
});

// Regression: a rejected stage rolls back the manual entry, so a retry does not duplicate it.
test('addManual with an unapproved estimate_sent stage is rejected without saving a lead',async t=>{
  const x=await setup(t);
  assert.throws(()=>x.desk.addManual({name:'Synthetic Staged',phone:'2395550144',stage:'estimate_sent'}),hasStatus(400));
  assert.equal(count(x.db,'leads'),0);
});

test('wrong Beside tokens cannot use up the rate limit that real Beside events rely on',async t=>{
  const x=await setup(t);
  for(let i=0;i<125;i++)assert.equal((await x.beside(call,{key:'y'.repeat(32)})).status,404);
  assert.equal((await x.beside(call)).status,200);
});

test('inbox status buttons move the desk pipeline; lost never counts as contacted',async t=>{
  const x=await setup(t);
  const {id}=await(await x.webform({name:'Synthetic',phone:'2395550177',vehicle:'2015 Civic',details:'Synthetic test only',city:'Fort Myers',starts:'yes',stranded:'no',website:''})).json();
  const status=s=>fetch(`${x.admin}/api/leads/${id}/status`,{method:'POST',headers:{'Content-Type':'application/json',Origin:x.admin},body:JSON.stringify({status:s})});
  assert.equal((await status('contacted')).status,200);
  assert.equal(x.desk.pipeline(id).stage,'contacted');assert.equal(x.desk.metrics().totals.contacted,1);
  assert.equal((await status('closed')).status,200);
  assert.equal(x.desk.pipeline(id).stage,'lost');
  const lost=x.desk.addManual({name:'Never reached',phone:'2395550178',stage:'lost',lostReason:'wrong number'});
  assert.equal(x.desk.pipeline(lost.id).contacted_at,null);
});
