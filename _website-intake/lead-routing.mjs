import {createHash} from 'node:crypto';
import fs from 'node:fs';

export const TONY_ALERT_NUMBER = '+12393972048';
const VALUES={starts:['yes','no','unknown'],stranded:['yes','no','unknown'],drivable:['yes','no','unknown'],source:['form','ai','voice','unknown'],afterHours:['yes','no']};
const ACTIONS=['notify_sms','notify_call','normal'];
const ownKeys=(object,allowed)=>object&&typeof object==='object'&&!Array.isArray(object)&&Object.keys(object).every(key=>allowed.includes(key));
export function validateRules(config){
  if(!ownKeys(config,['version','rules'])||typeof config.version!=='string'||!/^[a-zA-Z0-9._-]{1,40}$/.test(config.version)||!Array.isArray(config.rules)||config.rules.length<1||config.rules.length>30)throw Error('Invalid routing rule list.');
  const ids=new Set();
  config.rules.forEach((rule,index)=>{
    if(!ownKeys(rule,['id','label','if','then'])||typeof rule.id!=='string'||!/^[a-z0-9-]{1,60}$/.test(rule.id)||ids.has(rule.id)||typeof rule.label!=='string'||rule.label.length<1||rule.label.length>160||!Array.isArray(rule.if)||rule.if.length>8||!Array.isArray(rule.then)||!rule.then.length||rule.then.some(action=>!ACTIONS.includes(action))||new Set(rule.then).size!==rule.then.length)throw Error('Invalid routing rule.');
    ids.add(rule.id);
    if(rule.then.includes('normal')&&rule.then.length!==1)throw Error('Normal follow-up cannot be combined with alert actions.');
    if((rule.if.length===0)!==(index===config.rules.length-1))throw Error('Exactly one final ELSE rule is required.');
    if(index===config.rules.length-1&&(rule.then.length!==1||rule.then[0]!=='normal'))throw Error('The final ELSE must preserve normal follow-up.');
    for(const condition of rule.if){
      if(!ownKeys(condition,['field','operator','value'])||!Object.hasOwn(VALUES,condition.field)||!['eq','in'].includes(condition.operator))throw Error('Unknown routing condition.');
      const values=condition.operator==='in'?condition.value:[condition.value];
      if(!Array.isArray(values)||!values.length||values.length>VALUES[condition.field].length||values.some(value=>!VALUES[condition.field].includes(value)))throw Error('Invalid routing comparison value.');
    }
  });
  return structuredClone(config);
}
export function loadRules(file=new URL('./routing-rules.json',import.meta.url)){
  return validateRules(JSON.parse(fs.readFileSync(file,'utf8')));
}
export function isAfterHours(now=Date.now()){
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(new Date(now)));
  return hour<8||hour>=20;
}
export function createRuleEvaluator(config=loadRules()){
  const rules=validateRules(config),fingerprint=createHash('sha256').update(JSON.stringify(rules)).digest('hex');
  return input=>{
    const values={starts:input.starts||'unknown',stranded:input.stranded||'unknown',drivable:input.drivable||'unknown',source:input.source||'unknown',afterHours:isAfterHours(input.now)?'yes':'no'};
    for(const[key,value]of Object.entries(values))if(!VALUES[key].includes(value))throw Error('Invalid routing input.');
    const rule=rules.rules.find(row=>row.if.every(condition=>condition.operator==='eq'?values[condition.field]===condition.value:condition.value.includes(values[condition.field])));
    const urgent=rule.then.some(action=>action!=='normal');
    return {ruleId:rule.id,ruleVersion:rules.version,ruleFingerprint:fingerprint,actions:[...rule.then],priority:urgent?'first':'normal',needsReview:values.starts==='unknown'||values.stranded==='unknown',afterHours:values.afterHours==='yes'};
  };
}
