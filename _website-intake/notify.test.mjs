import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createLeadNotifier,summarize,isBigJob,createSmtpAdapter,createNtfyAdapter,createDesktopAdapter,createSmsAdapter,channelsFromEnv} from './lead-notify.mjs';
import {createLeadServers} from './server.mjs';
import {TONY_ALERT_NUMBER} from './lead-routing.mjs';

const origin='https://fixingfortmyers.com';
const DELAYS=[30000,120000,600000,1800000,3600000];
const NORMAL={priority:'normal',actions:['normal']};
const URGENT={priority:'first',actions:['notify_sms','notify_call']};
const lead=(extra={})=>({name:'Synthetic Notify Customer',phone:'2395550100',vehicle:'2014 Honda Civic',details:'Synthetic test only. The brakes squeal.',city:'Fort Myers',starts:'yes',stranded:'no',smsConsent:false,...extra});
const fakeChannel=(name,{fail=false,skipUrgent=false}={})=>{const sent=[];return {name,skipUrgent,sent,async send(message){sent.push(message);if(fail)throw Object.assign(Error('fake_down'),{detail:'503'});return {id:name};}};};
const rows=(db,id)=>db.prepare('SELECT * FROM lead_notifications WHERE lead_id=? ORDER BY channel').all(id);
const quiet=t=>t.mock.method(console,'error',()=>{});
const memoryDb=t=>{const db=new DatabaseSync(':memory:');t.after(()=>db.close());return db;};

// ---------- summarize ----------

test('summarize: urgent title, callback permission, source label, 3000-char details cap, no stray blank lines',()=>{
  const urgent=summarize(lead({smsConsent:true,source:'ai',callbackTime:'After 5 PM',starts:'no',stranded:'yes'}),'L-1',URGENT);
  assert.equal(urgent.urgent,true);
  assert.equal(urgent.title,'URGENT New repair request: 2014 Honda Civic');
  const lines=urgent.text.split('\n');
  assert.match(lines[0],/^FIRST PRIORITY: customer reports stranded/);
  for(const line of ['Name: Synthetic Notify Customer','Callback: 2395550100 (text OK)','Vehicle: 2014 Honda Civic','Location: Fort Myers','Starts: No · Stranded: Yes','Best time / notes: After 5 PM','Came from: Bay One chat','What the customer said:'])assert.ok(lines.includes(line),line);
  assert.equal(lines.at(-1),'Lead L-1');

  const plain=summarize({name:'N',phone:'2395550100',source:'voice',details:'y'.repeat(5000)},'L-2',NORMAL);
  assert.equal(plain.urgent,false);
  assert.equal(plain.title,'New repair request: vehicle not given');
  const p=plain.text.split('\n');
  assert.equal(p[0],'Name: N','no leading blank line when not urgent');
  for(const line of ['Callback: 2395550100 (call only, no text permission)','Vehicle: Not provided','Location: Not provided','Starts: Unknown · Stranded: Unknown','Came from: Website voice note'])assert.ok(p.includes(line),line);
  assert.ok(plain.text.includes('y'.repeat(3000))&&!plain.text.includes('y'.repeat(3001)));
  assert.ok(!plain.text.includes('\n\n\n'));
  assert.ok(summarize(lead(),'L-3',NORMAL).text.includes('Came from: Website form'));
  assert.equal(summarize(lead(),'L-4',undefined).urgent,false);
});

// ---------- queue: enqueue / tick / retry / crash recovery ----------

