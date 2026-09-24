import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {JSDOM} from 'jsdom';
const tests=['_website-intake','tools'].flatMap(dir=>fs.readdirSync(dir).filter(name=>name.endsWith('.test.mjs')).map(name=>path.join(dir,name)));
const result=spawnSync(process.execPath,['--test',...tests],{encoding:'utf8'});
fs.mkdirSync('docs/evidence',{recursive:true});
fs.writeFileSync('docs/evidence/tests.txt',`Synthetic test run ${new Date().toISOString()}\nNode ${process.version}\n`+result.stdout+result.stderr);
console.log(result.stdout);if(result.status!==0){console.error(result.stderr);process.exit(result.status||1);}
let pages=0,schemas=0,links=0;
for(const file of fs.readdirSync('.').filter(name=>name.endsWith('.html'))){
  const html=fs.readFileSync(file,'utf8'),dom=new JSDOM(html),d=dom.window.document;pages++;
  for(const script of d.querySelectorAll('script[type="application/ld+json"]')){JSON.parse(script.textContent);schemas++;}
  const ids=[...d.querySelectorAll('[id]')].map(x=>x.id);assert.equal(new Set(ids).size,ids.length,`${file}: duplicate IDs`);
  assert.ok(!/Mon.{0,8}Sat.{0,30}7.?AM|"opens":\s*"07:00"|Monday through Saturday, 7am/i.test(html),file+': obsolete hours');
  if(d.querySelector('footer'))assert.match(d.querySelector('footer').textContent,/After-hours repairs depend on the job, location and availability/,file+': missing afterhours disclosure');
  for(const node of d.querySelectorAll('a[href],link[href],script[src],img[src]')){
    const ref=node.getAttribute('href')||node.getAttribute('src');if(!ref||/^(https?:|tel:|sms:|mailto:|data:)/.test(ref))continue;
    const local=ref.split(/[?#]/)[0].replace(/^\.\//,'').replace(/^\//,'');if(!local)continue;
    assert.ok(fs.existsSync(local)||fs.existsSync(local+'.html'),`${file}: missing ${ref}`);links++;
  }
  dom.window.close();
}
const summary={at:new Date().toISOString(),pages,schemas,localLinks:links,providers:'mocked',productionVerified:false};
fs.writeFileSync('docs/evidence/structure.json',JSON.stringify(summary,null,2)+'\n');console.log(summary);
