// Mocked Ollama provider contract. No model or network is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createOllamaProvider,createDefaultProvider,createDeepSeekProvider} from './public-chat.mjs';

const reply=(body,ok=true)=>({ok,text:async()=>JSON.stringify(body)});

test('Ollama provider posts a JSON-mode chat to loopback and returns parsed intake with usage',async()=>{
  const calls=[];
  const provider=createOllamaProvider({model:'synthetic:model',fetchImpl:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});
    return reply({done:true,done_reason:'stop',prompt_eval_count:40,eval_count:12,message:{content:JSON.stringify({kind:'intake',relevant:true,intake:{vehicle:'Honda'}})}});}});
  const out=await provider({messages:[{role:'user',content:'My Honda will not start'}],canEstimate:false});
  assert.equal(calls[0].url,'http://127.0.0.1:11434/api/chat');
  assert.equal(calls[0].body.model,'synthetic:model');assert.equal(calls[0].body.format,'json');assert.equal(calls[0].body.stream,false);
  assert.equal(calls[0].body.messages[0].role,'system');assert.equal(calls[0].body.messages.at(-1).content,'My Honda will not start');
  assert.deepEqual(out.result.intake,{vehicle:'Honda'});assert.equal(out.usage.total_tokens,52);
});

test('Ollama provider fails closed with customer-safe errors',async()=>{
  await assert.rejects(createOllamaProvider({model:''})({messages:[]}),{status:503,code:'chat_unavailable'});
  await assert.rejects(createOllamaProvider({model:'m',fetchImpl:async()=>{throw Error('ECONNREFUSED');}})({messages:[]}),{status:503,code:'chat_unavailable'});
  await assert.rejects(createOllamaProvider({model:'m',fetchImpl:async()=>reply({},false)})({messages:[]}),{status:503,code:'chat_unavailable'});
  await assert.rejects(createOllamaProvider({model:'m',fetchImpl:async()=>reply({done:true,message:{content:'not json'}})})({messages:[]}),{code:'invalid_answer'});
  await assert.rejects(createOllamaProvider({model:'m',fetchImpl:async()=>reply({done:true,done_reason:'length',message:{content:'{}'}})})({messages:[]}),{code:'invalid_answer'});
});

test('provider selection defaults to DeepSeek and switches to Ollama only when named',async()=>{
  let url;const fetchImpl=async u=>{url=u;return reply({done:true,done_reason:'stop',message:{content:'{}'}});};
  await createDefaultProvider({providerName:'ollama',model:'m',fetchImpl})({messages:[]});assert.match(url,/11434\/api\/chat$/);
  await assert.rejects(createDefaultProvider({providerName:'deepseek',apiKey:'',fetchImpl})({messages:[]}),{code:'chat_unavailable'});
  assert.equal(typeof createDeepSeekProvider,'function');
});
