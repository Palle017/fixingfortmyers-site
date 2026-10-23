import test from 'node:test';
import assert from 'node:assert/strict';
import {QUESTIONS,validateAnswer,nextQuestion,makeIntake,readReturnAccess,returnLink} from '../customer-conversation-protocol.js';

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
