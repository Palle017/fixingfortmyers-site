import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {JSDOM} from 'jsdom';
import * as cssTree from 'css-tree';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const scriptNames = Object.freeze(['site.js','contact-config.js','careers.js','parts-request.js','repair-dialog.js','repair-form-calm.js']);
export const noindex = 'noindex, nofollow, noarchive, nosnippet';
export const contentPolicy = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; base-uri 'none'";
const assetTypes = new Set(['.webp','.jpg','.jpeg','.png','.gif','.svg','.ico','.mp4','.woff2']);
const origin = 'https://staging.fixingfortmyers.com';
const local = value => {
  const url = new URL(value, origin);
  if (url.origin !== origin) throw new Error('External active resource: ' + value);
  return decodeURIComponent(url.pathname).replace(/^\//, '');
};
const syntheticText = value => value
  .replaceAll('sms:+12393972048', '#staging-notice?sms=disabled')
  .replaceAll('tel:+12393972048', '#staging-notice?call=disabled')
  .replaceAll('mailto:fixingfortmyers@gmail.com', '#staging-notice?email=disabled')
  .replaceAll('fixingfortmyers@gmail.com', 'staging@example.invalid')
  .replaceAll('(239) 397-2048', '(202) 555-0100')
  .replaceAll('https://fixingfortmyers.com', origin);

export function validateCss(css, label = 'stylesheet', context = 'stylesheet') {
  const resources = [];
  const ast = cssTree.parse(css,{context});
  cssTree.walk(ast,node => {
    if (node.type === 'Atrule' && node.name.toLowerCase() === 'import') throw new Error(label + ': CSS imports require isolation review');
    if (node.type === 'Url') resources.push(local(cssTree.url.decode('url(' + node.value + ')')));
  });
  return resources;
}
function transformPage(html, name) {
  const dom = new JSDOM(html), d = dom.window.document;
  d.querySelectorAll('style').forEach(node => validateCss(node.textContent,name + ': inline stylesheet'));
  d.querySelectorAll('[style]').forEach(node => validateCss(node.getAttribute('style'),name + ': inline style','declarationList'));
  if (d.querySelector('iframe,object,embed,base')) throw new Error(name + ': unsupported embedded document');
  for (const script of [...d.querySelectorAll('script')]) {
    const src = script.getAttribute('src');
    if (!src) { script.remove(); continue; } // Includes JSON-LD, executable inline code and redirects.
    if (/^(?:https?:)?\/\//i.test(src)) { script.remove(); continue; }
    // Saved conversations have a separate memory-only preview. The static staging
    // artifact keeps their inactive fallback, without a real conversation transport.
    if (name === 'customer-conversation.html' && ['customer-conversation-config.js','customer-conversation.js'].includes(local(src))) {
      script.remove(); continue;
    }
    if (!scriptNames.includes(local(src))) throw new Error(name + ': unreviewed script ' + src);
    script.removeAttribute('async'); script.defer = true;
  }
  d.querySelectorAll('meta[property^="og:"],meta[name^="twitter:"],meta[name="robots"],meta[name="googlebot"],meta[name="bingbot"],meta[http-equiv="origin-trial"],meta[http-equiv="refresh"],meta[name="google-site-verification"],meta[name="msvalidate.01"],meta[name="yandex-verification"],meta[name="facebook-domain-verification"],link[rel="canonical"],link[rel="alternate"],link[rel="preconnect"],link[rel="dns-prefetch"]').forEach(node => node.remove());
  for (const node of d.querySelectorAll('*')) {
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name) || ['ping','toolname','tooldescription','toolautosubmit','autofocus','formaction'].includes(attr.name)) node.removeAttribute(attr.name);
    }
  }
  for (const link of d.querySelectorAll('a[href],area[href]')) {
    const raw = link.getAttribute('href');
    const url = new URL(raw, origin);
    if (url.origin !== origin || !['http:','https:'].includes(url.protocol)) {
      link.setAttribute('href','#staging-notice');
      link.setAttribute('data-staging-blocked','External contact/navigation disabled in staging');
      link.setAttribute('aria-disabled','true'); link.removeAttribute('target');
    }
  }
  for (const form of d.forms) {
    form.setAttribute('action','#staging-notice'); form.removeAttribute('target');
    const notice = d.createElement('p'); notice.className = 'staging-form-notice'; notice.textContent = 'STAGING simulation — use synthetic details only. No request, message or appointment will be sent.';
    form.prepend(notice);
  }
  for (const dialog of d.querySelectorAll('dialog')) {
    const notice = d.createElement('p'); notice.className = 'staging-form-notice'; notice.textContent = 'STAGING simulation only — no real messages, requests or bookings.';
    dialog.prepend(notice);
  }
  for (const node of d.querySelectorAll('[src],[srcset],link[href]')) {
    for (const attr of ['src','href']) {
      if (!node.hasAttribute(attr)) continue;
      local(node.getAttribute(attr));
    }
    if (node.hasAttribute('srcset')) for (const item of node.getAttribute('srcset').split(',')) local(item.trim().split(/\s+/)[0]);
  }
  d.title = 'STAGING — ' + d.title;
  const policy = d.createElement('meta'); policy.httpEquiv = 'Content-Security-Policy'; policy.content = contentPolicy;
  const robots = d.createElement('meta'); robots.name = 'robots'; robots.content = noindex;
  const referrer = d.createElement('meta'); referrer.name = 'referrer'; referrer.content = 'no-referrer';
  const guard = d.createElement('script'); guard.src = '/__staging/guard.js';
  const css = d.createElement('link'); css.rel = 'stylesheet'; css.href = '/__staging/staging.css';
  d.head.prepend(policy, robots, referrer, guard, css);
  const banner = d.createElement('aside'); banner.id = 'staging-notice'; banner.setAttribute('role','note');
  banner.textContent = 'STAGING — Synthetic test data only. Forms simulate receipts in this browser; nothing is sent or booked. Calls, texts, email, sign-in, analytics and external links are disabled. Noindex is not access control.';
  d.body.prepend(banner);
  for (const receipt of d.querySelectorAll('.request-done')) {
    const notice = d.createElement('p'); notice.className = 'staging-form-notice'; notice.textContent = 'STAGING simulated receipt only — no request, message or appointment was sent.';
    receipt.prepend(notice);
  }
  const result = syntheticText(dom.serialize()); dom.window.close(); return result;
}

