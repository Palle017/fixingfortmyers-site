// Read-only HTML acceptance checks. No site scripts or network requests execute.
// Rendered dimensions, focus and receiver behavior need the separate browser/tests review.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';

const root=fileURLToPath(new URL('../',import.meta.url));
const text=node=>node?.textContent.replace(/\s+/g,' ').trim()||'';
const coreIds=['request-vehicle','request-details','request-name','request-phone'];

export function checkCleanPage(name,html){
  const dom=new JSDOM(html),d=dom.window.document;
  try {
    const hero=d.querySelector('.service-hero');
    if(hero){
      assert.equal(hero.querySelectorAll('h1').length,1,`${name}: one service heading`);
      assert.ok(hero.classList.contains('compact-hero'),`${name}: use the compact service opening`);
      assert.equal(hero.querySelectorAll('.service-hero__stats').length,0,`${name}: remove repetitive service sales stats`);
      assert.equal(hero.querySelectorAll('.service-proof-list li').length,3,`${name}: three specific service process points`);
      assert.ok(text(hero.querySelector('.service-hero__desc')),`${name}: keep a useful service description`);
      const actions=[...hero.querySelectorAll('.service-hero__actions a')];
      assert.equal(actions.length,2,`${name}: two service actions`);
      assert.equal(text(actions[0]),'Request a repair',`${name}: request is the first service action`);
      assert.equal(text(actions[1]),'Call',`${name}: simple alternative call label`);
      assert.equal(actions[1].getAttribute('href'),'tel:+12393972048',`${name}: published call number`);
    }
    const bar=d.querySelector('.mobile-contact-bar');
    if(bar&&name!=='careers.html'){
      const actions=[...bar.querySelectorAll('a,button')];
      assert.equal(actions.length,2,`${name}: two mobile contact actions`);
      assert.deepEqual(actions.map(text),['Request a repair','Call'],`${name}: consistent mobile actions`);
      assert.equal(actions[1].getAttribute('href'),'tel:+12393972048',`${name}: mobile call number`);
      assert.ok(actions[0].getAttribute('href').endsWith('#contact'),`${name}: request opens the form`);
    }
    const form=d.getElementById('bookingForm');
    if(form){
      for(const id of coreIds){
        const field=d.getElementById(id);
        assert.ok(field&&form.contains(field),`${name}: missing ${id}`);
        assert.ok(!field.closest('details,[hidden]'),`${name}: ${id} stays available without expanding more details`);
        assert.ok(d.querySelector(`label[for="${id}"]`),`${name}: ${id} has a visible label`);
      }
      assert.equal(d.getElementById('request-phone').type,'tel',`${name}: phone keyboard`);
      assert.ok(d.getElementById('request-phone').required,`${name}: collect a callback number`);
      assert.ok(d.getElementById('request-details').required,`${name}: collect the problem`);
      const service=d.getElementById('request-service');
      assert.ok(service&&(service.type==='hidden'||service.closest('[hidden],details')),`${name}: infer service without another required customer question`);
      for(const id of ['request-city','request-starts','request-stranded','request-media']){
        const field=d.getElementById(id);
        assert.ok(field&&field.closest('details'),`${name}: ${id} belongs in optional details`);
        assert.ok(!field.required,`${name}: ${id} is optional`);
        assert.equal(field.closest('details').open,false,`${name}: optional details start collapsed`);
      }
      const optional=d.getElementById('request-city').closest('details');
      assert.match(text(optional.querySelector('summary')),/More details.*optional/i,`${name}: optional expansion label`);
      assert.match(text(d.getElementById('request-submit')),/^(?:Request a repair|Send repair request)$/,`${name}: clear submit label`);
      assert.equal(d.querySelectorAll('section#new-shop,section#big-jobs,section#same-day-service').length,0,`${name}: consolidate repeated homepage callout sections`);
    }
    return {file:name,serviceHero:Boolean(hero),repairForm:Boolean(form),mobileActions:bar?bar.querySelectorAll('a,button').length:0};
  } finally { dom.window.close(); }
}

export function checkLocalLinks(){
  const pages=new Map(fs.readdirSync(root).filter(name=>name.endsWith('.html')).map(name=>[name,new JSDOM(fs.readFileSync(path.join(root,name),'utf8'))]));
  let links=0;
  try {
    for(const [name,dom] of pages){
      for(const anchor of dom.window.document.querySelectorAll('a[href]')){
        const href=anchor.getAttribute('href');
        if(!href||/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href))continue;
        const url=new URL(href,`https://local.invalid/${name==='index.html'?'':name}`);
        let target=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
        if(!path.extname(target))target+='.html';
        assert.ok(fs.existsSync(path.join(root,target)),`${name}: missing link ${href}`);
        if(url.hash&&pages.has(target))assert.ok(pages.get(target).window.document.getElementById(decodeURIComponent(url.hash.slice(1))),`${name}: missing fragment ${href}`);
        links++;
      }
    }
  } finally { for(const dom of pages.values())dom.window.close(); }
  return links;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const pages=[],failures=[];
  for(const name of fs.readdirSync(root).filter(name=>name.endsWith('.html'))){
    try { pages.push(checkCleanPage(name,fs.readFileSync(path.join(root,name),'utf8'))); }
    catch(error){failures.push(error.message);}
  }
  let links=0;try{links=checkLocalLinks();}catch(error){failures.push(error.message);}
  console.log(JSON.stringify({pages:pages.length,compactServiceHeroes:pages.filter(page=>page.serviceHero).length,repairForms:pages.filter(page=>page.repairForm).length,localLinksAndFragments:links,scriptsExecuted:false,networkRequests:0,failures},null,2));
  if(failures.length)process.exitCode=1;
}
