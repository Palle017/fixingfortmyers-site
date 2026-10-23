// Synthetic browser boundary: no live Cloud Intake, sign-in, provider or customer messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {webcrypto} from 'node:crypto';
import {mountConversation,configuredEndpoint} from '../customer-conversation.js';
import {QUESTIONS,makeIntake} from '../customer-conversation-protocol.js';

const html=fs.readFileSync(new URL('../customer-conversation.html',import.meta.url),'utf8');
const configScript=fs.readFileSync(new URL('../customer-conversation-config.js',import.meta.url),'utf8');
const STORAGE_KEY='pt-customer-conversation-v1',endpoint='https://cloud.example.invalid';
const idA='11111111-1111-4111-8111-111111111111',idB='22222222-2222-4222-8222-222222222222';
const tokenA='A'.repeat(43),tokenB='B'.repeat(43);
const operation='33333333-3333-4333-8333-333333333333';
const answers={details:'Synthetic engine stalls',name:'Synthetic Customer',phone:'239-555-0100',vehicle:'2018 Example Sedan',starts:'yes',drivable:'unknown',location:'Synthetic roadside city'};
const blank=()=>({version:1,endpoint,answers:{},access:null,pendingCreate:null,pendingReply:null,draftReply:''});
const reply=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);};
const receipt=operationId=>({operationId,messageId:'message-'+operationId,sequence:15});
const view=(id=idA,{messages=[],cursor=0,repair=makeIntake(answers)}={})=>({ok:true,conversation:{id,leadId:id,expiresAt:'2027-01-01T00:00:00.000Z',repair},messages,cursor});
const message=(id,sequence,role,body,operationId=operation)=>({id,sequence,role,body,operationId,createdAt:'2026-10-23T12:00:00.000Z'});

function setup(t,{url='https://preview.invalid/customer-conversation.html',config={enabled:true,endpoint},state=null,fetcher=async()=>reply({ok:false},404),storageThrows=false}={}){
  const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document,requests=[];
  Object.defineProperty(w,'crypto',{value:webcrypto});
  if(state)w.sessionStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  if(storageThrows)Object.defineProperty(w,'sessionStorage',{get(){throw Error('synthetic unavailable');}});
  w.fetch=async(target,options)=>{requests.push({target,options,hash:w.location.hash});return fetcher(target,options);};
  const app=mountConversation(w,config);
  t.after(()=>{app.destroy();w.close();});
  const submit=(formId='question-form')=>d.getElementById(formId).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  const answer=value=>{d.getElementById('question-answer').value=value;submit();};
  return {w,d,requests,app,submit,answer,state:()=>JSON.parse(w.sessionStorage.getItem(STORAGE_KEY))};
}

test('default configuration keeps the portal closed and makes no network calls',async t=>{
  const x=setup(t,{config:{enabled:false,endpoint:''}});await x.app.ready;
  assert.equal(x.d.getElementById('conversation-app').hidden,true);
  assert.equal(x.d.getElementById('unavailable').hidden,false);
  assert.equal(x.requests.length,0);
  assert.match(configScript,/enabled:false, endpoint:''/);
  assert.equal(x.d.querySelector('script[src="site.js"]'),null);
  assert.equal(x.d.querySelector('meta[name="referrer"]').content,'no-referrer');
  assert.equal(x.d.querySelector('meta[name="robots"]').content,'noindex, nofollow, noarchive');
  assert.equal([...x.d.querySelectorAll('[src],[href]')].some(n=>/^https?:/.test(n.getAttribute('src')||n.getAttribute('href'))),false);
});

test('endpoint accepts origin configuration only and rejects URL credentials, paths, queries and insecure hosts',()=>{
  for(const value of ['http://remote.invalid','https://cloud.invalid/api','https://user:secret@cloud.invalid/','https://cloud.invalid/?token=secret','https://cloud.invalid/#secret','javascript:alert(1)',''])assert.equal(configuredEndpoint({enabled:true,endpoint:value}),null);
  assert.equal(configuredEndpoint({enabled:true,endpoint:'https://cloud.invalid/'}),'https://cloud.invalid');
  assert.equal(configuredEndpoint({enabled:true,endpoint:'http://127.0.0.1:18777'}),'http://127.0.0.1:18777');
});