function revision(root) {
  const sha = execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error('Cannot identify exact checked-out source revision');
  if (process.env.CF_PAGES_COMMIT_SHA && process.env.CF_PAGES_COMMIT_SHA.toLowerCase() !== sha.toLowerCase())
    throw new Error('Cloudflare revision does not match checked-out source');
  return sha.toLowerCase();
}

export function buildStaging(root = projectRoot) {
  root = fs.realpathSync(root);
  const output = path.join(root,'.staging-dist');
  const entries = fs.readdirSync(root,{withFileTypes:true});
  const files = new Map();
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error('Source symlink not allowed: ' + entry.name);
    if (!entry.isFile()) continue;
    const name = entry.name, ext = path.extname(name);
    if (ext === '.html' && !/^google[a-f0-9]+\.html$/i.test(name)) files.set(name,transformPage(fs.readFileSync(path.join(root,name),'utf8'),name));
    else if (ext === '.css') {
      const css = fs.readFileSync(path.join(root,name),'utf8');
      validateCss(css,name);
      files.set(name,css);
    } else if (scriptNames.includes(name)) {
      let script = name === 'contact-config.js' ? '// Configuration is locked by the first staging guard.\n' : fs.readFileSync(path.join(root,name),'utf8');
      if (name === 'careers.js') {
        if (!script.includes("https://formsubmit.co/ajax/fixingfortmyers@gmail.com")) throw new Error('Careers endpoint changed; review staging isolation');
        script = script.replace('https://formsubmit.co/ajax/fixingfortmyers@gmail.com', '/__staging/mock/careers')
          .replace('Application received. Thank you for applying to Perfect Timing Auto Repair.','STAGING simulation complete. No application was sent.')
          .replace("window.alert('IT guy says application received');",'');
      }
      files.set(name,syntheticText(script));
    } else if (assetTypes.has(ext.toLowerCase())) files.set(name,fs.readFileSync(path.join(root,name)));
  }
  const addAssets = dir => {
    for (const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})) {
      const name = dir + '/' + entry.name;
      if (entry.isSymbolicLink()) throw new Error('Asset symlink not allowed: ' + name);
      if (entry.isDirectory()) addAssets(name);
      else if (assetTypes.has(path.extname(name).toLowerCase())) files.set(name,fs.readFileSync(path.join(root,name)));
      else throw new Error('Unreviewed asset type: ' + name);
    }
  };
  addAssets('assets');
  files.set('__staging/guard.js',fs.readFileSync(new URL('./staging/guard.js',import.meta.url),'utf8'));
  files.set('__staging/staging.css',fs.readFileSync(new URL('./staging/staging.css',import.meta.url),'utf8'));
  files.set('robots.txt','User-agent: *\nDisallow:\n# No sitemap. Every staging response carries noindex.\n');
  files.set('_headers','/*\n  X-Robots-Tag: ' + noindex + '\n  Content-Security-Policy: ' + contentPolicy + "; frame-ancestors 'none'\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Permissions-Policy: geolocation=(), microphone=(), camera=()\n  Cache-Control: no-store\n");
  const manifest = {environment:'staging',commit:revision(root),syntheticOnly:true,backend:'browser-memory-mocks',analytics:false,oauth:false,noindex:true};
  files.set('staging-build.json',JSON.stringify(manifest,null,2) + '\n');
  for (const [name, content] of files) {
    if (!name.endsWith('.html')) continue;
    const dom = new JSDOM(content), d = dom.window.document;
    for (const node of d.querySelectorAll('[src],link[href]')) {
      const ref = node.getAttribute('src') || node.getAttribute('href');
      const target = local(ref);
      if (!files.has(target)) throw new Error(name + ': missing staged resource ' + ref);
    }
    dom.window.close();
  }
  // Only this fixed, contained build directory is replaced; never the repository root or another checkout.
  if (path.dirname(output) !== root || path.basename(output) !== '.staging-dist') throw new Error('Unsafe output path');
  if (fs.existsSync(output)) {
    if (fs.lstatSync(output).isSymbolicLink()) throw new Error('Output symlink not allowed');
    if (!fs.existsSync(path.join(output,'staging-build.json'))) throw new Error('Refusing to replace unrecognized staging output');
    fs.rmSync(output,{recursive:true,force:true});
  }
  fs.mkdirSync(output);
  for (const [name,content] of files) {
    fs.mkdirSync(path.dirname(path.join(output,name)),{recursive:true});
    fs.writeFileSync(path.join(output,name),content);
  }
  return {output,files:files.size,pages:[...files.keys()].filter(name => name.endsWith('.html')).length,...manifest};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(buildStaging(),null,2));
