// Version local CSS/JS references without changing page markup or external URLs.
// Usage: node tools/version-assets.mjs [VERSION] [--check]
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),check=args.includes('--check');
if(args.some(arg=>arg.startsWith('--')&&arg!=='--check'))throw new Error('Only VERSION and --check are supported.');
const versions=args.filter(arg=>arg!=='--check');
if(versions.length>1)throw new Error('Supply at most one version.');
const version=versions[0]||'20261106-bayone-public';
if(!/^[A-Za-z0-9._-]{1,80}$/.test(version))throw new Error('Use a short version containing letters, digits, dots, underscores or hyphens.');
const isLocalAsset=value=>!/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(value)&&/\.(css|js)(?:[?#]|$)/i.test(value);
function versioned(value){
  const decoded=value.replace(/&amp;/g,'&'),hashAt=decoded.indexOf('#');
  const hash=hashAt<0?'':decoded.slice(hashAt),withoutHash=hashAt<0?decoded:decoded.slice(0,hashAt);
  const queryAt=withoutHash.indexOf('?'),pathname=queryAt<0?withoutHash:withoutHash.slice(0,queryAt);
  const query=new URLSearchParams(queryAt<0?'':withoutHash.slice(queryAt+1));query.set('v',version);
  return pathname+'?'+query.toString().replace(/&/g,'&amp;')+hash;
}
let pages=0,references=0,schemas=0,changedFiles=0;
for(const name of fs.readdirSync(root).filter(name=>name.endsWith('.html'))){
  const target=path.join(root,name),original=fs.readFileSync(target,'utf8');
  const revised=original.replace(/<(?:link|script)\b[^>]*>/gi,tag=>tag.replace(/\b(href|src)=(['"])(.*?)\2/gi,(match,attribute,quote,value)=>isLocalAsset(value)?`${attribute}=${quote}${versioned(value)}${quote}`:match));
  if(!check&&revised!==original){fs.writeFileSync(target,revised);changedFiles++;}
  const dom=new JSDOM(check?original:revised),document=dom.window.document;pages++;
  const ids=[...document.querySelectorAll('[id]')].map(node=>node.id);assert.equal(new Set(ids).size,ids.length,name+': duplicate IDs');
  const scripts=[...document.querySelectorAll('script[src]')];
  const widgetIndex=scripts.findIndex(node=>node.getAttribute('src')?.includes('/bay-one-widget.js'));
  if(widgetIndex>=0){const configIndex=scripts.findIndex(node=>node.getAttribute('src')?.includes('/bay-one-config.js'));assert.ok(configIndex>=0&&configIndex<widgetIndex,name+': public config must load before Bay One widget');}
  for(const node of document.querySelectorAll('script[type="application/ld+json"]')){JSON.parse(node.textContent);schemas++;}
  for(const node of document.querySelectorAll('link[href],script[src]')){
    const value=node.getAttribute('href')||node.getAttribute('src');if(!isLocalAsset(value))continue;
    const parsed=new URL(value,'https://local.invalid/');assert.deepEqual(parsed.searchParams.getAll('v'),[version],`${name}: stale or missing asset version in ${value}`);
    assert.ok(fs.existsSync(path.join(root,decodeURIComponent(parsed.pathname).replace(/^\//,''))),`${name}: missing local asset ${value}`);references++;
  }
  dom.window.close();
}
const widgetPath=path.join(root,'bay-one-widget.js');
let dynamicStylesheets=0;
if(fs.existsSync(widgetPath)){
  const widget=fs.readFileSync(widgetPath,'utf8'),matches=[...widget.matchAll(/(['"])(bay-one-widget\.css(?:\?[^'"]*)?)\1/g)];
  assert.equal(matches.length,1,'Expected exactly one dynamic Bay One stylesheet reference.');
  const revised=widget.replace(matches[0][0],matches[0][1]+versioned(matches[0][2])+matches[0][1]);
  if(!check&&revised!==widget){fs.writeFileSync(widgetPath,revised);changedFiles++;}
  assert.ok((check?widget:revised).includes('bay-one-widget.css?v='+version),'Dynamic Bay One stylesheet version is stale.');
  dynamicStylesheets=1;
}
console.log(JSON.stringify({version,mode:check?'check':'apply',pages,schemas,localAssetReferences:references,dynamicStylesheets,changedFiles},null,2));
