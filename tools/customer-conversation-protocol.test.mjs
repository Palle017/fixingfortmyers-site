import test from 'node:test';
import assert from 'node:assert/strict';
import {QUESTIONS,validateAnswer,validateChoice,nextQuestion,makeIntake,makeAnswerList,readReturnAccess,returnLink} from '../customer-conversation-protocol.js';

const answers={details:'Synthetic engine stalls',name:'Synthetic Customer',phone:'239-555-0100',vehicle:'2018 Example Sedan',starts:'yes',drivable:'unknown',location:'Synthetic roadside city'};
test('deterministic missing-field guide asks exactly one next question and reuses answers',()=>{
  const saved={};
  for(const question of QUESTIONS){assert.equal(nextQuestion(saved),question);saved[question.field]=answers[question.field];}
  assert.equal(nextQuestion(saved),null);
  delete saved.phone;assert.equal(nextQuestion(saved).field,'phone');
  assert.throws(()=>makeIntake(saved));
});
test('reviewed intake uses existing fields and separate consent; no identity or scheduling claim',()=>{
  const intake=makeIntake({...answers,email:'forged@example.invalid',google_id_token:'forged'});
  assert.equal(intake.smsConsent,false);
  assert.equal(intake.details,'Synthetic engine stalls\nCar location (customer description): Synthetic roadside city');
  assert.equal(intake.name,answers.name);
  assert.equal(intake.source,'form');
  assert.equal(Object.hasOwn(intake,'google_id_token'),false);
  assert.equal(Object.hasOwn(intake,'email'),false);
  assert.equal(Object.hasOwn(intake,'appointment'),false);
});
test('missing, oversized, invalid vehicle-state and invalid callback values fail validation',()=>{
  for(const field of QUESTIONS.map(q=>q.field))assert.throws(()=>validateAnswer(field,''));
  assert.throws(()=>validateAnswer('details','a'.repeat(4001)));
  assert.throws(()=>validateAnswer('phone','abc2395550100'));
  assert.throws(()=>validateAnswer('phone','123'));
  assert.throws(()=>validateAnswer('starts','probably'));
  assert.throws(()=>validateAnswer('name','synthetic\u0001control'));
  assert.equal(validateAnswer('name',' <img src=x onerror=alert(1)> '),'<img src=x onerror=alert(1)>','plain text is retained; renderers must use textContent');
});
test('return links carry one conversation capability in fragment only',()=>{
  const access={id:'11111111-1111-4111-8111-111111111111',token:'A'.repeat(43)};
  const link=new URL(returnLink('https://preview.invalid/somewhere',access));
  assert.equal(link.search,'');
  assert.equal(link.pathname,'/customer-conversation.html');
  assert.deepEqual(readReturnAccess(link.hash),access);
  for(const fragment of ['', '#conversation='+access.id,link.hash+'&email=forged@example.invalid',link.hash+'&access='+'B'.repeat(43),link.hash.replace(access.token,'bad')])assert.equal(readReturnAccess(fragment),null);
});

test('version 2 name and phone minimum omits optional text and records typed later states',()=>{
  const choices={name:{state:'provided',answer:'Synthetic'},phone:{state:'provided',answer:'239-555-0100'}};
  assert.deepEqual(makeIntake(choices,{schemaVersion:2}),{name:'Synthetic',phone:'239-555-0100',source:'form',smsConsent:false});
  const list=makeAnswerList(choices);assert.equal(list.length,7);
  for(const field of ['details','vehicle','starts','drivable','location'])assert.deepEqual(list.find(item=>item.field===field),{field,state:'later'});
  assert.throws(()=>makeIntake({phone:choices.phone},{schemaVersion:2}));
  assert.throws(()=>makeIntake({...choices,name:{state:'later'}},{schemaVersion:2}));
});

test('version 2 uncertainty never becomes customer answer text or inferred identity',()=>{
  const choices={name:{state:'provided',answer:'Synthetic'},phone:{state:'provided',answer:'239-555-0100'},details:{state:'unknown'},vehicle:{state:'later'},starts:{state:'unknown'},drivable:{state:'later'},location:{state:'unknown'}};
  const intake=makeIntake(choices,{schemaVersion:2});
  assert.equal(Object.hasOwn(intake,'details'),false);assert.equal(Object.hasOwn(intake,'vehicle'),false);assert.equal(Object.hasOwn(intake,'starts'),false);assert.equal(Object.hasOwn(intake,'drivable'),false);
  assert.equal(JSON.stringify(intake).includes('unknown'),false);
  assert.throws(()=>validateChoice('location',{state:'unknown',answer:'unknown'}));
  assert.throws(()=>validateChoice('starts',{state:'provided',answer:'unknown'}));
  assert.throws(()=>validateChoice('phone',{state:'unknown'}));
});

test('version 2 appends only provided location and keeps provided symptom wording',()=>{
  const choices={name:{state:'provided',answer:'Synthetic'},phone:{state:'provided',answer:'239-555-0100'},details:{state:'later'},location:{state:'provided',answer:'Synthetic city'}};
  assert.equal(makeIntake(choices,{schemaVersion:2}).details,'Car location (customer description): Synthetic city');
  choices.details={state:'provided',answer:'Synthetic short problem'};
  assert.equal(makeIntake(choices,{schemaVersion:2}).details,'Synthetic short problem\nCar location (customer description): Synthetic city');
});
