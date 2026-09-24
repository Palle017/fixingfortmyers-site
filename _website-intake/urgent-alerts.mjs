import {TONY_ALERT_NUMBER} from './lead-routing.mjs';
import {createHash} from 'node:crypto';

const issue=(code,{retryable=false,uncertain=false}={})=>Object.assign(new Error(code),{code,retryable,uncertain});
const DELAYS=[60000,300000,900000,3600000,10800000];
const safeCode=code=>['rate_limited','request_rejected','destination_mismatch','provider_unavailable','provider_response','delivery_check_failed'].includes(code)?code:'provider_unavailable';

export function createTwilioAlertAdapter({accountSid,authToken,fromNumber,toNumber=TONY_ALERT_NUMBER,fetchImpl=fetch}={}){
  if(!/^AC[a-f0-9]{32}$/i.test(accountSid||'')||!authToken||!/^\+[1-9]\d{9,14}$/.test(fromNumber||'')||fromNumber===TONY_ALERT_NUMBER||toNumber!==TONY_ALERT_NUMBER)throw Error('Invalid approved alert configuration.');
  const base=`https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;
  const headers={Authorization:'Basic '+Buffer.from(accountSid+':'+authToken).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'};
  async function request(url,options={}){
    let response;
    try{response=await fetchImpl(url,{...options,headers,signal:AbortSignal.timeout(10000)});}catch{throw issue('provider_unavailable',{uncertain:options.method==='POST'});}
    if(response.status===429)throw issue('rate_limited',{retryable:true});
    if(response.status>=500)throw issue('provider_unavailable',{uncertain:options.method==='POST'});
    if(!response.ok)throw issue('request_rejected');
    let result;try{result=await response.json();}catch{throw issue('provider_response',{uncertain:options.method==='POST'});}
    return result;
  }
  return {
    async send(channel,body){
      if(body.To!==TONY_ALERT_NUMBER||body.From!==fromNumber)throw issue('destination_mismatch');
      const resource=channel==='notify_sms'?'Messages':'Calls';
      const result=await request(`${base}/${resource}.json`,{method:'POST',body:new URLSearchParams(body).toString()});
      if(!new RegExp('^'+(channel==='notify_sms'?'SM':'CA')+'[a-f0-9]{32}$','i').test(result.sid||''))throw issue('provider_response',{uncertain:true});
      return {id:result.sid};
    },
    async status(channel,id){
      if(!new RegExp('^'+(channel==='notify_sms'?'SM':'CA')+'[a-f0-9]{32}$','i').test(id||''))throw issue('provider_response');
      const resource=channel==='notify_sms'?'Messages':'Calls',result=await request(`${base}/${resource}/${id}.json`);
      if(result.sid!==id||result.to!==TONY_ALERT_NUMBER)throw issue('provider_response');
      return result.status;
    },fromNumber,
  };
}
function alertBody(lead,id,channel,fromNumber){
  if(channel==='notify_sms')return {To:TONY_ALERT_NUMBER,From:fromNumber,Body:[
    'Perfect Timing: FIRST PRIORITY — customer reports stranded + no start.',`Lead ${id}`,`Name: ${lead.name}`,`Callback: ${lead.phone}`,
    `Vehicle: ${lead.vehicle||'Unknown'}`,`City/ZIP: ${lead.city||'Not provided'}`,`Symptoms: ${(lead.details||'Not provided').slice(0,1200)}`,
    `Starts: ${lead.starts||'unknown'}; stranded: ${lead.stranded||'unknown'}`,`Contact: ${lead.smsConsent?'text permission recorded':'call only; no text permission'}`,
    'Review the saved inquiry; Tony confirms dispatch. Reply STOP to opt out.',
  ].join('\n')};
  // Do not speak personal customer data into voicemail or an unknown answerer.
  return {To:TONY_ALERT_NUMBER,From:fromNumber,Twiml:'<Response><Say>Perfect Timing urgent website inquiry. A customer reports being stranded with a vehicle that does not start. Please review your website inbox and the text alert. No dispatch has been confirmed.</Say></Response>',Timeout:'25'};
}
export function createUrgentAlerts(db,options={}){
  const now=options.now||Date.now;let adapter=options.adapter||null;
  const cooldownMinutes=options.cooldownMinutes??15,maxDailyPairs=options.maxDailyPairs??20;
  if(!Number.isInteger(cooldownMinutes)||cooldownMinutes<5||cooldownMinutes>1440||!Number.isInteger(maxDailyPairs)||maxDailyPairs<1||maxDailyPairs>100)throw Error('Invalid bounded alert limits.');
  if(!adapter&&options.enabled===true)adapter=createTwilioAlertAdapter({accountSid:process.env.TWILIO_ACCOUNT_SID,authToken:process.env.TWILIO_AUTH_TOKEN,fromNumber:process.env.LEAD_ALERT_FROM,toNumber:process.env.LEAD_ALERT_TO});
  db.exec(`CREATE TABLE IF NOT EXISTS lead_routes(lead_id TEXT PRIMARY KEY,decision_json TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS urgent_alerts(lead_id TEXT NOT NULL,channel TEXT NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,provider_id TEXT,body_json TEXT,next_attempt_ms INTEGER NOT NULL,last_error TEXT,updated_at TEXT NOT NULL,PRIMARY KEY(lead_id,channel));
    CREATE INDEX IF NOT EXISTS urgent_alerts_due ON urgent_alerts(state,next_attempt_ms);
    CREATE TABLE IF NOT EXISTS urgent_alert_budget(lead_id TEXT PRIMARY KEY,callback_key TEXT NOT NULL,created_ms INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS urgent_alert_budget_callback ON urgent_alert_budget(callback_key,created_ms);`);
  // Twilio create endpoints have no documented client idempotency key. A crash
  // after send but before SID commit must never replay the call/text blindly.
  db.prepare("UPDATE urgent_alerts SET state='needs_review',last_error='interrupted_send',updated_at=? WHERE state='sending'").run(new Date(now()).toISOString());
  let timer=null,busy=null,closing=false;
  const stamp=()=>new Date(now()).toISOString();
  function reserve(lead,id){
    db.prepare('DELETE FROM urgent_alert_budget WHERE created_ms<?').run(now()-86400000);
    if(db.prepare('SELECT 1 FROM urgent_alert_budget WHERE lead_id=?').get(id))return null;
    const digits=String(lead.phone).replace(/\D/g,''),callbackKey=createHash('sha256').update(digits.length===10?'1'+digits:digits).digest('hex');
    if(db.prepare('SELECT 1 FROM urgent_alert_budget WHERE callback_key=? AND created_ms>?').get(callbackKey,now()-cooldownMinutes*60000))return 'callback_cooldown';
    if(db.prepare('SELECT COUNT(*) n FROM urgent_alert_budget').get().n>=maxDailyPairs)return 'global_daily_cap';
    db.prepare('INSERT INTO urgent_alert_budget VALUES(?,?,?)').run(id,callbackKey,now());return null;
  }
  function enqueue(lead,id,decision){
    db.prepare('INSERT INTO lead_routes VALUES(?,?,?)').run(id,JSON.stringify(decision),stamp());
    const suppression=adapter&&decision.actions.some(action=>action!=='normal')?reserve(lead,id):null;
    for(const channel of decision.actions.filter(action=>action!=='normal')){
      const body=adapter?alertBody(lead,id,channel,adapter.fromNumber):null;
      db.prepare('INSERT INTO urgent_alerts(lead_id,channel,state,body_json,next_attempt_ms,last_error,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,channel,adapter?(suppression?'suppressed':'pending'):'disabled',body?JSON.stringify(body):null,now(),suppression,stamp());
    }
  }
  function update(row,state,error=null,next=now(),providerId=row.provider_id){db.prepare('UPDATE urgent_alerts SET state=?,last_error=?,next_attempt_ms=?,provider_id=?,updated_at=? WHERE lead_id=? AND channel=?').run(state,error,next,providerId,stamp(),row.lead_id,row.channel);}
  async function run(){
    if(!adapter||closing)return;
    const rows=db.prepare("SELECT urgent_alerts.*,leads.received_at FROM urgent_alerts JOIN leads ON leads.id=urgent_alerts.lead_id WHERE state IN ('pending','accepted') AND next_attempt_ms<=? ORDER BY next_attempt_ms LIMIT 10").all(now());
    for(const row of rows){
      if(closing)break;
      if(row.state==='accepted'){
        try{
          const status=await adapter.status(row.channel,row.provider_id);
          if(row.channel==='notify_sms'&&status==='delivered')update(row,'delivered');
          else if(row.channel==='notify_call'&&status==='completed')update(row,'completed');
          else if(['failed','undelivered','canceled','busy','no-answer'].includes(status))update(row,'failed','provider_'+status);
          else update(row,now()-Date.parse(row.received_at)>86400000?'needs_review':'accepted',null,now()+60000);
        }catch{update(row,now()-Date.parse(row.received_at)>86400000?'needs_review':'accepted','delivery_check_failed',now()+300000);}continue;
      }
      db.prepare("UPDATE urgent_alerts SET state='sending',attempts=attempts+1,updated_at=? WHERE lead_id=? AND channel=?").run(stamp(),row.lead_id,row.channel);
      try{
        const result=await adapter.send(row.channel,JSON.parse(row.body_json));
        if(typeof result?.id!=='string')throw issue('provider_response',{uncertain:true});
        update(row,'accepted',null,now()+30000,result.id);
      }catch(err){
        const uncertain=err.uncertain!==false&&!err.retryable&&!['request_rejected','destination_mismatch'].includes(err.code);
        const state=uncertain?'needs_review':err.retryable&&row.attempts<DELAYS.length?'pending':'failed';
        update(row,state,safeCode(err.code),now()+DELAYS[Math.min(row.attempts,DELAYS.length-1)]);
      }
    }
  }
  function tick(){if(busy)return busy;busy=run().finally(()=>{busy=null;});return busy;}
  function retry(leadId,channel){
    const row=db.prepare('SELECT * FROM urgent_alerts WHERE lead_id=? AND channel=?').get(leadId,channel);
    if(!row)throw Object.assign(Error('Alert not found.'),{status:404});
    if(!adapter)throw Object.assign(Error('Alert delivery is disabled.'),{status:409});
    if(['needs_review','sending','delivered','completed'].includes(row.state))throw Object.assign(Error('Review this alert before attempting another send.'),{status:409});
    const lead=db.prepare('SELECT payload_json FROM leads WHERE id=?').get(leadId),payload=JSON.parse(lead.payload_json);
    if(!row.provider_id){const suppression=reserve(payload,leadId);if(suppression){update(row,'suppressed',suppression);throw Object.assign(Error('Alert limit active; the inquiry remains saved for review.'),{status:409});}}
    if(!row.body_json){
      db.prepare('UPDATE urgent_alerts SET body_json=? WHERE lead_id=? AND channel=?').run(JSON.stringify(alertBody(payload,leadId,channel,adapter.fromNumber)),leadId,channel);
    }
    // A provider SID means check the existing delivery, never create another one.
    update(row,row.provider_id?'accepted':'pending');return {ok:true,state:row.provider_id?'accepted':'pending'};
  }
  return {enqueue,tick,retry,enabled:!!adapter,
    inspect:id=>({routing:JSON.parse(db.prepare('SELECT decision_json FROM lead_routes WHERE lead_id=?').get(id)?.decision_json||'null'),alerts:db.prepare('SELECT channel,state,attempts,last_error,updated_at FROM urgent_alerts WHERE lead_id=?').all(id)}),
    start(){if(adapter&&!timer){timer=setInterval(()=>{tick().catch(()=>console.error(JSON.stringify({event:'urgent_alert_worker_failed'})));},15000);timer.unref();}},
    async close(){closing=true;clearInterval(timer);if(busy)await busy;},
  };
}
