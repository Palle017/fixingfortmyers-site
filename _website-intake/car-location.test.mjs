import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createLeadServers} from './server.mjs';
import {normalizeCarLocation} from './car-location.mjs';

test('location validation rejects absent addresses, invalid pins and unconfirmed device location',()=>{
  for(const value of [null,[],{}, {type:'address',address:' '},{type:'device',latitude:95,longitude:0,accuracyMeters:5,carAtDevice:true,capturedAt:new Date().toISOString()}, {type:'device',latitude:26,longitude:-81,accuracyMeters:5,carAtDevice:false,capturedAt:new Date().toISOString()}]) {
    assert.throws(()=>normalizeCarLocation(value),error=>error.status===400);
  }
});

test('serialized location records reject malformed JSON, primitive values and oversized multipart text',()=>{
  for(const value of ['[object Object]','{','null','[]','true','"address"','1','x'.repeat(4097),'{"type":"address","address":" "}']) {
    assert.throws(()=>normalizeCarLocation(value),error=>error.status===400);
  }
});

test('actual multipart voice uploads preserve address, GPS and drop-off, reject malformed location, and deduplicate retries',async t=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'pt-voice-location-'));
  const service=createLeadServers({dataDir,notifyChannels:[],alertWorker:false,maxRecordingPerIp:100});
  const ports=await service.start(0,0);
  t.after(async()=>{await service.close();fs.rmSync(dataDir,{recursive:true,force:true});});
  const audio=Buffer.alloc(44+320);
  audio.write('RIFF');audio.writeUInt32LE(audio.length-8,4);audio.write('WAVEfmt ',8);audio.writeUInt32LE(16,16);audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);audio.writeUInt32LE(16000,24);audio.writeUInt32LE(32000,28);audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);audio.write('data',36);audio.writeUInt32LE(320,40);
  const post=async(location,key)=>{
    const form=new FormData();
    for(const [name,value] of Object.entries({name:'SYNTHETIC VOICE LOCATION',phone:'2025550133',vehicle:'Synthetic car',details:'Synthetic voice concern',source:'voice',carLocation:location})) form.set(name,value);
    form.set('audio',new Blob([audio],{type:'audio/wav'}),'synthetic.wav');
    const response=await fetch(`http://127.0.0.1:${ports.publicPort}/hooks/lead/voicenote`,{method:'POST',headers:{Origin:'https://fixingfortmyers.com','Idempotency-Key':key},body:form});
    return {status:response.status,body:await response.json()};
  };
  const examples=[{type:'address',address:'123 Example St, Fort Myers'},{type:'device',latitude:26.6406,longitude:-81.8723,accuracyMeters:12,capturedAt:new Date().toISOString(),carAtDevice:true},{type:'dropoff',preferredTime:'Friday morning'}];
  for(let n=0;n<examples.length;n++){
    const key='synthetic-voice-location-'+n;
    const first=await post(JSON.stringify(examples[n]),key);assert.equal(first.status,201);assert.equal(first.body.received,true);
    const saved=JSON.parse(service.db.prepare('SELECT payload_json FROM leads WHERE id=?').get(first.body.id).payload_json);
    assert.deepEqual(saved.carLocation,examples[n]);assert.equal(saved.source,'voice');
    const retry=await post(JSON.stringify(examples[n]),key);assert.equal(retry.status,200);assert.equal(retry.body.id,first.body.id);assert.equal(retry.body.duplicate,true);
  }
  for(const invalid of ['[object Object]','{','null','[]','{"type":"address","address":""}']) assert.equal((await post(invalid,'synthetic-voice-invalid-'+Math.random())).status,400);
  assert.equal(service.db.prepare('SELECT COUNT(*) AS n FROM leads').get().n,3);
});

test('address, GPS and drop-off are saved before receipt, their location reaches mock alerts, and retries do not duplicate',async t=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'pt-car-location-'));
  const sent=[];
  const service=createLeadServers({dataDir,notifyChannels:[{name:'location-test',send:async message=>sent.push(message)}],alertWorker:false});
  const ports=await service.start(0,0);
  t.after(async()=>{await service.close();fs.rmSync(dataDir,{recursive:true,force:true});});
  const post=async(body,key)=>{
    const response=await fetch(`http://127.0.0.1:${ports.publicPort}/hooks/lead/webform`,{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://fixingfortmyers.com','Idempotency-Key':key},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  };
  const examples=[
    {type:'address',address:'123 Example St, Fort Myers'},
    {type:'device',latitude:26.6406,longitude:-81.8723,accuracyMeters:12,capturedAt:new Date().toISOString(),carAtDevice:true},
    {type:'dropoff',preferredTime:'Friday morning'}
  ];
  for(let n=0;n<examples.length;n++){
    const carLocation=examples[n];
    const lead={name:'SYNTHETIC LOCATION TEST',phone:'2025550133',vehicle:'Synthetic car',details:'Synthetic concern\nCar location: '+(carLocation.address||carLocation.type),smsConsent:false,carLocation};
    const key='synthetic-location-'+n;
    const first=await post(lead,key);assert.equal(first.status,201);
    const saved=JSON.parse(service.db.prepare('SELECT payload_json FROM leads WHERE id=?').get(first.body.id).payload_json);
    assert.deepEqual(saved.carLocation,carLocation);
    const retry=await post(lead,key);assert.equal(retry.body.id,first.body.id);assert.equal(retry.body.duplicate,true);
  }
  await service.notifier.tick();
  assert.equal(service.db.prepare('SELECT COUNT(*) AS n FROM leads').get().n,3);
  assert.equal(sent.length,3);assert.match(sent[0].text,/Location: 123 Example St/);assert.match(sent[1].text,/query=26.6406%2C-81.8723/);assert.match(sent[2].text,/Shop drop-off requested.*Friday morning/);
  const rejected=await post({name:'Synthetic',phone:'2025550133',details:'Synthetic',carLocation:{type:'address',address:''}},'synthetic-location-bad');
  assert.equal(rejected.status,400);assert.equal(service.db.prepare('SELECT COUNT(*) AS n FROM leads').get().n,3);
});
