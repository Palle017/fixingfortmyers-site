// Checks a chat model against synthetic customer conversations before it goes live.
// Runs the real Bay One server logic with the configured provider in a throwaway data directory.
//   BAYONE_PROVIDER=ollama OLLAMA_MODEL=qwen3.5:4b node golden-check.mjs [--json] [--min-pass=0.8] [--max-p95-ms=20000]
// No lead is created and nothing is sent anywhere except the configured model.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createPublicChat} from './public-chat.mjs';

const STATUS=['starts','stranded','drivable'];

export function scoreCase(testCase,final,assists){
  const problems=[];
  for(const[field,want]of Object.entries(testCase.expect||{})){
    const got=final[field];
    if(want===null){if(got!==undefined)problems.push(`${field}: expected nothing, got "${got}"`);continue;}
    if(STATUS.includes(field)?got!==want:!(typeof got==='string'&&got.toLowerCase().includes(want.toLowerCase())))problems.push(`${field}: expected ${STATUS.includes(field)?'':'to contain '}"${want}", got ${got===undefined?'nothing':`"${got}"`}`);
  }
  const allowed=testCase.assist||['model','rules'];
  assists.forEach((assist,turn)=>{if(!allowed.includes(assist))problems.push(`turn ${turn+1}: answered by ${assist}`);});
  return problems;
}

export async function runGolden({cases,provider,providerName,onCase=()=>{}}={}){
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bayone-golden-'));
  // A virtual clock keeps each turn in a fresh rate-limit minute; model latency is still measured in real time.
  let clock=Date.now();
  const chat=createPublicChat({dataDir,now:()=>clock,provider,providerName,dailyTokenBudget:Number.MAX_SAFE_INTEGER,maxDailyRequests:Number.MAX_SAFE_INTEGER,maxConcurrent:1});
  const results=[];
  try{
    for(const[index,testCase]of cases.entries()){
      const ip=`198.51.${100+Math.floor(index/250)}.${1+index%250}`,token=chat.session({},ip).visitor_token;
      let final={};const assists=[],latencies=[];
      for(const message of testCase.turns){
        clock+=61000;const started=performance.now();
        const out=await chat.message({visitor_token:token,request_id:randomUUID(),message,mode:'chat'},ip);
        latencies.push(Math.round(performance.now()-started));assists.push(out.assist);final=out.intake||{};
      }
      const result={id:testCase.id,pass:false,problems:scoreCase(testCase,final,assists),final,assists,latencies};
      result.pass=result.problems.length===0;results.push(result);onCase(result);
    }
  }finally{chat.close();fs.rmSync(dataDir,{recursive:true,force:true});}
  const modelTurns=results.flatMap(r=>r.assists.map((assist,i)=>({assist,ms:r.latencies[i]}))).filter(t=>t.assist!=='rules');
  const sorted=modelTurns.map(t=>t.ms).sort((a,b)=>a-b),pct=q=>sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(q*sorted.length)-1)]:0;
  return {results,summary:{cases:results.length,passed:results.filter(r=>r.pass).length,passRate:results.length?results.filter(r=>r.pass).length/results.length:0,
    modelTurns:modelTurns.length,scriptedTurns:modelTurns.filter(t=>t.assist==='scripted').length,p50Ms:pct(0.5),p95Ms:pct(0.95)}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const arg=(name,fallback)=>{const hit=process.argv.find(a=>a.startsWith(`--${name}=`));return hit?Number(hit.split('=')[1]):fallback;};
  const json=process.argv.includes('--json'),minPass=arg('min-pass',0.8),maxP95=arg('max-p95-ms',20000);
  const {cases}=JSON.parse(fs.readFileSync(new URL('./golden-cases.json',import.meta.url),'utf8'));
  const label=process.env.BAYONE_PROVIDER==='ollama'?`ollama ${process.env.OLLAMA_MODEL||'(no OLLAMA_MODEL set)'}`:'deepseek';
  if(!json)console.log(`Checking ${cases.length} conversations against ${label}\n`);
  const {results,summary}=await runGolden({cases,onCase:r=>{if(!json)console.log(`${r.pass?'PASS':'FAIL'}  ${r.id.padEnd(22)} ${r.latencies.map(ms=>`${(ms/1000).toFixed(1)}s`).join(' ')}${r.pass?'':'\n      '+r.problems.join('\n      ')}`);}});
  const ok=summary.passRate>=minPass&&summary.p95Ms<=maxP95;
  if(json)console.log(JSON.stringify({model:label,summary,results,ok},null,2));
  else console.log(`\n${summary.passed}/${summary.cases} passed (${Math.round(summary.passRate*100)}%, need ${Math.round(minPass*100)}%). `+
    `Model turns: ${summary.modelTurns}, fell back to script: ${summary.scriptedTurns}. Latency p50 ${(summary.p50Ms/1000).toFixed(1)}s, p95 ${(summary.p95Ms/1000).toFixed(1)}s (limit ${(maxP95/1000).toFixed(0)}s).\n`+
    (ok?'Ready to go live with this model.':'Not ready: pick another model or fix the failures above before going live.'));
  process.exit(ok?0:1);
}