test('guide asks one missing question, permits corrections, and does not send draft answers',async t=>{
  const x=setup(t);await x.app.ready;
  for(const item of QUESTIONS){
    assert.equal(x.d.querySelectorAll('#question-answer').length,1);
    assert.equal(x.d.getElementById('question-label').textContent,item.prompt);
    x.answer(answers[item.field]);
  }
  assert.equal(x.d.getElementById('intake-review').hidden,false);
  assert.equal(x.requests.length,0);
  x.d.querySelector('#review-answers button[aria-label^="Edit What is happening"]').click();
  x.answer('Corrected synthetic symptoms');
  assert.equal(x.d.getElementById('intake-review').hidden,false);
  assert.equal(x.state().answers.details,'Corrected synthetic symptoms');
  for(const field of ['name','phone','vehicle','starts','drivable','location'])assert.equal(x.state().answers[field],answers[field]);
  assert.match(x.d.getElementById('conversation-status').textContent,/Unsent draft/);
});

test('resumed prefilled draft skips supplied details and preserves the rest on correction',async t=>{
  const state={...blank(),answers:{details:answers.details,name:answers.name,phone:answers.phone,vehicle:answers.vehicle}};
  const x=setup(t,{state});await x.app.ready;
  assert.equal(x.d.getElementById('question-answer').name,'starts');
  x.answer('no');x.answer(answers.drivable);x.answer(answers.location);
  assert.equal(x.d.getElementById('intake-review').hidden,false);
  x.d.querySelector('#review-answers button[aria-label^="Edit What name"]').click();x.answer('Corrected Synthetic');
  assert.equal(x.state().answers.name,'Corrected Synthetic');
  assert.equal(x.state().answers.details,answers.details);
  assert.equal(x.state().answers.starts,'no');
  assert.equal(x.requests.length,0);
});

test('missing and invalid answers stay on the same question with an accessible error',async t=>{
  const x=setup(t);await x.app.ready;x.answer('');
  assert.equal(x.d.getElementById('question-answer').name,'details');
  assert.match(x.d.getElementById('question-error').textContent,/Enter an answer/);
  x.answer(answers.details);x.answer(answers.name);x.answer('123');
  assert.equal(x.d.getElementById('question-answer').name,'phone');
  assert.match(x.d.getElementById('question-error').textContent,/10 to 15/);
  assert.equal(x.requests.length,0);
});

test('create stores the operation before sending; timeout and reload retain its exact identity',async t=>{
  const sent=[];
  const x=setup(t,{state:{...blank(),answers},fetcher:async(target,options)=>{
    if(target.includes('/operations/'))return reply({ok:false},404);
    assert.equal(target,endpoint+'/conversations');
    const body=JSON.parse(options.body);sent.push(body);
    assert.deepEqual(x.state().pendingCreate,body);
    throw Error('synthetic lost acknowledgment');
  }});await x.app.ready;x.d.getElementById('send-inquiry').click();await settle();
  assert.equal(sent.length,1);
  assert.match(x.d.getElementById('conversation-status').textContent,/could not be confirmed/);
  const pending=x.state();assert.deepEqual(pending.pendingCreate,sent[0]);
  assert.equal(pending.pendingCreate.intake.smsConsent,false);
  const y=setup(t,{state:pending,fetcher:async(target,options)=>{
    if(target.includes('/operations/'))return reply({ok:false},404);
    if(options.method==='POST'){assert.deepEqual(JSON.parse(options.body),sent[0]);return reply({ok:true,receipt:receipt(sent[0].operationId)});}
    return reply(view(sent[0].conversationId));
  }});await y.app.ready;
  assert.equal(y.requests.filter(r=>r.options.method==='POST').length,0,'reload checks receipt without resending');
  y.d.getElementById('retry-pending').click();await settle();
  assert.equal(y.requests.filter(r=>r.options.method==='POST').length,1);
  assert.equal(y.state().pendingCreate,null);
  assert.match(y.d.getElementById('conversation-status').textContent,/Request received/);
});

