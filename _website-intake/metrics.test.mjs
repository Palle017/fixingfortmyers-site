import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createLeadServers} from './server.mjs';
import {createPublicChat} from './public-chat.mjs';

test('visitor events deduplicate, distinguish unique browsers, enforce origin, and persist',async()=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bayone-counters-'));
  let app=createLeadServers({dataDir});
  try {
    let ports=await app.start(0,0);
    const base='http://127.0.0.1:'+ports.publicPort,admin='http://127.0.0.1:'+ports.adminPort;
    const event={visitor_id:randomUUID(),event_id:randomUUID(),page:'/brakes?private=excluded'};
    const send=(body,origin='https://fixingfortmyers.com')=>fetch(base+'/hooks/analytics/visit',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await send(event)).status,200);
    assert.equal((await send(event)).status,200);
    assert.equal((await send({...event,event_id:randomUUID()})).status,200);
    assert.equal((await send({...event,visitor_id:randomUUID(),event_id:randomUUID()})).status,200);
    assert.equal((await send(event,'https://evil.example')).status,403);
    assert.equal((await send({visitor_id:{bad:true}})).status,400);
    assert.equal((await fetch(base+'/api/metrics')).status,404);
    assert.equal((await fetch(admin+'/api/metrics',{headers:{Origin:'https://fixingfortmyers.com'}})).status,403);
    const read=async url=>(await (await fetch(url+'/api/metrics')).json()).metrics;
    const metrics=await read(admin);
    assert.equal(metrics.visitors.total_unique,2);assert.equal(metrics.visitors.total_events,3);
    assert.equal(metrics.visitors.today_unique,2);assert.equal(metrics.visitors.today_events,3);
    assert.equal(app.db.prepare('SELECT page FROM website_visit_events LIMIT 1').get().page,'/brakes');
    await app.close();app=createLeadServers({dataDir});ports=await app.start(0,0);
    assert.equal((await read('http://127.0.0.1:'+ports.adminPort)).visitors.total_events,3);
  } finally {await app.close();}
});

test('completed AI counts survive retries, midnight, restart, and seven-day cleanup',async()=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bayone-chat-counters-'));
  let now=Date.parse('2026-09-09T03:59:58Z'),fail=false;
  const provider=async()=>{if(fail)throw Error('offline');return {kind:'answer',reply:'We can help with brakes and diagnostics.'};};
  let app=createPublicChat({dataDir,now:()=>now,provider});
  try {
    const ip='198.51.100.31',token=app.session({},ip).visitor_token;
    const input={visitor_token:token,request_id:randomUUID(),message:'What services do you offer?',mode:'chat'};
    await app.message(input,ip);await app.message(input,ip);
    assert.deepEqual({...app.db.prepare('SELECT * FROM chat_metric_days').get()},{day:'2026-09-08',messages:1,estimates:0});
    now+=5000;await app.message({...input,request_id:randomUUID()},ip);
    fail=true;await assert.rejects(app.message({...input,request_id:randomUUID()},ip));
    assert.equal(app.db.prepare('SELECT sum(messages) n FROM chat_metric_days').get().n,2);
    app.close();now+=8*86400000;app=createPublicChat({dataDir,now:()=>now,provider});
    assert.equal(app.db.prepare('SELECT count(*) n FROM chat_requests').get().n,0);
    assert.equal(app.db.prepare('SELECT sum(messages) n FROM chat_metric_days').get().n,2);
  } finally {app.close();}
});
