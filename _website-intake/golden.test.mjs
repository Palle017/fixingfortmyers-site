// Golden-check harness contract. Providers are mocked; no model or network is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runGolden,scoreCase} from './golden-check.mjs';

const {cases}=JSON.parse(fs.readFileSync(new URL('./golden-cases.json',import.meta.url),'utf8'));

test('golden cases are well formed',()=>{
  assert.ok(cases.length>=20);assert.equal(new Set(cases.map(c=>c.id)).size,cases.length);
  for(const c of cases){
    assert.ok(Array.isArray(c.turns)&&c.turns.length>=1&&c.turns.length<=6,c.id);
    for(const field of Object.keys(c.expect))assert.ok(['vehicle','details','city','starts','stranded','drivable','callbackTime'].includes(field),`${c.id}: ${field}`);
    for(const field of ['starts','stranded','drivable'])if(c.expect[field]!==undefined)assert.ok(['yes','no','unknown'].includes(c.expect[field]),c.id);
  }
});

test('scoring matches keywords, exact statuses, absent fields and who answered',()=>{
  const c={expect:{vehicle:'civic',starts:'no',details:null}};
  assert.deepEqual(scoreCase(c,{vehicle:'2015 Honda Civic',starts:'no'},['model']),[]);
  assert.equal(scoreCase(c,{vehicle:'Honda',starts:'unknown',details:'x'},['model']).length,3);
  assert.match(scoreCase(c,{vehicle:'Civic',starts:'no'},['scripted'])[0],/answered by scripted/);
  assert.deepEqual(scoreCase({expect:{},assist:['rules']},{},['rules']),[]);
});

test('a model that never answers fails the check even though the script keeps collecting',async()=>{
  const {summary,results}=await runGolden({cases:cases.slice(0,3),provider:async()=>{throw Error('model offline');}});
  assert.equal(summary.passed,0);assert.equal(summary.scriptedTurns,summary.modelTurns);
  assert.ok(results.every(r=>r.assists.every(a=>a==='scripted')));
});

test('a model that copies the customer words passes the matching cases',async()=>{
  const echo=async({messages})=>{
    const text=messages.at(-1).content,vehicle=text.match(/20\d\d [A-Z][a-z]+ [A-Z][\w-]+/)?.[0]??null;
    return {kind:'intake',relevant:true,intake:{details:text,vehicle,starts:/won't start|will not start/i.test(text)?'no':null}};
  };
  const picked=cases.filter(c=>['car-audio','module-programming'].includes(c.id));
  const {summary}=await runGolden({cases:picked,provider:echo});
  assert.equal(summary.passed,picked.length);assert.equal(summary.scriptedTurns,0);
});