test('saved resource uses only its fragment capability; switches do not carry another customer pending send',async t=>{
  const old={...blank(),access:{id:idA,token:tokenA},pendingReply:{operationId:operation,body:'A pending synthetic message'}};
  const x=setup(t,{state:old,url:`https://preview.invalid/customer-conversation.html#conversation=${idB}&access=${tokenB}`,fetcher:async(target,options)=>{
    assert.equal(target,endpoint+'/conversations/'+idB+'?after=0');
    assert.equal(options.headers.Authorization,'Bearer '+tokenB);
    return reply(view(idB));
  }});await x.app.ready;
  assert.equal(x.w.location.hash,'');
  assert.equal(x.state().access.id,idB);assert.equal(x.state().pendingReply,null);
  assert.deepEqual(JSON.parse(x.w.sessionStorage.getItem(STORAGE_KEY+':'+idA)).pendingReply,old.pendingReply,'A recovery is retained separately');
  for(const request of x.requests){assert.equal(request.hash,'');assert.equal(request.options.credentials,'omit');assert.equal(request.options.referrerPolicy,'no-referrer');assert.equal(request.options.cache,'no-store');assert.equal(request.options.redirect,'error');assert.doesNotMatch(request.target,/access=|Bearer|BBBB/);}
  assert.equal(x.w.localStorage.length,0);
});

test('stored HTML is rendered as text in messages and repair fields',async t=>{
  const attack='<img src=x onerror="throw new Error(1)"><script>bad()</script>';
  const x=setup(t,{state:{...blank(),access:{id:idA,token:tokenA}},fetcher:async()=>reply(view(idA,{repair:{...makeIntake(answers),name:attack},messages:[message('one',1,'owner',attack)],cursor:1}))});await x.app.ready;
  assert.match(x.d.getElementById('messages').textContent,/<img src=x/);
  assert.equal(x.d.querySelector('#messages img, #messages script, #repair-details img, #repair-details script'),null);
});

test('lost follow-up acknowledgment reconciles after reload without resending and refreshes from prior cursor',async t=>{
  let savedOperation;
  const x=setup(t,{state:{...blank(),access:{id:idA,token:tokenA}},fetcher:async(target,options)=>{
    if(target.includes('/operations/'))return reply({ok:false},404);
    if(options.method==='POST'){savedOperation=JSON.parse(options.body);assert.deepEqual(x.state().pendingReply,savedOperation);throw Error('synthetic response lost');}
    return reply(view(idA,{messages:[message('old',1,'customer','Synthetic first message')],cursor:1}));
  }});await x.app.ready;
  x.d.getElementById('reply-body').value='Synthetic follow-up';x.submit('reply-form');await settle();
  assert.ok(savedOperation);assert.deepEqual(x.state().pendingReply,savedOperation);
  const y=setup(t,{state:x.state(),fetcher:async(target,options)=>{
    assert.equal(options.method,'GET','saved reply must not be resent');
    if(target.includes('/operations/'))return reply({ok:true,receipt:receipt(savedOperation.operationId)});
    assert.match(target,/after=0|after=3/);
    return reply(view(idA,{messages:[message('old',1,'customer','Synthetic first message'),message('owner',2,'owner','Concurrent synthetic owner reply'),message('new',3,'customer','Synthetic follow-up',savedOperation.operationId)],cursor:3}));
  }});await y.app.ready;
  assert.equal(y.state().pendingReply,null);
  assert.match(y.d.getElementById('messages').textContent,/Concurrent synthetic owner reply/);
});

