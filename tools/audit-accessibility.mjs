// Structural accessibility audit only: no browser, external resources or site scripts.
// Color contrast and actual mobile rendering require the separate browser review.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import axe from 'axe-core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pages=['index.html','repair-guides.html','repair-guide-car-wont-start.html','repair-guide-ac-warm-at-idle.html','repair-guide-battery-keeps-dying.html','request-received.html'];
const results=[];
for(const file of pages){
  const dom=new JSDOM(fs.readFileSync(path.join(root,file),'utf8'),{url:'https://fixingfortmyers.com/'+file,runScripts:'outside-only'});
  dom.window.eval(axe.source);
  const result=await dom.window.axe.run(dom.window.document,{rules:{'color-contrast':{enabled:false}}});
  results.push({file,passes:result.passes.length,incomplete:result.incomplete.map(x=>({id:x.id,impact:x.impact})),violations:result.violations.map(x=>({id:x.id,impact:x.impact,description:x.description,help:x.help,helpUrl:x.helpUrl,nodes:x.nodes.map(n=>({target:n.target,failureSummary:n.failureSummary}))}))});
  dom.window.close();
}
const output={at:new Date().toISOString(),engine:`axe-core ${axe.version}`,environment:'jsdom; site scripts and external resources do not execute',limitations:['Color contrast disabled because jsdom does not render.','Dynamic states, focus behavior, responsive layout and visibility require browser review.'],pages:results,totalViolations:results.reduce((n,r)=>n+r.violations.length,0),criticalOrSerious:results.reduce((n,r)=>n+r.violations.filter(v=>['critical','serious'].includes(v.impact)).length,0)};
fs.mkdirSync(path.join(root,'docs/evidence'),{recursive:true});
fs.writeFileSync(path.join(root,'docs/evidence/accessibility.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({at:output.at,pages:results.map(r=>({file:r.file,violations:r.violations.map(v=>({id:v.id,impact:v.impact,affectedNodes:v.nodes.length,firstTarget:v.nodes[0]?.target}))})),totalViolations:output.totalViolations,criticalOrSerious:output.criticalOrSerious},null,2));
if(output.criticalOrSerious)process.exitCode=1;
