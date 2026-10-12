// Deterministic CSS compaction. Original stylesheets remain the editable source.
// Run after CSS changes: npm run build:styles
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {JSDOM} from 'jsdom';
import {parse, generate} from 'css-tree';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const hash = value => createHash('sha256').update(value).digest('hex').slice(0,12);
const bundles = new Map();
const core = ['base.css','style.css'];
const sourceName = name => {
  if (!/^[a-z0-9][a-z0-9.-]*\.css$/i.test(name) || name.startsWith('bundle-')) throw new Error('Invalid stylesheet source: '+name);
  if (!fs.statSync(path.join(root,name)).isFile()) throw new Error('Missing stylesheet: '+name);
  return name;
};
function bundle(sources) {
  const key=sources.join(' ');
  if(bundles.has(key)) return bundles.get(key);
  const originals=sources.map(name=>fs.readFileSync(path.join(root,sourceName(name)),'utf8'));
  const text=originals.map((css,index)=>{
    const ast=parse(css,{onParseError(error){throw new Error(sources[index]+': '+error.message);}});
    // Imports depend on per-file URL/order semantics: refuse instead of changing them.
    for(const node of ast.children) if(node.type==='Atrule' && ['import','charset','namespace'].includes(node.name.toLowerCase())) throw new Error('Keep '+sources[index]+' separate: @'+node.name);
    const compact=generate(ast);
    if(generate(parse(compact))!==compact) throw new Error('Unstable CSS serialization: '+sources[index]);
    const licenses=css.match(/\/\*![\s\S]*?\*\//g)||[];
    return licenses.join('\n')+compact;
  }).join('\n')+'\n';
  const filename=key===core.join(' ')?'bundle-core.min.css':'bundle-page-'+hash(key)+'.min.css';
  const result={filename,sources,bytes:Buffer.byteLength(text),sourceBytes:originals.reduce((sum,css)=>sum+Buffer.byteLength(css),0),gzipBytes:gzipSync(text).length,sourceGzipBytes:originals.reduce((sum,css)=>sum+gzipSync(css).length,0),content:text};
  result.link='<link rel="stylesheet" href="/'+filename+'?v='+hash(text)+'" data-css-sources="'+key+'">';
  bundles.set(key,result);
  return result;
}

const changes=[],summary=[];
for(const filename of fs.readdirSync(root).filter(file=>file.endsWith('.html')).sort()){
  const html=fs.readFileSync(path.join(root,filename),'utf8');
  const dom=new JSDOM(html,{includeNodeLocations:true});
  const edits=[],pageBundles=[];
  let run=[];
  const flush=()=>{
    if(!run.length)return;
    const sources=run.flatMap(entry=>entry.sources);
    const groups=sources[0]===core[0] && sources[1]===core[1] ? [sources.slice(0,2),sources.slice(2)].filter(group=>group.length) : [sources];
    const built=groups.map(bundle); pageBundles.push(...built);
    if(run.length===built.length && run.every((entry,index)=>entry.sources.join(' ')===built[index].sources.join(' '))){
      // Already bundled: update each link in its own slot without accumulating whitespace.
      for(const [index,entry] of run.entries())edits.push({start:entry.location.startOffset,end:entry.location.endOffset,text:built[index].link});
    }else{
      edits.push({start:run[0].location.startOffset,end:run[0].location.endOffset,text:built.map(item=>item.link).join('\n')});
      for(const entry of run.slice(1))edits.push({start:entry.location.startOffset,end:entry.location.endOffset,text:''});
    }
    run=[];
  };
  for(const node of dom.window.document.querySelectorAll('link[rel~="stylesheet"],style,script')){
    if(node.tagName==='SCRIPT' && (node.type==='application/ld+json' || node.defer || node.async))continue;
    if(node.tagName!=='LINK'){flush();continue;}
    const href=node.getAttribute('href')||'';
    const match=/^(?:\.\/|\/)?([a-z0-9][a-z0-9.-]*\.css)(?:[?#].*)?$/i.exec(href);
    const unsupported=[...node.attributes].some(attr=>!['rel','href','data-css-sources'].includes(attr.name));
    if(!match || unsupported || match[1]==='bay-one-widget.css'){flush();continue;}
    const sources=node.hasAttribute('data-css-sources')?node.getAttribute('data-css-sources').split(' ').filter(Boolean).map(sourceName):[sourceName(match[1])];
    const location=dom.nodeLocation(node);
    if(!location)throw new Error(filename+': missing HTML source offsets');
    run.push({sources,location});
  }
  flush();dom.window.close();
  if(!edits.length)continue;
  let updated=html;
  for(const edit of edits.sort((a,b)=>b.start-a.start))updated=updated.slice(0,edit.start)+edit.text+updated.slice(edit.end);
  updated=updated.replace(/^[\t ]+(?=\r?$)/gm,'');
  changes.push({filename,html:updated,changed:updated!==html});
  summary.push({page:filename,sourceRequests:pageBundles.reduce((sum,item)=>sum+item.sources.length,0),bundleRequests:pageBundles.length,sourceBytes:pageBundles.reduce((sum,item)=>sum+item.sourceBytes,0),bundleBytes:pageBundles.reduce((sum,item)=>sum+item.bytes,0),sourceGzipBytes:pageBundles.reduce((sum,item)=>sum+item.sourceGzipBytes,0),bundleGzipBytes:pageBundles.reduce((sum,item)=>sum+item.gzipBytes,0)});
}
// Everything parsed successfully before any file is changed. Root-level bundles
// retain the source files' relative URL resolution. No rule sorting or merging.
for(const item of bundles.values())fs.writeFileSync(path.join(root,item.filename),item.content);
for(const item of changes)if(item.changed)fs.writeFileSync(path.join(root,item.filename),item.html);
console.log(JSON.stringify({pages:summary.length,htmlChanged:changes.filter(item=>item.changed).length,bundles:bundles.size,homepage:summary.find(item=>item.page==='index.html'),sampleService:summary.find(item=>item.page==='brake-repair-fort-myers.html')},null,2));