test('enqueue: one pending row per channel; SMS channel skipped only when urgent alerts really queued a text to Tony',t=>{
  const db=memoryDb(t),now=1_000_000;
  const n=createLeadNotifier(db,{channels:[fakeChannel('email'),fakeChannel('sms',{skipUrgent:true})],now:()=>now});
  assert.deepEqual(n.channels,['email','sms']);
  n.enqueue(lead(),'normal-1',NORMAL);
  assert.deepEqual(rows(db,'normal-1').map(r=>[r.channel,r.state,r.attempts,r.next_attempt_ms,r.last_error]),[['email','pending',0,now,null],['sms','pending',0,now,null]]);
  const message=JSON.parse(rows(db,'normal-1')[0].message_json);
  assert.equal(message.phone,'2395550100');assert.equal(message.urgent,false);assert.match(message.text,/Lead normal-1$/);
  n.enqueue(lead({starts:'no',stranded:'yes'}),'urgent-1',URGENT,{urgentTextQueued:true});
  assert.deepEqual(rows(db,'urgent-1').map(r=>r.channel),['email']);
  // Urgent alerts disabled, suppressed or capped: no text is queued there, so this channel still texts Tony.
  n.enqueue(lead({starts:'no',stranded:'yes'}),'urgent-2',URGENT);
  assert.deepEqual(rows(db,'urgent-2').map(r=>r.channel),['email','sms']);
  n.enqueue(lead(),'urgent-with-disabled-worker',URGENT);
  assert.deepEqual(rows(db,'urgent-with-disabled-worker').map(r=>r.channel),['email','sms']);
  // Re-enqueueing the same lead is a no-op (INSERT OR IGNORE keeps the first message).
  n.enqueue(lead({name:'Changed Name'}),'normal-1',NORMAL);
  assert.equal(rows(db,'normal-1').length,2);
  assert.ok(!rows(db,'normal-1')[0].message_json.includes('Changed Name'));
});

test('tick: sends due rows; a failing channel backs off 30s/2m/10m/30m/1h, becomes failed after 5 retries, and never blocks the others',async t=>{
  quiet(t);
  const db=memoryDb(t);let now=5_000_000;
  const good=fakeChannel('email'),bad=fakeChannel('push',{fail:true});
  const n=createLeadNotifier(db,{channels:[good,bad],now:()=>now});
  n.enqueue(lead(),'L1',NORMAL);
  await n.tick();
  assert.equal(good.sent.length,1);assert.equal(good.sent[0].phone,'2395550100');assert.match(good.sent[0].title,/^New repair request: 2014 Honda Civic$/);
  let [email,push]=rows(db,'L1');
  assert.deepEqual([email.state,email.attempts,email.last_error],['sent',1,null]);
  assert.deepEqual([push.state,push.attempts,push.last_error,push.next_attempt_ms],['pending',1,'fake_down:503',now+DELAYS[0]]);
  for(let retry=1;retry<=5;retry++){
    now+=DELAYS[retry-1]-1;await n.tick();
    assert.equal(bad.sent.length,retry,`retry ${retry} must wait for its backoff`);
    now+=1;await n.tick();
    assert.equal(bad.sent.length,retry+1);
    push=rows(db,'L1')[1];
    assert.equal(push.attempts,retry+1);
    assert.equal(push.state,retry<5?'pending':'failed');
    if(retry<5)assert.equal(push.next_attempt_ms,now+DELAYS[retry]);
  }
  now+=100*DELAYS[4];await n.tick();
  assert.equal(bad.sent.length,6,'1 attempt + 5 retries, then stop');
  assert.equal(good.sent.length,1,'a sent row is never re-sent');
  assert.deepEqual(n.inspect('L1').map(r=>[r.channel,r.state,r.attempts,r.last_error]).sort(),[['email','sent',1,null],['push','failed',6,'fake_down:503']]);
});

test('a row left in sending by a crash is reset to pending on startup and delivered again',async t=>{
  const db=memoryDb(t),now=()=>7_000_000;
  const before=createLeadNotifier(db,{channels:[fakeChannel('email')],now});
  before.enqueue(lead(),'L2',NORMAL);
  db.prepare("UPDATE lead_notifications SET state='sending',attempts=1 WHERE lead_id='L2'").run();
  const channel=fakeChannel('email');
  const restarted=createLeadNotifier(db,{channels:[channel],now});
  assert.equal(rows(db,'L2')[0].state,'pending');
  await restarted.tick();
  assert.equal(channel.sent.length,1);
  assert.deepEqual([rows(db,'L2')[0].state,rows(db,'L2')[0].attempts],['sent',2]);
});

test('overlapping ticks share one run; rows for unconfigured channels wait; nothing is sent after close',async t=>{
  const db=memoryDb(t),now=()=>9_000_000;
  createLeadNotifier(db,{channels:[fakeChannel('email'),fakeChannel('desktop')],now}).enqueue(lead(),'L3',NORMAL);
  let release,calls=0;const gate=new Promise(resolve=>{release=resolve;});
  const slow={name:'email',async send(){calls++;await gate;return {id:'slow'};}};
  const n=createLeadNotifier(db,{channels:[slow],now});
  const a=n.tick(),b=n.tick();
  assert.equal(a,b,'second tick joins the in-flight run');
  assert.equal(rows(db,'L3').find(r=>r.channel==='email').state,'sending');
  release();await a;
  assert.equal(calls,1);
  assert.deepEqual(rows(db,'L3').map(r=>[r.channel,r.state,r.attempts]),[['desktop','pending',0],['email','sent',1]]);
  await n.close();
  n.enqueue(lead(),'L4',NORMAL);await n.tick();
  assert.equal(calls,1);assert.equal(rows(db,'L4')[0].state,'pending');
});

