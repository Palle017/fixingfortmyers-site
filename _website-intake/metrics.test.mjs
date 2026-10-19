import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createLeadServers} from './server.mjs';

test('visitor events deduplicate, distinguish unique browsers, enforce origin, and persist',async()=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'intake-counters-'));
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
