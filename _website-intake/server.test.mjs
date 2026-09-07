import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { createLeadServers } from './server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(HERE, 'test-data');
fs.mkdirSync(fixtures, { recursive:true });
const origin = 'https://fixingfortmyers.com';
const body = (extra={}) => ({name:'Synthetic QA Customer',phone:'2395550100',vehicle:'QA sedan',service:'Diagnostic request',details:'Synthetic local test only; no real inquiry.',smsConsent:false,...extra});
async function setup(t, options={}) {
  const dataDir = fs.mkdtempSync(path.join(fixtures,'run-'));
  const app = createLeadServers({dataDir, maxPerIp:100, ...options});
  const ports = await app.start(0,0);
  let stopped = false;
  const close = async () => { if (!stopped) { stopped=true; await app.close(); } };
  t.after(close);
  return { app, close, dataDir, publicUrl:'http://127.0.0.1:'+ports.publicPort, inboxUrl:'http://127.0.0.1:'+ports.adminPort };
}
const submit = (url,payload,key=randomUUID(),extra={}) => fetch(url+'/hooks/lead/webform',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Idempotency-Key':key,...extra},body:JSON.stringify(payload)});
const wav = () => { const data=Buffer.alloc(44+320);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(16000,24);data.writeUInt32LE(32000,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(320,40);return data; };

test('receives a real HTTP request, commits it, shows it privately, and deduplicates retries',async t=>{
  const x=await setup(t); const key=randomUUID(); const payload=body();
  const r=await submit(x.publicUrl,payload,key); assert.equal(r.status,201);const result=await r.json();assert.equal(result.ok,true);assert.match(result.id,/^[a-f0-9-]{36}$/);
  const again=await submit(x.publicUrl,payload,key);assert.equal(again.status,200);assert.equal((await again.json()).id,result.id);
  const conflicting=await submit(x.publicUrl,body({details:'Different request'}),key);assert.equal(conflicting.status,409);
  const rows=await (await fetch(x.inboxUrl+'/api/leads')).json();assert.equal(rows.leads.length,1);assert.equal(rows.leads[0].name,payload.name);assert.equal(rows.leads[0].status,'new');
  assert.equal((await fetch(x.publicUrl+'/api/leads')).status,404);assert.equal((await fetch(x.publicUrl+'/')).status,404);
  const update=await fetch(x.inboxUrl+'/api/leads/'+result.id+'/status',{method:'POST',headers:{'Content-Type':'application/json',Origin:x.inboxUrl},body:JSON.stringify({status:'contacted'})});assert.equal(update.status,200);
  await x.close(); const reopened=createLeadServers({dataDir:x.dataDir}); const ports=await reopened.start(0,0);t.after(()=>reopened.close());
  const durable=await (await fetch('http://127.0.0.1:'+ports.adminPort+'/api/leads')).json();assert.equal(durable.leads[0].id,result.id);assert.equal(durable.leads[0].status,'contacted');
});

test('public API has strict origin checks, preflight, and no unauthenticated owner inbox',async t=>{
  const x=await setup(t);
  assert.equal((await submit(x.publicUrl,body(),randomUUID(),{Origin:'https://evil.example'})).status,403);
  assert.equal((await fetch(x.publicUrl+'/hooks/lead/webform',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body())})).status,403);
  const preflight=await fetch(x.publicUrl+'/hooks/lead/webform',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
  assert.equal((await fetch(x.inboxUrl+'/api/leads',{headers:{Origin:'https://fixingfortmyers.com'}})).status,403);
  const rebindingStatus=await new Promise((resolve,reject)=>{const req=http.get(x.inboxUrl+'/api/leads',{headers:{Host:'evil.example'}},r=>{r.resume();resolve(r.statusCode);});req.on('error',reject);});
  assert.equal(rebindingStatus,403);
  assert.equal((await fetch(x.publicUrl+'/chat/widget.js')).status,200);
  assert.equal((await fetch(x.publicUrl+'/healthz')).status,200);
});

test('validation rejects invalid phone, missing consent evidence, honeypot, and oversized JSON',async t=>{
  const x=await setup(t);
  assert.equal((await submit(x.publicUrl,body({phone:'abc'}))).status,400);
  assert.equal((await submit(x.publicUrl,body({smsConsent:true,smsConsentTimestamp:new Date().toISOString()}))).status,400);
  assert.equal((await submit(x.publicUrl,body({website:'spam.example'}))).status,400);
  assert.equal((await submit(x.publicUrl,body({details:'x'.repeat(50000)}))).status,413);
  const validConsent={smsConsent:true,smsConsentTimestamp:new Date().toISOString(),smsConsentVersion:'2026-09-06',smsConsentSource:'test-form',smsConsentPage:origin+'/',smsConsentDisclosure:'Synthetic consent record for local QA.'};
  const consentKey=randomUUID();const consentBody=body(validConsent);
  const received=await submit(x.publicUrl,consentBody,consentKey);assert.equal(received.status,201);const firstId=(await received.json()).id;
  const retry=await submit(x.publicUrl,consentBody,consentKey);assert.equal(retry.status,200);assert.equal((await retry.json()).id,firstId);
  const rows=await (await fetch(x.inboxUrl+'/api/leads')).json();assert.equal(rows.leads.length,1);assert.equal(rows.leads[0].smsConsentDisclosure,validConsent.smsConsentDisclosure);
});

test('rate limits apply before accepting more uploads',async t=>{
  const x=await setup(t,{maxPerIp:2});
  assert.equal((await submit(x.publicUrl,body())).status,201);
  assert.equal((await submit(x.publicUrl,body())).status,201);
  const denied=await submit(x.publicUrl,body());assert.equal(denied.status,429);assert.equal(denied.headers.get('retry-after'),'60');
});

test('multipart recording is durable, privately playable with byte ranges, and requires name',async t=>{
  const x=await setup(t);const recording=wav();const parent=await (await submit(x.publicUrl,body())).json();const requestId=parent.id;const audioKey=randomUUID();
  const makeForm=(name='Synthetic Audio Customer')=>{const form=new FormData();form.set('name',name);form.set('phone','2395550100');form.set('vehicle','QA vehicle');form.set('requestId',requestId);form.set('audio',new Blob([recording],{type:'audio/wav'}),'recording.wav');return form;};
  const uploadHeaders={Origin:origin,'Idempotency-Key':audioKey};
  const missing=await fetch(x.publicUrl+'/hooks/lead/voicenote',{method:'POST',headers:uploadHeaders,body:makeForm('')});assert.equal(missing.status,400);
  const response=await fetch(x.publicUrl+'/hooks/lead/voicenote',{method:'POST',headers:uploadHeaders,body:makeForm()});assert.equal(response.status,201);const result=await response.json();
  const retry=await fetch(x.publicUrl+'/hooks/lead/voicenote',{method:'POST',headers:uploadHeaders,body:makeForm()});assert.equal(retry.status,200);assert.equal((await retry.json()).id,result.id);
  const inbox=await(await fetch(x.inboxUrl+'/api/leads')).json();assert.equal(inbox.leads.find(row=>row.id===result.id).requestId,parent.id);
  const badParent=makeForm();badParent.set('requestId',randomUUID());assert.equal((await fetch(x.publicUrl+'/hooks/lead/voicenote',{method:'POST',headers:{Origin:origin},body:badParent})).status,400);
  const audio=await fetch(x.inboxUrl+'/api/leads/'+result.id+'/audio');assert.equal(audio.status,200);assert.deepEqual(Buffer.from(await audio.arrayBuffer()),recording);
  const range=await fetch(x.inboxUrl+'/api/leads/'+result.id+'/audio',{headers:{Range:'bytes=0-15'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,16);
  assert.equal((await fetch(x.publicUrl+'/api/leads/'+result.id+'/audio')).status,404);
});

test('legacy raw recording works and MIME-spoofed uploads fail',async t=>{
  const x=await setup(t);const headers={Origin:origin,'Content-Type':'audio/wav','X-Phone':'2395550100','X-Name':'Synthetic Raw Recording','Idempotency-Key':randomUUID()};
  const bad=await fetch(x.publicUrl+'/hooks/lead/voicenote',{method:'POST',headers,body:Buffer.alloc(50)});assert.equal(bad.status,415);
  const valid=await fetch(x.publicUrl+'/hooks/lead/voicenote',{method:'POST',headers,body:wav()});assert.equal(valid.status,201);
});
