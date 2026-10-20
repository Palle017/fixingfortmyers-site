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
    const photoGalleryPage=['workshop.html','paint-correction-detailing-fort-myers.html'].includes(name);
    if(hero&&!photoGalleryPage){
      assert.equal(hero.querySelectorAll('h1').length,1,`${name}: one service heading`);
      assert.ok(hero.classList.contains('compact-hero'),`${name}: use the compact service opening`);
      assert.equal(hero.querySelectorAll('.service-hero__stats').length,0,`${name}: remove repetitive service sales stats`);
      const processPoints=name==='walnut-blasting-fort-myers.html'?4:3;
      assert.equal(hero.querySelectorAll('.service-proof-list li').length,processPoints,`${name}: concise service process points`);
      assert.ok(text(hero.querySelector('.service-hero__desc')),`${name}: keep a useful service description`);
      const actions=[...hero.querySelectorAll('.service-hero__actions a')];
      assert.equal(actions.length,2,`${name}: two service actions`);
      const requestLabel=name==='oil-change-fort-myers.html'?'Request an oil change':'Request Repair';
      assert.equal(text(actions[0]),requestLabel,`${name}: service request is the first action`);
      assert.match(text(actions[1]),/^Call(?: [\u2014-] AI intake| \(239\) 397-2048| the shop \(239\) 397-2048)?$/,`${name}: clear alternative call label`);
      assert.equal(actions[1].getAttribute('href'),'tel:+12393972048',`${name}: published call number`);
    }
    if(hero&&photoGalleryPage){
      assert.equal(hero.querySelectorAll('h1').length,1,`${name}: one workshop heading`);
      assert.ok(text(hero.querySelector('.service-hero__desc')),`${name}: keep a useful workshop description`);
      if(name==='workshop.html'){
        assert.match(text(hero.querySelector('.service-hero__desc')),/temporary workshop/i,`${name}: describe the current workshop`);
        assert.match(text(hero.querySelector('.service-hero__desc')),/mobile repairs from a service van/i,`${name}: include mobile repairs from the equipped van`);
        assert.doesNotMatch(text(hero.querySelector('.service-hero__desc')),/fully equipped|all repairs|all work is done/i,`${name}: do not promise every job can be accommodated`);
      }
      const actions=[...hero.querySelectorAll('.service-hero__actions a')];
      assert.ok(actions.length>=2,`${name}: Call/Text CTAs present`);
      assert.ok(actions.some(a=>a.getAttribute('href')==='tel:+12393972048'),`${name}: published call number`);
      if(name==='workshop.html')assert.ok(actions.some(a=>a.getAttribute('href')==='sms:+12393972048'),`${name}: published text number`);
      else assert.ok(actions.some(a=>a.getAttribute('href').endsWith('#contact')),`${name}: photo-based service request`);
    }
    const bar=d.querySelector('.mobile-contact-bar');
    if(bar&&name!=='careers.html'){
      const actions=[...bar.querySelectorAll('a,button')];
      assert.equal(actions.length,2,`${name}: two mobile contact actions`);
      const labels=actions.map(text);
      if(name==='index.html'){
        assert.deepEqual(labels,['Request a repair','Call'],`${name}: intake is the first mobile action`);
        assert.equal(actions[0].getAttribute('href'),'#contact',`${name}: mobile intake opens the form`);
        assert.equal(actions[1].getAttribute('href'),'tel:+12393972048',`${name}: mobile call number`);
        assert.ok(d.querySelector('.home-start__intro a[href="sms:+12393972048"]'),`${name}: direct text-app option remains in the introduction`);
      } else if(name==='workshop.html'){
        assert.deepEqual(labels,['Call','Text'],`${name}: Call/Text sticky for engine-transmission positioning`);
        assert.equal(actions[0].getAttribute('href'),'tel:+12393972048',`${name}: mobile call number`);
        assert.equal(actions[1].getAttribute('href'),'sms:+12393972048',`${name}: mobile text number`);
      } else {
        assert.equal(labels[0],'Request a repair',`${name}: consistent mobile request`);
        assert.match(labels[1],/^Call(?: [\u2014-] AI intake| \(239\) 397-2048)?$/,`${name}: consistent mobile call`);
        assert.equal(actions[1].getAttribute('href'),'tel:+12393972048',`${name}: mobile call number`);
        assert.ok(actions[0].getAttribute('href').endsWith('#contact'),`${name}: request opens the form`);
      }
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
      assert.ok(service&&form.contains(service)&&(service.type==='hidden'||service.closest('[hidden],details')),`${name}: service is optional or inferred, not another first-screen question`);
      assert.ok(!service.required,`${name}: a customer need not diagnose the service required`);
      const city=d.getElementById('request-city');
      assert.ok(city&&form.contains(city)&&city.closest('details'),`${name}: city/ZIP stays in optional details`);
      assert.ok(!city.required,`${name}: the short form can be sent without city/ZIP`);
      assert.match(text(d.querySelector('label[for="request-city"]')),/city or ZIP/i,`${name}: city/ZIP label`);
      assert.ok(d.getElementById('request-use-my-location'),`${name}: optional Use my location control`);
      assert.ok(d.getElementById('request-latitude')?.type==='hidden'&&d.getElementById('request-longitude')?.type==='hidden'&&d.getElementById('request-maps-link')?.type==='hidden',`${name}: sender pin uses hidden fields`);
      for(const id of ['request-starts','request-stranded','request-media']){
        const field=d.getElementById(id);
        assert.ok(field&&field.closest('details'),`${name}: ${id} belongs in optional details`);
        assert.ok(!field.required,`${name}: ${id} is optional`);
        assert.equal(field.closest('details').open,false,`${name}: optional details start collapsed`);
      }
      const optional=d.getElementById('request-stranded').closest('details');
      assert.match(text(optional.querySelector('summary')),/more details.*optional/i,`${name}: optional expansion label`);
      assert.match(text(d.getElementById('request-submit')),/^(?:Request Repair|Request a repair|Send repair request|Send repair details|Get My Repair Plan)$/,`${name}: clear submit label`);
      if(name==='index.html'){
        const picker=d.querySelector('.hero-appointment');
        assert.ok(picker,'index.html: show a date and time appointment picker');
        assert.equal(picker.querySelector('input[type="date"]')?.id,'hero-appointment-date');
        assert.equal(picker.querySelector('input#hero-appointment-time')?.id,'hero-appointment-time');
        assert.equal(picker.querySelector('#hero-appointment-continue')?.getAttribute('href'),'#contact');
        assert.match(text(picker),/Tony verbally confirms by phone/i,'Do not promise unverified appointment availability');
        assert.equal(d.querySelectorAll('.home-start__actions .btn').length,0,'No duplicate hero buttons');
        assert.match(text(d.getElementById('request-instructions')),/reviews your request and calls you back/,`${name}: explain what happens after a request`);
        const aiHelp=d.querySelector('.request-ai-help');
        assert.ok(aiHelp&&aiHelp.tagName==='DETAILS'&&!aiHelp.open,`${name}: optional AI help stays discreet`);
        assert.match(text(aiHelp),/If your browser’s AI assistant supports this form/,`${name}: AI assistance is conditional on browser support`);
        assert.match(text(aiHelp),/Review the details[\s\S]*Nothing is sent automatically/,`${name}: customer reviews and sends`);
      }
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

