import fs from 'node:fs';
const service={
  'ac-repair-fort-myers':'ac','brake-repair-fort-myers':'brakes','auto-diagnostics-fort-myers':'diagnostics','check-engine-light-diagnosis-fort-myers':'diagnostics',
  'no-start-diagnosis-fort-myers':'electrical','battery-replacement-fort-myers':'electrical','alternator-starter-repair-fort-myers':'electrical','auto-electrical-repair-fort-myers':'electrical',
  'engine-repair-fort-myers':'engine','transmission-repair-fort-myers':'engine','module-programming-fort-myers':'programming','diesel-repair-fort-myers':'diesel','oil-change-fort-myers':'maintenance'};
const guides={
  'ac-repair-fort-myers':['repair-guide-ac-warm-at-idle','Why does the A/C get warm while stopped?'],
  'no-start-diagnosis-fort-myers':['repair-guide-car-wont-start','Car won’t start: clicking, cranking, or nothing?'],
  'battery-replacement-fort-myers':['repair-guide-battery-keeps-dying','Why does the battery keep going dead?']};
for(const[name,key]of Object.entries(service)){
  const file=name+'.html';let html=fs.readFileSync(file,'utf8').replaceAll('href="/#contact"',`href="/?service=${key}#contact"`);
  if(guides[name]&&!html.includes('id="related-repair-guide"')){
    const[slug,title]=guides[name];html=html.replace('</main>',`<section id="related-repair-guide"><div class="container"><h2 class="section-title">Repair guide</h2><p class="section-sub"><a href="/${slug}">${title}</a></p></div></section></main>`);
  }
  fs.writeFileSync(file,html);
}
let home=fs.readFileSync('index.html','utf8');
if(!home.includes('id="repair-guides"'))home=home.replace('<section class="contact"',`<section class="shop-notice" id="repair-guides" aria-labelledby="repair-guides-title"><div class="container"><div><h2 id="repair-guides-title">Understand the problem. Tell Tony what you noticed.</h2><p><a href="/repair-guide-car-wont-start">Car won’t start</a> · <a href="/repair-guide-ac-warm-at-idle">A/C warm at idle</a> · <a href="/repair-guide-battery-keeps-dying">Battery keeps dying</a></p></div><a href="/repair-guides">All repair guides ↗</a></div></section>\n<section class="contact"`);
// Google owner profile readback on 2026-09-24 showed 4.8 stars and 70 reviews.
home=home.replaceAll('71 Google Reviews','70 Google Reviews').replaceAll('71 Google reviews','70 Google reviews');fs.writeFileSync('index.html',home);
let sitemap=fs.readFileSync('sitemap.xml','utf8').replace(/<lastmod>[^<]+<\/lastmod>/g,'<lastmod>2026-09-24</lastmod>');
for(const slug of ['repair-guides','repair-guide-car-wont-start','repair-guide-ac-warm-at-idle','repair-guide-battery-keeps-dying'])if(!sitemap.includes('/'+slug+'<'))sitemap=sitemap.replace('</urlset>',`  <url><loc>https://fixingfortmyers.com/${slug}</loc><lastmod>2026-09-24</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>\n</urlset>`);
fs.writeFileSync('sitemap.xml',sitemap);
