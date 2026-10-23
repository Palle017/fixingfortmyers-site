// Loopback-only, memory-only synthetic UI preview. No private source, live endpoints or alerts.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {QUESTIONS,UUID,CAPABILITY} from '../customer-conversation-protocol.js';

const argument=process.argv[2]||'--port=18947';
if(process.argv.length>3||!/^--port=\d+$/.test(argument))throw Error('Use --port=18947.');
const port=Number(argument.slice(7));if(port<1024||port>65535)throw Error('Use a port from 1024 through 65535.');
const origin='http://127.0.0.1:'+port,root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=new Set(['customer-conversation.html','customer-conversation.css','customer-conversation.js','customer-conversation-protocol.js']);
const conversations=new Map();
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
async function body(req){let value='';for await(const chunk of req){value+=chunk;if(Buffer.byteLength(value)>20000)throw Error('size');}return JSON.parse(value);}
const view=(record,after=0)=>({ok:true,conversation:{id:record.id,leadId:record.id,expiresAt:'2099-01-01T00:00:00.000Z',repair:record.intake},messages:record.messages.filter(m=>m.sequence>after),cursor:record.messages.at(-1)?.sequence||0});
function append(record,role,text,operationId){const row={id:randomUUID(),sequence:record.messages.length+1,role,body:text,operationId,createdAt:new Date().toISOString()};record.messages.push(row);return row;}
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Content-Type-Options','nosniff');
  try{
    const url=new URL(req.url,origin);
    if(req.headers.origin&&req.headers.origin!==origin)return json(res,403,{ok:false});
    if(url.pathname==='/customer-conversation-config.js'){res.setHeader('Content-Type','application/javascript');return res.end('window.PT_CUSTOMER_CONVERSATION_CONFIG='+JSON.stringify({enabled:true,endpoint:origin})+';');}
    if(req.method==='POST'&&url.pathname==='/conversations'){
      const input=await body(req);
      if(!UUID.test(input.conversationId)||!UUID.test(input.operationId)||!CAPABILITY.test(input.accessToken)||!Array.isArray(input.answers))return json(res,400,{ok:false});
      let record=conversations.get(input.conversationId);
      if(record&&record.token!==input.accessToken)return json(res,404,{ok:false});
      if(!record){
        record={id:input.conversationId,token:input.accessToken,intake:input.intake,messages:[],operations:new Map()};
        for(const question of QUESTIONS){const answer=input.answers.find(item=>item.field===question.field)?.answer;if(typeof answer!=='string')return json(res,400,{ok:false});append(record,'guide',question.prompt,input.operationId);append(record,'customer',answer,input.operationId);}
        const last=record.messages.at(-1);record.operations.set(input.operationId,{operationId:input.operationId,messageId:last.id,sequence:last.sequence});
        append(record,'owner','Synthetic preview reply: the shop can respond in this saved conversation. No real customer message was sent.',randomUUID());
        conversations.set(record.id,record);
      }
      return json(res,201,{...view(record),receipt:record.operations.get(input.operationId)});
    }
    const match=url.pathname.match(/^\/conversations\/([a-f0-9-]{36})(?:\/(messages|operations)(?:\/([a-f0-9-]{36}))?)?$/);
    if(match){
      const record=conversations.get(match[1]);if(!record||req.headers.authorization!=='Bearer '+record.token)return json(res,404,{ok:false});
      if(req.method==='GET'&&match[2]==='operations'){const receipt=record.operations.get(match[3]);return json(res,receipt?200:404,receipt?{ok:true,receipt}:{ok:false});}
      if(req.method==='GET'&&!match[2])return json(res,200,view(record,Number(url.searchParams.get('after'))||0));
      if(req.method==='POST'&&match[2]==='messages'){
        const input=await body(req);if(!UUID.test(input.operationId)||typeof input.body!=='string'||!input.body.trim()||input.body.length>4000)return json(res,400,{ok:false});
        let receipt=record.operations.get(input.operationId);
        if(!receipt){const saved=append(record,'customer',input.body,input.operationId);receipt={operationId:input.operationId,messageId:saved.id,sequence:saved.sequence};record.operations.set(input.operationId,receipt);}
        return json(res,201,{ok:true,receipt});
      }
      return json(res,405,{ok:false});
    }
    const name=url.pathname==='/'?'customer-conversation.html':url.pathname.slice(1);
    if(req.method!=='GET'||!files.has(name))return json(res,404,{ok:false});
    let data=fs.readFileSync(path.join(root,name));
    if(name.endsWith('.html'))data=Buffer.from(data.toString().replace('<main>','<main><p class="privacy-note">Synthetic local preview — no messages sent. Memory resets when this process stops.</p>'));
    res.setHeader('Content-Type',name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'application/javascript; charset=utf-8');res.end(data);
  }catch{return json(res,400,{ok:false,error:'Synthetic preview request rejected'});}
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({preview:origin+'/customer-conversation.html',synthetic:true,persistence:'memory only',productionEndpoints:false,notifications:false})));
