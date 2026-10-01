// One-time, idempotent presentation migration. Business capabilities come from existing page copy.
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const descriptions = {
 'ac-repair':'Warm air, weak airflow or cooling that fades at idle? We check the system to understand what is affecting the cooling.',
 'alternator-starter-repair':'Slow cranking, repeated dead batteries or a charging warning? Testing helps separate component faults from wiring and connection problems.',
 'auto-diagnostics':'A fault code gives us a starting point. Testing tells us what needs attention.',
 'auto-electrical-repair':'We investigate repeat dead batteries, intermittent starting faults and electrical problems with checks of the affected circuits.',
 'auto-repair-fort-myers':'Diagnostics and repairs, with the findings and recommended work explained before you approve a repair.',
 'auto-repair-cape-coral':'Diagnostics and repairs for Cape Coral drivers at our Fort Myers shop, by appointment.',
 'auto-repair-lehigh-acres':'Diagnostics, diesel work and everyday repairs for Lehigh Acres drivers at our Fort Myers shop.',
 'auto-repair-north-fort-myers':'Diagnostics and repairs for North Fort Myers drivers, with the findings and repair options explained.',
 'battery-replacement':'Battery, charging and connection checks help determine whether a replacement battery is the right repair.',
 'blue-smoke-burning-oil':'Blue smoke and falling oil levels need investigation. The source of the oil loss determines the repair.',
 'brake-repair':'Noise, vibration or a change in pedal feel? We inspect the braking system and explain the recommended work.',
 'car-audio-installation':'Audio installation planned around your vehicle, existing equipment and listening preferences.',
 'check-engine-light-diagnosis':'Codes, live data and targeted tests help explain a warning light and identify the next step.',
 'cooling-system-repair':'We investigate coolant leaks, fan problems and overheating to determine the repair your vehicle needs.',
 'diesel-repair':'Testing and troubleshooting for diesel hard starts, warning lights and performance problems.',
 'engine-knocking-noise':'A knock or tick can have different causes. We investigate where the noise comes from before recommending engine work.',
 'engine-rebuild-vs-replacement':'Inspection and measurements help compare rebuilding your engine with replacing it, with options explained in writing.',
 'engine-repair':'Diagnostic work for engine noise, misfires, overheating, leaks and loss of power.',
 'exhaust-emissions-repair':'Testing for exhaust leaks, warning lights and emissions faults before recommending replacement parts.',
 'fort-myers-mechanic':'Meet Tony, the owner behind Perfect Timing. He oversees the repair plan and gives each vehicle a final check.',
 'fuel-system-repair':'Fuel delivery and control-system testing for hard starts, hesitation and loss of power.',
 'head-gasket-overheating-damage':'Testing after an overheating event helps determine the cause and whether internal engine repairs are needed.',
 'hot-rod-restoration':'Mechanical and electrical restoration planned around your vehicle’s condition and the goals of your build.',
 'module-programming':'Programming, coding and relearn support as part of electrical repair. Vehicle and module compatibility are checked first.',
 'no-start-diagnosis':'Clicking, slow cranking or an engine that turns over without starting? The symptoms guide the tests.',
 'oil-change':'Oil and filter service using the manufacturer’s specified oil, with a check of fluid levels and visible concerns.',
 'pre-purchase-inspection':'An inspection of a used vehicle’s condition helps you understand potential concerns before buying.',
 'race-car-modifications':'Performance work planned around the vehicle’s configuration, intended use and your build goals.',
 'suspension-steering-repair':'Inspection for clunks, uneven tire wear, wandering and changes in steering feel.',
 'transmission-repair':'Testing for slipping, hard shifts and transmission warnings before recommending repair work.',
 'transmission-slipping':'Fluid checks, fault codes and operating data help distinguish a control problem from internal wear.'
};
const special = {
 'blue-smoke-burning-oil':['Check the smoke pattern and oil consumption','Inspect for external leaks and ventilation faults','Investigate internal causes as the findings require'],
 'engine-knocking-noise':['Reproduce the noise and note when it occurs','Locate the source of the noise','Check oil condition and pressure'],
 'engine-rebuild-vs-replacement':['Inspect the engine’s condition','Assess measurements and repair suitability','Compare the rebuild and replacement options'],
 'exhaust-emissions-repair':['Read codes and stored operating data','Inspect exhaust components and connections','Test sensor behavior and check for leaks'],
 'head-gasket-overheating-damage':['Investigate the cause of overheating','Pressure-test the cooling system','Check for combustion gases where indicated'],
 'oil-change':['Review the oil specification for your vehicle','Replace the oil and filter','Check fluid levels and visible concerns'],
 'transmission-slipping':['Check fluid level and condition to specification','Read transmission codes and stored data','Compare commanded shifts with operating behavior'],
 'fort-myers-mechanic':['Diagnostic and electrical repair work','Engine assembly, tolerance and timing checks','Transmission work and walnut blasting']
};
const escape = s=>s.replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
for (const file of fs.readdirSync('.').filter(f=>f.endsWith('.html')&&f!=='index.html')) {
 const original=fs.readFileSync(file,'utf8'), dom=new JSDOM(original), d=dom.window.document;
 if(!d.querySelector('.nav')) {dom.window.close();continue;}
 const hero=d.querySelector('.service-hero');
 const context=d.querySelector('a[href*="?service="][href*="#contact"]')?.getAttribute('href')||'/#contact';
 if(hero){
  const key=Object.keys(descriptions).find(k=>file===k+'.html'||file===k+'-fort-myers.html');
  if(!key) throw new Error('Missing service copy: '+file);
  hero.classList.add('compact-hero');
  hero.querySelectorAll('.service-hero__bg,.service-hero__overlay,.service-hours').forEach(n=>n.remove());
  const title=hero.querySelector('h1');title.textContent=title.textContent.replace(/ in Fort Myers, FL$/,'');
  title.id='service-title';hero.setAttribute('aria-labelledby',title.id);
  hero.querySelector('.service-hero__eyebrow').textContent='Perfect Timing · Fort Myers, FL';
  hero.querySelector('.service-hero__desc').textContent=descriptions[key];
  hero.querySelector('.service-hero__actions').innerHTML=`<a href="${escape(context)}" class="btn btn--primary">Request a repair</a><a href="tel:+12393972048" class="btn btn--outline">Call</a>`;
  let points=special[key]||[...d.querySelectorAll('.process-list li')].slice(0,3).map(n=>n.textContent.trim().replace(/^\d+\s+/,''));
  if(!points.length)points=['Diagnostics and electrical troubleshooting','Brake, A/C and routine repair services','Repair options explained before work begins'];
  const aside=hero.querySelector('.service-hero__aside');
  aside.innerHTML='<h2 class="service-hero__card-label">'+(key==='fort-myers-mechanic'?'Workshop capabilities':'How we approach it')+'</h2><ul class="service-proof-list">'+points.map(p=>'<li>'+escape(p)+'</li>').join('')+'</ul>';
  d.querySelectorAll('.trust-bar').forEach(n=>n.remove());
 }
 for(const group of d.querySelectorAll('.guide-actions')){
  group.innerHTML=`<a class="btn btn--primary" href="${escape(context)}">Request a repair</a><a class="btn btn--outline" href="tel:+12393972048">Call</a>`;
  const next=group.nextElementSibling;
  if(next?.tagName==='P'&&/Use the short form to prepare a text/.test(next.textContent))next.remove();
 }
 for(const a of d.querySelectorAll('a[href*="#contact"]')){
  if(a.classList.contains('btn')||a.classList.contains('nav__cta')||/^(Book A Repair|Contact|Request this service|Tell Tony what|Use the short form)/i.test(a.textContent.trim()))a.textContent='Request a repair';
 }
 for(const a of d.querySelectorAll('a.btn[href^="tel:"]'))a.textContent='Call';
 if(file!=='careers.html')for(const bar of d.querySelectorAll('.mobile-contact-bar'))bar.innerHTML=`<a href="${escape(context)}">Request a repair</a><a href="tel:+12393972048">Call</a>`;
 for(const p of d.querySelectorAll('.guide-sidebar p'))if(/Ready to describe your problem/.test(p.textContent))p.innerHTML=`<a href="${escape(context)}">Request a repair</a> with your vehicle and symptoms. You do not need to know the cause.`;
 // Keep a single consistent label throughout body and footer links.
 for(const a of d.querySelectorAll('a'))if(a.getAttribute('href')?.includes('#contact')&&/Book|Schedule|Get a quote|Talk to Tony|Send.*details|Request this/i.test(a.textContent))a.textContent='Request a repair';
 if(!d.querySelector('link[href^="/clean-layout.css"]')){
  const link=d.createElement('link');link.rel='stylesheet';link.href='/clean-layout.css?v=20260929-clean-flow';d.head.append(link);
 }
 for(const n of d.querySelectorAll('script[src],link[rel="stylesheet"][href]')){
  const attr=n.tagName==='SCRIPT'?'src':'href', val=n.getAttribute(attr);
  if(val.startsWith('/')&&!val.startsWith('//'))n.setAttribute(attr,val.split('?')[0]+'?v=20260929-clean-flow');
 }
 const serialized=dom.serialize().replace(/[\t ]+$/gm,'').replace(/(?:\r?\n)+(\<\/body><\/html>)$/,'\n$1');
 fs.writeFileSync(file,serialized.trimEnd()+'\n');dom.window.close();
}
console.log('Updated page introductions and consistent repair actions.');
