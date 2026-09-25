// Read-only production release verification. Never submits an inquiry.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const expected = process.argv[2];
const build=JSON.parse(execFileSync('gh',['api','repos/Palle017/fixingfortmyers-site/pages/builds/latest'],{encoding:'utf8'}));
assert.equal(build.status,'built','Pages build is not complete');
if(expected)assert.equal(build.commit,expected,'Pages has not published expected commit');
const paths=['/','/no-start-diagnosis-fort-myers','/cooling-system-repair-fort-myers','/check-engine-light-diagnosis-fort-myers','/repair-guides','/repair-guide-car-wont-start','/repair-guide-ac-warm-at-idle','/repair-guide-battery-keeps-dying','/repair-guide-car-overheating','/repair-guide-flashing-check-engine-light','/bay-one-config.js','/contact-config.js','/sitemap.xml','/_website-intake/server.mjs','/docs/COMPANY-UPDATE.md','/source-materials/inventory.json'];
const checks=[];
for(const path of paths){
  const response=await fetch('https://fixingfortmyers.com'+path,{headers:{'Cache-Control':'no-cache'}});
  const body=await response.text();
  const privatePath=path.startsWith('/_website-intake/')||path.startsWith('/docs/')||path.startsWith('/source-materials/');
  assert.equal(response.status,privatePath?404:200,path);
  if(path==='/'||path.includes('repair-guide')||path==='/no-start-diagnosis-fort-myers'){
    assert.match(body,/24\/7/);assert.match(body,/Bay One AI intake is currently offline/);
    assert.match(body,/20260924-growth-v2/);
  }
  if(path==='/bay-one-config.js')assert.match(body,/enabled:\s*false/);
  if(path==='/contact-config.js')assert.match(body,/endpoint:\s*''/);
  if(path==='/sitemap.xml'){assert.match(body,/repair-guide-battery-keeps-dying/);assert.match(body,/repair-guide-car-overheating/);assert.match(body,/repair-guide-flashing-check-engine-light/);}
  checks.push({path,status:response.status,bytes:Buffer.byteLength(body)});
}
const evidence={at:new Date().toISOString(),site:'https://fixingfortmyers.com',commit:build.commit,pagesStatus:build.status,checks,bayOne:'disabled',contact:'customer-sent native SMS draft',realMessagesSent:false,backendActivated:false};
fs.mkdirSync('docs/evidence',{recursive:true});fs.writeFileSync('docs/evidence/production.json',JSON.stringify(evidence,null,2)+'\n');console.log(evidence);
