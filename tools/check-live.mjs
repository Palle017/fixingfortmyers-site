// Read-only production release verification. Never submits an inquiry or contacts a customer.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {checkCleanPage} from './check-clean-structure.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const expected=process.argv[2],version='20261001-workshop';
const build=JSON.parse(execFileSync('gh',['api','repos/Palle017/fixingfortmyers-site/pages/builds/latest'],{encoding:'utf8'}));
assert.equal(build.status,'built','Pages build is not complete');
if(expected)assert.equal(build.commit,expected,'Pages has not published expected commit');
const pageFiles=fs.readdirSync(root).filter(name=>name.endsWith('.html'));
const assets=['base.css','style.css','site-updates.css','clean-layout.css','home-clean.css','service-pages.css','proof.css','repair-guides.css','site.js','bay-one-config.js','bay-one-widget.js','bay-one-widget.css','contact-config.js'];
const checks=[],pageChecks=[];
const hash=text=>createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex');
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
  if(file==='bay-one-config.js'){
    assert.match(body,/enabled:\s*true/);assert.match(body,/autoOpen:\s*false/);
    assert.match(body,/p15g2\.tail68bd87\.ts\.net:10000/);
  }
  if(file==='contact-config.js')assert.match(body,/endpoint:\s*'https:\/\/perfect-timing-cloud-intake\.prudhvi-pallempati\.chatgpt\.site'/);
}
const sitemap=await read('/sitemap.xml');
assert.match(sitemap,/repair-guide-battery-keeps-dying/);assert.match(sitemap,/repair-guide-car-overheating/);
for(const urlPath of ['/_website-intake/server.mjs','/tools/check-clean-structure.mjs','/docs/COMPANY-UPDATE.md','/source-materials/inventory.json'])await read(urlPath,404);
const evidence={at:new Date().toISOString(),site:'https://fixingfortmyers.com',commit:build.commit,pagesStatus:build.status,version,checks,pages:pageChecks,bayOne:'enabled; opens only when requested',contact:'online receiver configured; customer-sent native message fallback',productionSubmissionVerified:false,realMessagesSent:false,backendChanged:false};
fs.mkdirSync(path.join(root,'docs/evidence'),{recursive:true});
fs.writeFileSync(path.join(root,'docs/evidence/production.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({at:evidence.at,commit:evidence.commit,pages:pageChecks.length,compactServiceHeroes:pageChecks.filter(page=>page.serviceHero).length,assets:assets.length,privatePathsExcluded:4,productionSubmissionVerified:false,realMessagesSent:false},null,2));