test('mismatched receipt keeps pending reply; successful ACK fetches from previous cursor',async t=>{
  let posted;
  const x=setup(t,{state:{...blank(),access:{id:idA,token:tokenA}},fetcher:async(target,options)=>{
    if(target.includes('/operations/'))return reply({ok:false},404);
    if(options.method==='POST'){posted=JSON.parse(options.body);return reply({ok:true,receipt:receipt(operation)});}
    return reply(view(idA,{messages:[message('one',1,'customer','Synthetic')],cursor:1}));
  }});await x.app.ready;x.d.getElementById('reply-body').value='Synthetic reply';x.submit('reply-form');await settle();
  assert.ok(posted);assert.deepEqual(x.state().pendingReply,posted);
  assert.match(x.d.getElementById('conversation-status').textContent,/could not be confirmed/);
});

test('successful live reply ACK reads from the old cursor and retains a concurrent shop reply',async t=>{
  let sentOperation;
  const x=setup(t,{state:{...blank(),access:{id:idA,token:tokenA}},fetcher:async(target,options)=>{
    if(target.includes('/operations/'))return reply({ok:false},404);
    if(options.method==='POST'){sentOperation=JSON.parse(options.body).operationId;return reply({ok:true,receipt:{operationId:sentOperation,messageId:'three',sequence:3}});}
    const after=Number(new URL(target).searchParams.get('after'));
    if(!sentOperation){assert.equal(after,0);return reply(view(idA,{messages:[message('one',1,'customer','Synthetic old request')],cursor:1}));}
    assert.equal(after,1,'the write ACK sequence must not replace the read cursor');
    return reply(view(idA,{messages:[message('two',2,'owner','Synthetic concurrent shop reply'),message('three',3,'customer','Synthetic follow-up',sentOperation)],cursor:3}));
  }});await x.app.ready;x.d.getElementById('reply-body').value='Synthetic follow-up';x.submit('reply-form');await settle();
  assert.equal(x.state().pendingReply,null);
  assert.match(x.d.getElementById('messages').textContent,/Synthetic concurrent shop reply/);
  assert.equal(x.d.getElementById('messages').children.length,3);
});

for(const status of [401,403,404,410])test(`unavailable access ${status} locks read and reply controls`,async t=>{
  const x=setup(t,{state:{...blank(),access:{id:idA,token:tokenA}},fetcher:async()=>reply({ok:false},status)});await x.app.ready;
  assert.match(x.d.getElementById('conversation-status').textContent,/unavailable, expired or revoked/);
  assert.equal(x.d.getElementById('reply-body').disabled,true);
  assert.equal(x.d.getElementById('copy-return-link').disabled,true);
  assert.equal(x.d.getElementById('messages').childElementCount,0);
});

test('unavailable storage prevents all network work; malformed stored state fails closed',async t=>{
  const x=setup(t,{storageThrows:true});await x.app.ready;
  assert.equal(x.requests.length,0);assert.match(x.d.getElementById('conversation-status').textContent,/No new send will be attempted/);
  const y=setup(t,{state:{...blank(),endpoint:'https://another.invalid',access:{id:idA,token:tokenA}}});await y.app.ready;
  assert.equal(y.requests.length,0);assert.equal(y.d.getElementById('question-form').querySelector('button').disabled,true);
});

test('reopening the same private link preserves and reconciles its uncertain reply',async t=>{
  const pending={operationId:operation,body:'Synthetic pending reply'};
  const x=setup(t,{url:`https://preview.invalid/customer-conversation.html#conversation=${idA}&access=${tokenA}`,state:{...blank(),access:{id:idA,token:tokenA},pendingReply:pending},fetcher:async(target,options)=>{
    assert.equal(options.method,'GET');
    if(target.includes('/operations/')){assert.match(target,new RegExp(operation+'$'));return reply({ok:true,receipt:receipt(operation)});}
    return reply(view(idA,{messages:[message('reply',15,'customer',pending.body)],cursor:15}));
  }});await x.app.ready;
  assert.equal(x.state().pendingReply,null);
  assert.match(x.d.getElementById('messages').textContent,/Synthetic pending reply/);
  assert.equal(x.requests.filter(r=>r.options.method==='POST').length,0);
});