// ---------- SMTP adapter against a fake plain-TCP server ----------

async function fakeSmtp(t,{greeting='220 fake.test ESMTP ready',authReply='235 2.7.0 Accepted',dropOn=null,splitReplies=false}={}){
  const log={commands:[],data:''},sockets=new Set();
  const server=net.createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
    let buffer='',inData=false;
    // splitReplies writes each reply in two TCP chunks to exercise the client's line buffering.
    const send=reply=>{if(!splitReplies)return socket.write(reply);socket.write(reply.slice(0,2));setTimeout(()=>{if(!socket.destroyed)socket.write(reply.slice(2));},5);};
    send(greeting+'\r\n');
    socket.on('data',chunk=>{
      buffer+=chunk.toString('utf8');
      let index;
      while((index=buffer.indexOf('\r\n'))>=0){
        const line=buffer.slice(0,index);buffer=buffer.slice(index+2);
        if(inData){if(line==='.'){inData=false;send('250 2.0.0 queued as FAKE\r\n');}else log.data+=line+'\r\n';continue;}
        log.commands.push(line);
        const verb=line.split(' ')[0].toUpperCase();
        if(verb===dropOn){socket.destroy();return;}
        if(verb==='EHLO')send('250-fake.test greets you\r\n250-AUTH PLAIN LOGIN\r\n250 SMTPUTF8\r\n');
        else if(verb==='AUTH')send(authReply+'\r\n');
        else if(verb==='MAIL'||verb==='RCPT')send('250 2.1.0 OK\r\n');
        else if(verb==='DATA'){inData=true;send('354 Go ahead\r\n');}
        else if(verb==='QUIT')socket.end('221 bye\r\n');
        else send('502 unknown\r\n');
      }
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  t.after(()=>new Promise(resolve=>{for(const socket of sockets)socket.destroy();server.close(resolve);}));
  return {log,port,connect:()=>net.connect(port,'127.0.0.1')};
}

test('SMTP adapter: EHLO, AUTH PLAIN, one RCPT per recipient, UTF-8 subject and base64 body',async t=>{
  const smtp=await fakeSmtp(t,{splitReplies:true});
  const email=createSmtpAdapter({host:'smtp.example.test',port:smtp.port,user:'shop@example.test',pass:'synthetic-app-pass',to:['tony@example.test','desk@example.test'],connect:smtp.connect});
  assert.equal(email.name,'email');
  const message=summarize(lead({vehicle:'2014 Honda Civic — silver',details:'Synthetic test only.\nLine two with ümlaut.'}),'L-SMTP',URGENT);
  assert.deepEqual(await email.send(message),{id:'smtp'});
  const [ehlo,auth,mail,...rest]=smtp.log.commands;
  assert.match(ehlo,/^EHLO \S+$/);
  assert.match(auth,/^AUTH PLAIN /);
  assert.equal(Buffer.from(auth.slice('AUTH PLAIN '.length),'base64').toString('utf8'),'\0shop@example.test\0synthetic-app-pass');
  assert.equal(mail,'MAIL FROM:<shop@example.test>');
  assert.deepEqual(rest.slice(0,3),['RCPT TO:<tony@example.test>','RCPT TO:<desk@example.test>','DATA']);
  const [head,...bodyParts]=smtp.log.data.split('\r\n\r\n');
  const headers=head.split('\r\n');
  assert.ok(headers.includes('From: Perfect Timing Website <shop@example.test>'));
  assert.ok(headers.includes('To: tony@example.test, desk@example.test'));
  assert.ok(headers.includes('Content-Transfer-Encoding: base64'));
  const subject=headers.find(h=>h.startsWith('Subject: ')).slice(9).match(/^=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=$/);
  assert.ok(subject,'RFC 2047 encoded subject');
  assert.equal(Buffer.from(subject[1],'base64').toString('utf8'),message.title);
  const bodyLines=bodyParts.join('\r\n\r\n').split('\r\n').filter(Boolean);
  assert.ok(bodyLines.every(line=>line.length<=76),'base64 body wrapped at 76 columns');
  assert.equal(Buffer.from(bodyLines.join(''),'base64').toString('utf8'),message.text);
});

test('SMTP adapter rejects on a 535 auth reply, a non-220 greeting, or a dropped connection',async t=>{
  const badAuth=await fakeSmtp(t,{authReply:'535 5.7.8 Username and Password not accepted'});
  const send=(server,extra={})=>createSmtpAdapter({host:'smtp.example.test',user:'shop@example.test',pass:'wrong',to:['tony@example.test'],connect:server.connect,...extra}).send({title:'t',text:'x'});
  await assert.rejects(send(badAuth),err=>err.message==='smtp_rejected'&&err.detail==='535');
  assert.ok(!badAuth.log.commands.some(line=>line.startsWith('MAIL')),'no mail sent after failed auth');
  const busy=await fakeSmtp(t,{greeting:'421 4.3.2 try later'});
  await assert.rejects(send(busy),err=>err.message==='smtp_rejected'&&err.detail==='421');
  const dropped=await fakeSmtp(t,{dropOn:'EHLO'});
  await assert.rejects(send(dropped));
});

test('SMTP adapter refuses incomplete or malformed configuration',()=>{
  const ok={host:'smtp.example.test',user:'shop@example.test',pass:'p',to:['tony@example.test']};
  for(const bad of [{host:''},{user:''},{pass:''},{to:[]},{to:['not-an-email']},{to:['a@b.c','two words@b.c']},{to:['<x>@b.c']}])assert.throws(()=>createSmtpAdapter({...ok,...bad}),/Invalid email alert configuration/);
  assert.doesNotThrow(()=>createSmtpAdapter(ok));
});

// ---------- ntfy adapter ----------

test('ntfy adapter: POST /<topic>, urgent vs high priority, tel: call action, rejects bad responses and short topics',async()=>{
  const requests=[];let status=200;
  const fetchImpl=async(url,options)=>{requests.push({url,options});return {ok:status>=200&&status<300,status};};
  const topic='pt-leads-0123456789abcdef';
  const push=createNtfyAdapter({topic,server:'https://ntfy.example.test/',fetchImpl});
  assert.equal(push.name,'push');
  const urgent=summarize(lead({starts:'no',stranded:'yes'}),'L-PUSH',URGENT);
  assert.deepEqual(await push.send({...urgent,phone:'+1 (239) 555-0100'}),{id:'ntfy'});
  const [first]=requests;
  assert.equal(first.url,`https://ntfy.example.test/${topic}`);
  assert.equal(first.options.method,'POST');
  assert.equal(first.options.body,urgent.text);
  assert.equal(first.options.headers.Priority,'urgent');
  assert.equal(first.options.headers.Tags,'rotating_light');
  assert.equal(first.options.headers.Actions,'view, Call customer, tel:+12395550100');
  assert.ok(first.options.signal instanceof AbortSignal);
  await push.send(summarize(lead(),'L-PUSH-2',NORMAL));
  assert.equal(requests[1].options.headers.Priority,'high');
  assert.equal(requests[1].options.headers.Tags,'wrench');
  assert.equal(requests[1].options.headers.Actions,undefined,'no call action without a phone');
  // A title with characters that cannot go in an HTTP header falls back to a safe title.
  await push.send({title:'New repair request: Citroën 🚗',text:'x'});
  assert.equal(requests[2].options.headers.Title,'New repair request: Citron');
  assert.equal(createNtfyAdapter({topic,fetchImpl}).name,'push');
  status=500;
  await assert.rejects(push.send({title:'t',text:'x'}),err=>err.message==='push_rejected'&&err.detail==='500');
  for(const bad of [undefined,'','short','x'.repeat(15),'x'.repeat(65),'has spaces in the topic','bad/topic/0123456789'])assert.throws(()=>createNtfyAdapter({topic:bad,fetchImpl}),/Invalid push alert topic/,String(bad));
  assert.doesNotThrow(()=>createNtfyAdapter({topic:'x'.repeat(16),fetchImpl}));
});

// Regression: the push title keeps URGENT and the vehicle instead of falling back to generic text.
test('ntfy Title header carries the real plain-ASCII title (URGENT + vehicle)',async()=>{
  const requests=[];
  const push=createNtfyAdapter({topic:'pt-leads-0123456789abcdef',fetchImpl:async(url,options)=>{requests.push(options);return {ok:true,status:200};}});
  const urgent=summarize(lead({starts:'no',stranded:'yes'}),'L-TITLE',URGENT);
  await push.send(urgent);
  assert.equal(requests[0].headers.Title,'URGENT New repair request: 2014 Honda Civic');
});

// ---------- desktop + sms adapters ----------

test('desktop adapter runs an encoded PowerShell toast and maps exit 0 / exit 1 / spawn error',async()=>{
  const calls=[];let outcome=['exit',0];
  const run=(command,args,options)=>{calls.push({command,args,options});const child=new EventEmitter();child.kill=()=>{};setImmediate(()=>child.emit(...outcome));return child;};
  run.fake=true;
  const desktop=createDesktopAdapter({run});
  assert.equal(desktop.name,'desktop');
  assert.deepEqual(await desktop.send({title:'URGENT New repair request: <Civic> & "Co"',text:'Line one\n'+'z'.repeat(1000)}),{id:'toast'});
  const {command,args,options}=calls[0];
  assert.equal(command,'powershell.exe');
  assert.deepEqual(args.slice(0,3),['-NoProfile','-NonInteractive','-EncodedCommand']);
  assert.equal(options.windowsHide,true);
  const script=Buffer.from(args[3],'base64').toString('utf16le');
  const toast=Buffer.from(script.match(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/)[1],'base64').toString('utf8');
  assert.ok(toast.includes('<text>URGENT New repair request: &lt;Civic&gt; &amp; &quot;Co&quot;</text>'));
  assert.ok(toast.includes('z'.repeat(591))&&!toast.includes('z'.repeat(592)),'toast body capped at 600 characters');
  outcome=['exit',1];
  await assert.rejects(desktop.send({title:'t',text:'x'}),/desktop_failed/);
  outcome=['error',new Error('ENOENT')];
  await assert.rejects(desktop.send({title:'t',text:'x'}),/desktop_unavailable/);
});

test('sms adapter texts the fixed Tony number, is marked skipUrgent, and caps the body',async()=>{
  const sent=[];
  const sms=createSmsAdapter({fromNumber:'+12025550100',send:async(channel,body)=>{sent.push({channel,body});return {id:'SM'+'a'.repeat(32)};}});
  assert.equal(sms.name,'sms');assert.equal(sms.skipUrgent,true);
  assert.deepEqual(await sms.send({text:'q'.repeat(3000)}),{id:'SM'+'a'.repeat(32)});
  assert.equal(sent[0].channel,'notify_sms');
  assert.equal(sent[0].body.To,TONY_ALERT_NUMBER);assert.equal(sent[0].body.From,'+12025550100');
  assert.match(sent[0].body.Body,/^Perfect Timing website lead\n/);assert.equal(sent[0].body.Body.length,1500);
});

// ---------- channelsFromEnv ----------

test('channelsFromEnv enables only configured channels and reports bad settings',()=>{
  const base={LEAD_DESKTOP_ALERTS:'false'};
  const configured=channelsFromEnv({...base,SMTP_USER:'shop@example.test',SMTP_PASS:'abcd efgh ijkl mnop',NTFY_TOPIC:'pt-leads-0123456789abcdef'});
  assert.deepEqual(configured.channels.map(c=>c.name),['email','push']);
  assert.deepEqual(configured.problems,[]);
  assert.deepEqual(channelsFromEnv(base),{channels:[],problems:[]});
  assert.deepEqual(channelsFromEnv({...base,SMTP_USER:'shop@example.test'}).channels,[],'password missing: email off');
  const bad=channelsFromEnv({...base,SMTP_USER:'shop@example.test',SMTP_PASS:'p',LEAD_ALERT_EMAILS:'not-an-email',NTFY_TOPIC:'short'});
  assert.deepEqual(bad.channels,[]);
  assert.deepEqual(bad.problems,['email: Invalid email alert configuration.','push: Invalid push alert topic.']);
  const smsConfig={...base,TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'synthetic-token',LEAD_ALERT_FROM:'+12025550100'};
  assert.deepEqual(channelsFromEnv(smsConfig).channels,[],'credentials alone do not activate paid SMS');
  const sms=channelsFromEnv({...smsConfig,LEAD_ALERTS_ENABLED:'true'});
  assert.deepEqual(sms.channels.map(c=>[c.name,c.skipUrgent]),[['sms',true]]);
  if(process.platform==='win32')assert.deepEqual(channelsFromEnv({}).channels.map(c=>c.name),['desktop'],'desktop is on by default on Windows');
});

// ---------- through the receiver ----------

async function setup(t,options={}){
  const app=createLeadServers({dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'pt-notify-')),alertWorker:false,besideToken:'',...options});
  const ports=await app.start(0,0);t.after(()=>app.close());
  return {app,base:'http://127.0.0.1:'+ports.publicPort,admin:'http://127.0.0.1:'+ports.adminPort,
    send:(input,key=randomUUID())=>fetch('http://127.0.0.1:'+ports.publicPort+'/hooks/lead/webform',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(input)})};
}

