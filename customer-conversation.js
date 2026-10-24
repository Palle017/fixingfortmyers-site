import {QUESTIONS,UUID,CAPABILITY,MESSAGE_MAX,REQUIRED_FIELDS,validateAnswer,validateChoice,nextQuestion,makeIntake,makeAnswerList,readReturnAccess,returnLink} from './customer-conversation-protocol.js';

const STORAGE_KEY='pt-customer-conversation-v1';
const LOCKED_STATUSES=new Set([401,403,410]);

export function configuredEndpoint(config) {
  if(config?.enabled!==true||typeof config.endpoint!=='string'||!config.endpoint)return null;
  try {
    const url=new URL(config.endpoint);
    const loopback=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
    if((url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))||url.username||url.password||url.search||url.hash||url.pathname!=='/')return null;
    return url.origin;
  } catch{return null;}
}

function validAccess(value){return value&&UUID.test(value.id)&&CAPABILITY.test(value.token);}
function matchingReceipt(data,operationId){return data?.ok===true&&data.receipt?.operationId===operationId&&typeof data.receipt.messageId==='string'&&Number.isSafeInteger(data.receipt.sequence)&&data.receipt.sequence>0;}

export function mountConversation(w,config=w.PT_CUSTOMER_CONVERSATION_CONFIG) {
  const d=w.document,$=id=>d.getElementById(id),endpoint=configuredEndpoint(config);
  const incomingHash=w.location.hash,incoming=readReturnAccess(incomingHash);
  // Remove bearer material before any application fetch or outgoing navigation.
  if(incomingHash)w.history.replaceState(null,'',w.location.pathname);
  if(!endpoint)return {ready:Promise.resolve(),destroy(){}};
  const app=$('conversation-app'),status=$('conversation-status');
  $('unavailable').hidden=true;app.hidden=false;
  let state={version:2,endpoint,answers:{},access:null,pendingCreate:null,pendingReply:null,draftReply:''};
  let cursor=0,currentIndex=0,busy=false,locked=false,storageReady=false,stopped=false,pollTimer;
  const messages=new Map();
  function say(text){status.textContent=text;}
  function controls(){
    for(const node of app.querySelectorAll('button,input,select,textarea'))node.disabled=busy||locked;
    const pending=state.pendingCreate||state.pendingReply;
    $('retry-pending').hidden=!pending||locked;
    if(!busy&&!locked&&pending){
      for(const node of app.querySelectorAll('#intake-guide button,#intake-guide input,#intake-guide textarea,#intake-guide select,#reply-form button,#reply-form textarea'))node.disabled=true;
    }
  }
  function localFailure(){locked=true;say('This tab cannot safely keep draft and pending-send details. No new send will be attempted from this tab. Earlier pending sends may already be saved. Keep any private return link, then use the repair request form or call Tony.');controls();}
  function persist(){
    try{
      const encoded=JSON.stringify(state);
      w.sessionStorage.setItem(STORAGE_KEY,encoded);
      if(state.access)w.sessionStorage.setItem(STORAGE_KEY+':'+state.access.id,encoded);
    }
    catch{localFailure();throw Error('tab_storage_unavailable');}
  }
  function validateStored(raw){
    if(!raw||![1,2].includes(raw.version)||raw.endpoint!==endpoint||typeof raw.answers!=='object'||!raw.answers||Array.isArray(raw.answers))throw Error('invalid_tab_state');
    const typedAnswers={};
    for(const [field,answer] of Object.entries(raw.answers)){
      if(raw.version===1){const text=validateAnswer(field,answer);typedAnswers[field]=['starts','drivable'].includes(field)&&text==='unknown'?{state:'unknown'}:{state:'provided',answer:text};}
      else typedAnswers[field]=validateChoice(field,answer);
    }
    if(raw.access&&!validAccess(raw.access))throw Error('invalid_tab_state');
    if(raw.pendingCreate){
      const p=raw.pendingCreate;
      if(!UUID.test(p.conversationId)||!UUID.test(p.operationId)||!CAPABILITY.test(p.accessToken)||p.conversationId!==raw.access?.id||p.accessToken!==raw.access?.token||!Array.isArray(p.answers))throw Error('invalid_tab_state');
      const v2=p.schemaVersion===2;
      const pendingAnswers=Object.fromEntries(p.answers.map(({field,...choice})=>[field,v2?choice:choice.answer]));
      if(p.answers.length!==QUESTIONS.length||JSON.stringify(p.intake)!==JSON.stringify(makeIntake(pendingAnswers,{schemaVersion:v2?2:1})))throw Error('invalid_tab_state');
    }
    if(raw.pendingReply&&(!raw.access||!UUID.test(raw.pendingReply.operationId)||typeof raw.pendingReply.body!=='string'||!raw.pendingReply.body.trim()||raw.pendingReply.body.length>MESSAGE_MAX))throw Error('invalid_tab_state');
    if(typeof raw.draftReply!=='string'||raw.draftReply.length>MESSAGE_MAX)throw Error('invalid_tab_state');
    // Migrate only the editable draft; never rewrite an already-pending version 1 operation.
    return {...raw,version:2,answers:typedAnswers};
  }
  try{
    const stored=w.sessionStorage.getItem(STORAGE_KEY);
    // Keep each resource's pending identity when a customer opens another private link.
    // Reopening the same link must reconcile its original operation, never start a new one.
    if(incoming){
      const previous=stored?validateStored(JSON.parse(stored)):null;
      if(previous?.access)w.sessionStorage.setItem(STORAGE_KEY+':'+previous.access.id,JSON.stringify(previous));
      const saved=previous?.access?.id===incoming.id?previous:(()=>{
        const encoded=w.sessionStorage.getItem(STORAGE_KEY+':'+incoming.id);return encoded?validateStored(JSON.parse(encoded)):null;
      })();
      if(saved?.access?.id===incoming.id){
        state=saved;
        if(saved.access.token!==incoming.token){locked=true;say('This return link does not match the access already saved in this tab. Keep the original private link or use a separate tab. No send was attempted.');}
      }else state.access=incoming;
      if(!locked)persist();
    }
    else if(incomingHash){locked=true;say('This private return link is incomplete or invalid. Please use the complete link or call Tony.');}
    else if(stored)state=validateStored(JSON.parse(stored));
    const probe='pt-conversation-storage-check';w.sessionStorage.setItem(probe,'1');w.sessionStorage.removeItem(probe);storageReady=true;
  }catch{localFailure();}

  function question(index){
    currentIndex=index;
    const item=QUESTIONS[index],optional=!REQUIRED_FIELDS.includes(item.field);
    $('question-form').hidden=false;$('intake-review').hidden=true;
    $('question-label').textContent=item.prompt+(optional?' (optional)':'');
    $('question-progress').textContent=optional?'Optional detail · Unsent draft':'Contact details · Unsent draft';
    $('question-help').textContent=optional?(item.field==='location'?'A city or general area is enough; no exact location is needed. ':'')+'You can choose Not sure or add this later.':'name'===item.field?'Your first name is enough.':'Use a number where Tony can reach you.';
    const control=d.createElement(['starts','drivable'].includes(item.field)?'select':['details','location'].includes(item.field)?'textarea':'input');
    control.id='question-answer';control.name=item.field;control.required=!optional;control.setAttribute('aria-describedby','question-help question-error');
    if(control.tagName==='SELECT')for(const value of ['','yes','no','unknown']){const option=d.createElement('option');option.value=value;option.textContent=value||'Choose an answer';control.append(option);}
    else {control.maxLength=item.max;if(control.tagName==='TEXTAREA')control.rows=4;else {control.type=item.field==='phone'?'tel':'text';control.autocomplete=item.autocomplete||'off';}}
    control.value=state.answers[item.field]?.state==='provided'?state.answers[item.field].answer:state.answers[item.field]?.state==='unknown'&&control.tagName==='SELECT'?'unknown':'';
    $('question-unknown').hidden=!optional;$('question-later').hidden=!optional;
    $('skip-optional-details').hidden=!optional||!REQUIRED_FIELDS.every(field=>state.answers[field]?.state==='provided');
    $('question-control').replaceChildren(control);$('question-back').hidden=index===0;$('question-error').textContent='';controls();control.focus();
  }
  function review(){
    $('question-form').hidden=true;$('intake-review').hidden=false;$('question-progress').textContent='Ready to review · Unsent draft';
    const list=$('review-answers');list.replaceChildren();
    for(const [index,item] of QUESTIONS.entries()){
      const term=d.createElement('dt');term.textContent=item.prompt+(!REQUIRED_FIELDS.includes(item.field)?' (optional)':'');const value=d.createElement('dd');
      const choice=validateChoice(item.field,state.answers[item.field]);value.textContent=choice.state==='provided'?choice.answer:choice.state==='unknown'?'Not sure':'To add later';
      const edit=d.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='Edit answer';edit.setAttribute('aria-label','Edit '+item.prompt);edit.addEventListener('click',()=>question(index));
      value.append(d.createElement('br'),edit);list.append(term,value);
    }
    controls();$('review-heading').focus();
  }
  function draft(){
    $('intake-guide').hidden=false;$('saved-conversation').hidden=true;
    const next=nextQuestion(state.answers);if(next)question(QUESTIONS.indexOf(next));else review();
    if(!state.pendingCreate)say('Unsent draft. Review every answer before sending it to the shop.');
  }
  function lockAccess(){locked=true;messages.clear();$('messages').replaceChildren();$('repair-details').replaceChildren();$('reply-body').value='';say('This return access is unavailable, expired or revoked. Please call Tony for help.');controls();}
  function savedShell(){
    $('intake-guide').hidden=true;$('saved-conversation').hidden=false;
    $('reply-body').value=state.pendingReply?.body||state.draftReply||'';
    controls();
  }
  async function request(path,{body,allowMissing=false}={}){
    const controller=new w.AbortController(),timer=w.setTimeout(()=>controller.abort(),15000);
    try{
      const response=await w.fetch(endpoint+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(state.access?{Authorization:'Bearer '+state.access.token}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal});
      if(LOCKED_STATUSES.has(response.status)){lockAccess();throw Error('access_unavailable');}
      if(allowMissing&&response.status===404)return null;
      if(response.status===404){lockAccess();throw Error('access_unavailable');}
      if(!response.ok)throw Error('request_unconfirmed');
      const data=await response.json();if(data?.ok!==true)throw Error('request_unconfirmed');return data;
    }finally{w.clearTimeout(timer);}
  }
  function renderSaved(data){
    if(data?.conversation?.id!==state.access?.id||!UUID.test(data.conversation.leadId)||!Array.isArray(data.messages)||!Number.isSafeInteger(data.cursor)||data.cursor<0)throw Error('response_mismatch');
    savedShell();
    $('access-expiry').textContent='Return access expires: '+data.conversation.expiresAt+'. Save the private link if you want to return from another device.';
    const repair=$('repair-details');repair.replaceChildren();
    for(const [field,label] of [['vehicle','Vehicle'],['details','Reported concern and location'],['name','Name supplied'],['phone','Callback number'],['starts','Starts'],['drivable','Drivable']]){
      const snapshot=data.conversation.repair,fieldState=snapshot?.fieldStates?.[field];
      if(typeof snapshot?.[field]!=='string'&&!fieldState)continue;
      const term=d.createElement('dt'),value=d.createElement('dd');term.textContent=label;
      value.textContent=field==='details'&&snapshot[field]?snapshot[field]:fieldState==='unknown'?'Not sure at intake':fieldState==='later'?'Not supplied initially':snapshot[field]||'';repair.append(term,value);
    }
    for(const item of data.messages){
      if(typeof item.id!=='string'||!Number.isSafeInteger(item.sequence)||item.sequence<1||!['guide','customer','owner'].includes(item.role)||typeof item.body!=='string'||typeof item.createdAt!=='string')throw Error('response_mismatch');
      messages.set(item.id,item);
    }
    const list=$('messages');list.replaceChildren();
    for(const item of [...messages.values()].sort((a,b)=>a.sequence-b.sequence)){
      const row=d.createElement('li');row.dataset.role=item.role;
      const meta=d.createElement('span');meta.className='message-meta';meta.textContent=(item.role==='owner'?'Shop reply':item.role==='customer'?'You':'Repair guide')+' · '+item.createdAt;
      row.append(meta,d.createTextNode(item.body));list.append(row);
    }
    cursor=Math.max(cursor,data.cursor);$('reply-body').value=state.pendingReply?.body||state.draftReply||'';controls();
  }
  async function loadMessages(after){
    // The API pages at 100 messages and caps this slice at 1,000 per conversation.
    for(let page=0;page<10;page++){
      const data=await request('/conversations/'+state.access.id+'?after='+after);
      if(!Array.isArray(data.messages)||data.cursor<after||data.messages.some(item=>item.sequence<=after))throw Error('response_mismatch');
      renderSaved(data);
      if(data.messages.length<100||data.cursor<=after)return;
      after=data.cursor;
    }
  }
  async function refresh(){
    if(!state.access||locked||stopped||busy)return;
    busy=true;controls();
    try{await loadMessages(cursor);if(!state.pendingReply&&!state.pendingCreate)say('Saved conversation loaded. Replies appear here when the shop responds.');}
    catch{if(!locked)say('Saved messages could not be refreshed. Your private link and any pending send stay in this tab.');}
    finally{busy=false;controls();}
  }
  async function reconcilePending({retry=false}={}){
    if(locked||busy||!storageReady)return;
    const pending=state.pendingCreate||state.pendingReply;if(!pending)return;
    const creating=Boolean(state.pendingCreate),beforeCursor=cursor;let acknowledged=false;
    busy=true;controls();say('Checking whether the pending send was saved…');
    try{
      let data=await request('/conversations/'+state.access.id+'/operations/'+pending.operationId,{allowMissing:true});
      if(!data&&retry)data=await request(creating?'/conversations':'/conversations/'+state.access.id+'/messages',{body:pending});
      if(!data){say('This send is still pending. Use Check and retry to send the same saved operation.');return;}
      if(!matchingReceipt(data,pending.operationId))throw Error('receipt_mismatch');
      acknowledged=true;
      // Clear pending only after this exact operation has a durable server receipt.
      if(creating){state.pendingCreate=null;state.answers={};}else {state.pendingReply=null;state.draftReply='';}
      persist();
      savedShell();
      // Read from the prior cursor, including a concurrent owner reply before our ACK.
      await loadMessages(beforeCursor);
      say(creating?'Request received. Your inquiry and clarification messages are saved.':'Message saved. Tony can reply here.');
      if(!pollTimer)schedule();
    }catch{if(!locked)say(acknowledged?'Your send was saved, but messages could not be refreshed. Use Refresh messages to load the saved conversation.':'The send could not be confirmed. Its original retry reference is kept in this tab. Check and retry; do not submit another inquiry.');}
    finally{busy=false;controls();if(acknowledged&&!locked)schedule();}
  }
  function saveChoice(choice){
    const item=QUESTIONS[currentIndex];state.answers[item.field]=validateChoice(item.field,choice);persist();
    const next=nextQuestion(state.answers);if(next)question(QUESTIONS.indexOf(next));else review();
  }
  $('question-form').addEventListener('submit',event=>{
    event.preventDefault();if(locked||busy||state.pendingCreate)return;
    try{const item=QUESTIONS[currentIndex],answer=$('question-answer').value;saveChoice(['starts','drivable'].includes(item.field)&&answer==='unknown'?{state:'unknown'}:{state:'provided',answer});}
    catch(error){if(!locked){$('question-error').textContent=error.message;$('question-answer').focus();}}
  });
  for(const answerState of ['unknown','later'])$('question-'+answerState).addEventListener('click',()=>{
    if(locked||busy||state.pendingCreate||REQUIRED_FIELDS.includes(QUESTIONS[currentIndex].field))return;
    try{saveChoice({state:answerState});}catch(error){if(!locked)$('question-error').textContent=error.message;}
  });
  $('skip-optional-details').addEventListener('click',()=>{
    if(locked||busy||state.pendingCreate||!REQUIRED_FIELDS.every(field=>state.answers[field]?.state==='provided'))return;
    try{for(const {field} of QUESTIONS)if(!REQUIRED_FIELDS.includes(field)&&!Object.hasOwn(state.answers,field))state.answers[field]={state:'later'};makeIntake(state.answers,{schemaVersion:2});persist();review();}
    catch(error){if(!locked)$('question-error').textContent=error.message;}
  });
  $('question-back').addEventListener('click',()=>{if(!locked&&!busy)question(Math.max(0,currentIndex-1));});
  $('send-inquiry').addEventListener('click',()=>{
    if(locked||busy||state.pendingCreate||state.access)return;
    try{
      const bytes=w.crypto.getRandomValues(new Uint8Array(32));const token=w.btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      const id=w.crypto.randomUUID(),operationId=w.crypto.randomUUID();
      state.pendingCreate={schemaVersion:2,conversationId:id,operationId,accessToken:token,intake:makeIntake(state.answers,{schemaVersion:2}),answers:makeAnswerList(state.answers)};
      state.access={id,token};persist();void reconcilePending({retry:true});
    }catch{if(!locked)say('Your draft could not be prepared. Nothing was sent. Keep this tab and call Tony if you need help.');}
  });
  $('reply-body').addEventListener('input',()=>{if(locked||busy||state.pendingReply)return;state.draftReply=$('reply-body').value;try{persist();}catch{}});
  $('reply-form').addEventListener('submit',event=>{
    event.preventDefault();if(locked||busy||state.pendingReply||state.pendingCreate||!state.access)return;
    const body=$('reply-body').value.trim();if(!body||body.length>MESSAGE_MAX){say('Enter a message of 4000 characters or fewer.');return;}
    try{state.pendingReply={operationId:w.crypto.randomUUID(),body};persist();void reconcilePending({retry:true});}catch{}
  });
  $('retry-pending').addEventListener('click',()=>void reconcilePending({retry:true}));
  $('refresh-messages').addEventListener('click',()=>void refresh());
  $('copy-return-link').addEventListener('click',async()=>{
    if(locked||!state.access)return;
    try{await w.navigator.clipboard.writeText(returnLink(w.location.origin,state.access));say('Private return link copied. Keep it somewhere private; anyone with it can open this conversation.');}
    catch{say('Copy is unavailable in this browser. Keep this tab open; call Tony if you need help returning later.');}
  });
  function schedule(){if(stopped||pollTimer)return;pollTimer=w.setTimeout(async()=>{pollTimer=null;if(d.visibilityState==='visible')await refresh();schedule();},15000);}
  const ready=(async()=>{
    if(locked){controls();return;}
    if(state.pendingCreate)draft();
    else if(state.access){savedShell();say('Loading saved conversation…');}
    else draft();
    if(state.pendingCreate||state.pendingReply)await reconcilePending();
    else if(state.access)await refresh();
    if(state.access)schedule();
  })();
  return {ready,poll:refresh,destroy(){stopped=true;w.clearTimeout(pollTimer);}};
}

if(typeof window!=='undefined'&&window.document?.getElementById('conversation-app'))mountConversation(window);
