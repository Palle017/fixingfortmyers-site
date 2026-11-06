// Read-only production release verification. Never submits an inquiry or contacts a customer.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {checkCleanPage} from './check-clean-structure.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const expected=process.argv[2],version='20261106-bayone-public';
const build=JSON.parse(execFileSync('gh',['api','repos/Palle017/fixingfortmyers-site/pages/builds/latest'],{encoding:'utf8'}));
assert.equal(build.status,'built','Pages build is not complete');
if(expected)assert.equal(build.commit,expected,'Pages has not published expected commit');
const pageFiles=fs.readdirSync(root).filter(name=>name.endsWith('.html'));
const assets=['base.css','style.css','site-updates.css','clean-layout.css','home-clean.css','service-pages.css','proof.css','repair-guides.css','site.js','contact-config.js','bay-one-config.js','bay-one-widget.js','bay-one-widget.css'];
const bayOneImages=['assets/bay-one-character-states-20260908.jpg','assets/bay-one-wordmark-20260908.jpg','assets/bay-one-b1-logo-20260908.jpg'];
let bayOneEndpoint='';
const checks=[],pageChecks=[];
const hash=value=>createHash('sha256').update(Buffer.isBuffer(value)?value:value.replace(/\r\n/g,'\n')).digest('hex');
async function readBinary(urlPath,status=200){
  const response=await fetch('https://fixingfortmyers.com'+urlPath,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
  const body=Buffer.from(await response.arrayBuffer());assert.equal(response.status,status,urlPath);
  checks.push({path:urlPath,status:response.status,bytes:body.length});return body;
}
async function read(urlPath,status=200){
  const response=await fetch('https://fixingfortmyers.com'+urlPath,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
  const body=await response.text();
  assert.equal(response.status,status,urlPath);
  checks.push({path:urlPath,status:response.status,bytes:Buffer.byteLength(body)});
  return body;
}
for(const file of pageFiles){
  const urlPath=file==='index.html'?'/':'/'+file.replace(/\.html$/,'');
  const body=await read(urlPath);
  pageChecks.push(checkCleanPage(file,body));
  if(/(?:site\.js|clean-layout\.css|home-clean\.css)/.test(body))assert.ok(body.includes(`v=${version}`),`${urlPath}: release asset version`);
  assert.equal(hash(body),hash(fs.readFileSync(path.join(root,file),'utf8')),`${urlPath}: published HTML differs from this release`);
}
for(const file of assets){
  const body=await read('/'+file+'?v='+version);
  assert.equal(hash(body),hash(fs.readFileSync(path.join(root,file),'utf8')),`${file}: published asset differs from this release`);
  if(file==='contact-config.js')assert.match(body,/endpoint:\s*'https:\/\/perfect-timing-cloud-intake\.prudhvi-pallempati\.chatgpt\.site'/);
  if(file==='bay-one-config.js'){
    assert.match(body,/enabled:\s*true/);assert.doesNotMatch(body,/(?:token|password|secret)\s*:/i);
    const endpoint=body.match(/endpoint:\s*'([^']+)'/);assert.ok(endpoint);assert.equal(endpoint[1],'https://bay-one-website-assistant.ubnvs1.chatgpt.site');bayOneEndpoint=endpoint[1];
  }
}
const bayOneResponse=await fetch(new URL('/healthz',bayOneEndpoint),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
assert.equal(bayOneResponse.status,200,'Bay One hosted health');
const bayOneHealth=await bayOneResponse.json();
assert.equal(bayOneHealth.ok,true);assert.equal(bayOneHealth.chat,'ready');
assert.equal(bayOneHealth.capabilities?.questions,true);assert.equal(bayOneHealth.capabilities?.roughEstimates,true);
for(const file of bayOneImages){const body=await readBinary('/'+file+'?v='+version);assert.equal(hash(body),hash(fs.readFileSync(path.join(root,file))),file+': published asset differs from this release');}
const sitemap=await read('/sitemap.xml');
assert.match(sitemap,/repair-guide-battery-keeps-dying/);assert.match(sitemap,/repair-guide-car-overheating/);
for(const urlPath of ['/_website-intake/server.mjs','/tools/check-clean-structure.mjs','/docs/COMPANY-UPDATE.md','/source-materials/inventory.json','/deploy/vm101/README.md'])await read(urlPath,404);
const evidence={at:new Date().toISOString(),site:'https://fixingfortmyers.com',commit:build.commit,pagesStatus:build.status,version,checks,pages:pageChecks,bayOne:{chat:bayOneHealth.chat,questions:bayOneHealth.capabilities?.questions,roughEstimates:bayOneHealth.capabilities?.roughEstimates,intake:bayOneHealth.capabilities?.intake,media:bayOneHealth.media,modelStatus:bayOneHealth.capabilities?.modelStatus},contact:'online receiver configured; customer-sent native message fallback',productionSubmissionVerified:false,realMessagesSent:false,backendChanged:false};
fs.mkdirSync(path.join(root,'docs/evidence'),{recursive:true});
fs.writeFileSync(path.join(root,'docs/evidence/production.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({at:evidence.at,commit:evidence.commit,pages:pageChecks.length,compactServiceHeroes:pageChecks.filter(page=>page.serviceHero).length,assets:assets.length,privatePathsExcluded:5,productionSubmissionVerified:false,realMessagesSent:false},null,2));