test('receiver: a web-form lead queues one notification per channel; a same-key retry does not queue again; inbox shows them',async t=>{
  const email=fakeChannel('email'),push=fakeChannel('push');
  const x=await setup(t,{notifyChannels:[email,push]});
  const key=randomUUID(),payload=lead();
  const first=await x.send(payload,key);assert.equal(first.status,201);
  const {id}=await first.json();
  assert.deepEqual(rows(x.app.db,id).map(r=>r.channel),['email','push']);
  await x.app.notifier.tick();
  assert.equal(email.sent.length,1);assert.equal(push.sent.length,1);
  assert.match(email.sent[0].text,new RegExp(`Lead ${id}$`));
  const again=await x.send(payload,key);assert.equal(again.status,200);assert.equal((await again.json()).id,id);
  await x.app.notifier.tick();
  assert.equal(x.app.db.prepare('SELECT count(*) n FROM lead_notifications').get().n,2);
  assert.equal(email.sent.length,1);assert.equal(push.sent.length,1);
  const inbox=await(await fetch(x.admin+'/api/leads')).json();
  const row=inbox.leads.find(l=>l.id===id);
  assert.ok(Array.isArray(row.notifications));
  assert.deepEqual(row.notifications.map(n=>[n.channel,n.state,n.attempts,n.last_error]).sort(),[['email','sent',1,null],['push','sent',1,null]]);
});

