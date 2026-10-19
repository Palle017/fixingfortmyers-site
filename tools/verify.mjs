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
for(const file of fs.readdirSync('.').filter(name=>name.endsWith('.html')&&name!=='googlefc91785ed4d05625.html')){
  const html=fs.readFileSync(file,'utf8'),dom=new JSDOM(html),d=dom.window.document;pages++;
  for(const script of d.querySelectorAll('script[type="application/ld+json"]')){JSON.parse(script.textContent);schemas++;}
  const ids=[...d.querySelectorAll('[id]')].map(x=>x.id);assert.equal(new Set(ids).size,ids.length,`${file}: duplicate IDs`);
  assert.ok(!/Mon.{0,8}Sat.{0,30}7.?AM|"opens":\s*"07:00"|Monday through Saturday, 7am/i.test(html),file+': obsolete hours');
  if(d.querySelector('footer')){
    const footer=d.querySelector('footer').textContent;
    // Owner correction 2026-10-19: shop + mobile van + pickup, repair requests 24/7, Tony confirms by phone.
    assert.match(footer,/Repair requests 24\/7/,file+': missing 24/7 repair-request disclosure');
    assert.match(footer,/mobile repairs from his equipped service van/,file+': missing mobile van service disclosure');
    assert.match(footer,/requested times are penciled in until Tony confirms by phone/,file+': missing penciled-in confirmation disclosure');
    assert.doesNotMatch(footer,/Mon–Sat, 8 AM–8 PM|Shop hours:/,file+': fixed shop hours contradict the 24/7 request model');
    assert.match(footer,/An immediate reply or visit is not guaranteed/,file+': missing response-time limitation');
    assert.doesNotMatch(footer,/guaranteed 24\/7|24\/7 emergency service/i,file+': 24/7 means requests are accepted, not a guaranteed visit');
  }
  for(const node of d.querySelectorAll('a[href],link[href],script[src],img[src]')){
    const ref=node.getAttribute('href')||node.getAttribute('src');if(!ref||/^(https?:|tel:|sms:|mailto:|data:)/.test(ref))continue;
    const local=ref.split(/[?#]/)[0].replace(/^\.\//,'').replace(/^\//,'');if(!local)continue;
    assert.ok(fs.existsSync(local)||fs.existsSync(local+'.html'),`${file}: missing ${ref}`);links++;
  }
  dom.window.close();
}
const summary={at:new Date().toISOString(),pages,schemas,localLinks:links,providers:'mocked',productionVerified:false};
fs.writeFileSync('docs/evidence/structure.json',JSON.stringify(summary,null,2)+'\n');console.log(summary);
