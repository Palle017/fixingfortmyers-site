// Loopback-only review with synthetic storage, mock Bay One, and no real alerts.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLeadServers} from '../_website-intake/server.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(args.some(arg=>arg!=='--receiver'&&!/^--port=\d+$/.test(arg)))throw Error('Use --receiver and/or --port=18939.');
const portArgs=args.filter(arg=>arg.startsWith('--port='));
if(portArgs.length>1)throw Error('Supply --port only once.');
const port=Number(portArgs[0]?.slice(7)||18909),receiver=args.includes('--receiver');
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Use a port from 1024 through 65535.');
const origin=`http://127.0.0.1:${port}`;
const dataDir=path.join(root,'.preview-data',String(port));
const provider=async({messages})=>{
  const message=messages.at(-1)?.content||'';
  if(/simulate ai failure/i.test(message))throw Error('Synthetic AI outage');
  const intake={};
  if(message.includes('2018 Ford F-150'))intake.vehicle='2018 Ford F-150';
  if(message.includes('33901'))intake.city='33901';
  if(message.includes('will not start')){intake.details='will not start';intake.starts='no';}
  if(message.includes('stranded'))intake.stranded='yes';
  return {result:{kind:'intake',relevant:true,intake},usage:{}};
};
const app=createLeadServers({dataDir,origins:[origin],chat:{provider},alerts:{enabled:false},notifyChannels:[],customerTextAdapter:null,deskDigest:null,alertWorker:false});
const ports=await app.start(0,0);
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.mp4':'video/mp4','.xml':'application/xml','.txt':'text/plain'};
http.createServer(async(req,res)=>{
  const url=new URL(req.url,origin);
  if(url.pathname==='/healthz'||url.pathname.startsWith('/hooks/')||url.pathname.startsWith('/chat/')){
    const proxy=http.request({hostname:'127.0.0.1',port:ports.publicPort,path:req.url,method:req.method,headers:{...req.headers,host:`127.0.0.1:${ports.publicPort}`}},up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res);});
    proxy.on('error',()=>{res.writeHead(502);res.end('Preview API unavailable');});req.pipe(proxy);return;
  }
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  // Never expose production endpoints from a local preview, including the default SMS-only mode.
  if(url.pathname==='/contact-config.js'){res.setHeader('Content-Type',types['.js']);res.end(`window.PT_CONTACT_CONFIG=${JSON.stringify({endpoint:receiver?origin:''})};`);return;}
  if(url.pathname==='/bay-one-config.js'){res.setHeader('Content-Type',types['.js']);res.end(`window.PT_BAYONE_CONFIG=${JSON.stringify({enabled:receiver,autoOpen:false,endpoint:origin})};`);return;}
  if(url.pathname==='/robots.txt'){res.end('User-agent: *\nDisallow: /\n');return;}
  let name;try{name=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';}catch{res.writeHead(400);res.end();return;}
  if(!path.extname(name))name+='.html';
  const target=path.resolve(root,name),extension=path.extname(target);
  const allowed=name.startsWith('assets/')||!name.includes('/')&&['.html','.css','.js','.ico','.svg','.png'].includes(extension);
  if(!allowed||!types[extension]||!target.startsWith(root+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);res.end('Not found');return;}
  let content=fs.readFileSync(target);
  if(extension==='.html')content=Buffer.from(content.toString().replace(/<body([^>]*)>/i,'<body$1><p style="position:fixed;top:76px;right:10px;z-index:10000;margin:0;padding:4px 7px;border-radius:4px;background:#fff0bd;color:#111;font:11px/1.2 Arial,sans-serif;pointer-events:none">Local preview · no messages sent</p>'));
  res.setHeader('Content-Type',types[extension]);res.end(content);
}).listen(port,'127.0.0.1',()=>console.log(JSON.stringify({preview:origin,syntheticInbox:`http://127.0.0.1:${ports.adminPort}`,receiver:receiver?'local mock':'native message draft',notifications:'disabled',productionEndpoints:false})));