test('receiver: urgent lead skips the SMS channel only when urgent alerts queued a text; one failing channel stays pending',async t=>{
  quiet(t);
  const email=fakeChannel('email'),sms=fakeChannel('sms',{skipUrgent:true}),push=fakeChannel('push',{fail:true});
  const x=await setup(t,{notifyChannels:[email,sms,push],alerts:{adapter:{fromNumber:'+12025550100',async send(){return {id:'synthetic'};},async status(){return 'delivered';}}}});
  const urgent=await(await x.send(lead({starts:'no',stranded:'yes'}))).json();
  assert.equal(urgent.routing.priority,'first');
  assert.deepEqual(rows(x.app.db,urgent.id).map(r=>r.channel),['email','push']);
  const normal=await(await x.send(lead({phone:'2395550101'}))).json();
  assert.deepEqual(rows(x.app.db,normal.id).map(r=>r.channel),['email','push','sms']);
  await x.app.notifier.tick();
  assert.equal(email.sent.length,2);assert.equal(sms.sent.length,1);
  const inbox=await(await fetch(x.admin+'/api/leads')).json();
  const shown=inbox.leads.find(l=>l.id===urgent.id).notifications;
  assert.deepEqual(shown.map(n=>[n.channel,n.state]).sort(),[['email','sent'],['push','pending']]);
  assert.equal(shown.find(n=>n.channel==='push').last_error,'fake_down:503');
});