test('receipt success and transcript failure shows saved shell and Refresh without false retry instructions',async t=>{
  const pending={operationId:operation,body:'Synthetic acknowledged reply'};
  const x=setup(t,{state:{...blank(),access:{id:idA,token:tokenA},pendingReply:pending},fetcher:async target=>{
    if(target.includes('/operations/'))return reply({ok:true,receipt:receipt(operation)});
    return reply({ok:false},503);
  }});await x.app.ready;
  assert.equal(x.state().pendingReply,null);
  assert.equal(x.d.getElementById('saved-conversation').hidden,false);
  assert.equal(x.d.getElementById('refresh-messages').disabled,false);
  assert.equal(x.d.getElementById('retry-pending').hidden,true);
  assert.doesNotMatch(x.d.getElementById('conversation-status').textContent,/original retry reference|could not be confirmed/);
  assert.match(x.d.getElementById('conversation-status').textContent,/send was saved/);
});

test('acknowledged create cannot start a second inquiry when transcript readback fails',async t=>{
  let creates=0;
  const x=setup(t,{state:{...blank(),answers},fetcher:async(target,options)=>{
    if(target.includes('/operations/'))return reply({ok:false},404);
    if(options.method==='POST'){creates++;return reply({ok:true,receipt:receipt(JSON.parse(options.body).operationId)});}
    return reply({ok:false},503);
  }});await x.app.ready;x.d.getElementById('send-inquiry').click();await settle();
  assert.equal(creates,1);assert.equal(x.state().pendingCreate,null);
  assert.equal(x.d.getElementById('intake-guide').hidden,true);
  assert.equal(x.d.getElementById('saved-conversation').hidden,false);
  assert.match(x.d.getElementById('conversation-status').textContent,/send was saved/);
  x.d.getElementById('send-inquiry').click();await settle();assert.equal(creates,1);
});

test('same conversation with a different return token cannot overwrite its saved pending operation',async t=>{
  const old={...blank(),access:{id:idA,token:tokenA},pendingReply:{operationId:operation,body:'Synthetic uncertain reply'}};
  const x=setup(t,{url:`https://preview.invalid/customer-conversation.html#conversation=${idA}&access=${tokenB}`,state:old});await x.app.ready;
  assert.equal(x.requests.length,0);
  assert.deepEqual(x.state(),old);
  assert.match(x.d.getElementById('conversation-status').textContent,/does not match/);
});

test('initial history load drains more than 100 messages so a later owner reply is visible',async t=>{
  const history=Array.from({length:215},(_,i)=>message('synthetic-'+(i+1),i+1,i===214?'owner':'customer',i===214?'Newest synthetic owner reply':'Synthetic history '+(i+1)));
  const x=setup(t,{state:{...blank(),access:{id:idA,token:tokenA}},fetcher:async target=>{
    const after=Number(new URL(target).searchParams.get('after'));
    const messages=history.filter(item=>item.sequence>after).slice(0,100);
    return reply(view(idA,{messages,cursor:messages.at(-1)?.sequence||after}));
  }});await x.app.ready;
  assert.deepEqual(x.requests.map(r=>Number(new URL(r.target).searchParams.get('after'))),[0,100,200]);
  assert.equal(x.d.getElementById('messages').children.length,215);
  assert.match(x.d.getElementById('messages').lastChild.textContent,/Newest synthetic owner reply/);
});

test('copy return link is explicit, fragment-only and never an automatic network target',async t=>{
  const x=setup(t,{state:{...blank(),access:{id:idA,token:tokenA}},fetcher:async()=>reply(view())});let copied='';
  Object.defineProperty(x.w.navigator,'clipboard',{value:{writeText:async value=>{copied=value;}}});await x.app.ready;
  assert.equal(copied,'');x.d.getElementById('copy-return-link').click();await settle();
  const link=new URL(copied);assert.equal(link.search,'');assert.equal(link.hash,`#conversation=${idA}&access=${tokenA}`);
  assert.equal(x.requests.some(r=>r.target===copied),false);
});
