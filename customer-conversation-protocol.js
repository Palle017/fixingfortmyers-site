// Public browser contract only. Persistence and authorization belong to existing Cloud Intake.
export const QUESTIONS = Object.freeze([
  {field:'details', prompt:'What is happening with your vehicle?', max:4000},
  {field:'name', prompt:'What name should Tony use?', max:100, autocomplete:'name'},
  {field:'phone', prompt:'What phone number should Tony call?', max:40, autocomplete:'tel'},
  {field:'vehicle', prompt:'What is the year, make and model?', max:160},
  {field:'starts', prompt:'Does the vehicle start? Answer yes, no, or unknown.', max:7},
  {field:'drivable', prompt:'Can it be driven? Answer yes, no, or unknown.', max:7},
  {field:'location', prompt:'Where is the vehicle now? A city, shop, drop-off, mobile or roadside description is enough.', max:300},
].map(Object.freeze));
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const CAPABILITY = /^[A-Za-z0-9_-]{43}$/;
export const MESSAGE_MAX = 4000;

export function validateAnswer(field, value) {
  const question = QUESTIONS.find(item => item.field === field);
  if (!question || typeof value !== 'string') throw Error('Choose a valid repair question.');
  const answer = value.trim();
  if (!answer || answer.length > question.max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(answer))
    throw Error(`Enter an answer of ${question.max} characters or fewer.`);
  if (['starts','drivable'].includes(field) && !['yes','no','unknown'].includes(answer))
    throw Error('Choose yes, no, or unknown.');
  if (field === 'phone' && (!/^\+?[\d\s().-]+$/.test(answer) || !/^\d{10,15}$/.test(answer.replace(/\D/g,''))))
    throw Error('Enter a phone number with 10 to 15 digits.');
  return answer;
}

export function nextQuestion(answers) {
  return QUESTIONS.find(question => !Object.hasOwn(answers, question.field)) || null;
}

export function makeIntake(answers) {
  const checked = Object.fromEntries(QUESTIONS.map(({field}) => [field, validateAnswer(field, answers[field])]));
  return {
    details:checked.details + '\nCar location (customer description): ' + checked.location,
    name:checked.name, phone:checked.phone, vehicle:checked.vehicle,
    starts:checked.starts, drivable:checked.drivable, source:'form', smsConsent:false,
  };
}

// This is one resource capability, never an identity or permission for any other history.
export function readReturnAccess(hash) {
  const params = new URLSearchParams(String(hash).replace(/^#/,''));
  if ([...params.keys()].some(key => !['conversation','access'].includes(key)) ||
      params.getAll('conversation').length !== 1 || params.getAll('access').length !== 1) return null;
  const id = params.get('conversation'), token = params.get('access');
  return UUID.test(id) && CAPABILITY.test(token) ? {id, token} : null;
}

export function returnLink(origin, access) {
  if (!UUID.test(access.id) || !CAPABILITY.test(access.token)) throw Error('Invalid private return access.');
  return new URL('/customer-conversation.html', origin).href + '#conversation=' + access.id + '&access=' + access.token;
}