test('receiver: the notification row is written in the lead transaction (a queue failure rolls the lead back)',async t=>{
  quiet(t);
  const x=await setup(t,{notifyChannels:[fakeChannel('email')]});
  x.app.db.exec("CREATE TRIGGER fail_notify BEFORE INSERT ON lead_notifications BEGIN SELECT RAISE(ABORT,'synthetic queue failure'); END;");
  assert.equal((await x.send(lead())).status,503);
  assert.equal(x.app.db.prepare('SELECT count(*) n FROM leads').get().n,0);
  x.app.db.exec('DROP TRIGGER fail_notify');
  assert.equal((await x.send(lead())).status,201);
  assert.equal(x.app.db.prepare('SELECT count(*) n FROM lead_notifications').get().n,1);
});

test('receiver: with urgent alerts disabled an urgent lead still texts Tony through the SMS channel',async t=>{
  quiet(t);
  const sms=fakeChannel('sms',{skipUrgent:true});
  const x=await setup(t,{notifyChannels:[sms]});
  const urgent=await(await x.send(lead({starts:'no',stranded:'yes'}))).json();
  assert.equal(urgent.routing.priority,'first');
  assert.deepEqual(rows(x.app.db,urgent.id).map(r=>r.channel),['sms']);
});

test('run: rows for a channel that is no longer configured never block configured channels',async t=>{
  const db=memoryDb(t);let now=1_000_000;
  const old=createLeadNotifier(db,{channels:[fakeChannel('push')],now:()=>now});
  for(let i=0;i<25;i++)old.enqueue(lead(),'old-'+i,NORMAL);
  now+=1000;
  const email=fakeChannel('email'),n=createLeadNotifier(db,{channels:[email],now:()=>now});
  n.enqueue(lead(),'fresh',NORMAL);await n.tick();
  assert.equal(email.sent.length,1);
});

test('run: a text that may have gone out is never resent (Twilio cannot dedupe)',async t=>{
  const db=memoryDb(t);let now=1_000_000;
  const sms={...fakeChannel('sms',{fail:true}),noRetry:true};
  const n=createLeadNotifier(db,{channels:[sms],now:()=>now});
  n.enqueue(lead(),'L9',NORMAL);await n.tick();now+=86400000;await n.tick();
  assert.equal(sms.sent.length,1);assert.equal(rows(db,'L9')[0].state,'needs_review');
  db.prepare("UPDATE lead_notifications SET state='sending'").run();
  createLeadNotifier(db,{channels:[sms],now:()=>now});
  assert.equal(rows(db,'L9')[0].state,'needs_review');
});

test('big jobs (engine, transmission, rebuild) are tagged so Tony calls them back first; small jobs are not',()=>{
  for(const details of ['Rod knock on my 5.3, thinking rebuild or engine swap','Transmission slipping between 2nd and 3rd','Blown head gasket, white smoke','Burning oil and blue smoke on startup','Engine won’t shift… actually the trans won’t go into gear'])
    assert.equal(isBigJob({details}),true,details);
  for(const details of ['Battery keeps dying overnight','Brakes squeal when I stop','AC blows warm at idle','Need an oil change and battery swap'])
    assert.equal(isBigJob({details}),false,details);
  const big=summarize({name:'Synthetic',phone:'2395550100',vehicle:'2014 Silverado',details:'Rod knock, rebuild or replace?'},'L1',{priority:'normal',actions:['normal']});
  assert.match(big.title,/^BIG JOB New repair request: 2014 Silverado$/);assert.match(big.text,/^BIG JOB: .*Call back first\./m);assert.equal(big.bigJob,true);
  const small=summarize({name:'Synthetic',phone:'2395550100',vehicle:'2014 Silverado',details:'Brakes squeal'},'L2',{priority:'normal',actions:['normal']});
  assert.doesNotMatch(small.title+small.text,/BIG JOB/);
  const both=summarize({name:'Synthetic',phone:'2395550100',vehicle:'Civic',details:'Spun bearing, stranded',starts:'no',stranded:'yes'},'L3',{priority:'first',actions:['notify_sms']});
  assert.match(both.title,/^URGENT BIG JOB New repair request/);
});

test('summarize: City / ZIP and sender or car map appear in Tony alerts', () => {
  const withCar = summarize(lead({
    city: 'Cape Coral',
    carLocation: {type:'address', address:'123 Example St, Fort Myers'},
  }), 'L-loc', NORMAL);
  assert.ok(withCar.text.split('\n').includes('Location: 123 Example St, Fort Myers'));
  assert.ok(withCar.text.split('\n').includes('City / ZIP: Cape Coral'));
  assert.ok(withCar.text.split('\n').includes('Map: https://www.google.com/maps/search/?api=1&query=123%20Example%20St%2C%20Fort%20Myers'));

  const withSender = summarize(lead({
    city: 'Lehigh Acres',
    latitude: 26.625,
    longitude: -81.625,
    mapsLink: 'https://www.google.com/maps/search/?api=1&query=26.625%2C-81.625',
  }), 'L-pin', NORMAL);
  assert.ok(withSender.text.split('\n').includes('Location: Lehigh Acres'));
  assert.ok(withSender.text.split('\n').includes('Map: https://www.google.com/maps/search/?api=1&query=26.625%2C-81.625'));
});
