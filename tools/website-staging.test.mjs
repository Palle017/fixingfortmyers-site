import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {JSDOM, VirtualConsole} from 'jsdom';
import {buildStaging, scriptNames, contentPolicy, noindex, validateCss} from './build-staging.mjs';

const root = fileURLToPath(new URL('../',import.meta.url));
const sourceHashes = new Map(['CNAME','robots.txt','sitemap.xml','index.html','site.js','contact-config.js','careers.js'].map(name => [name,fs.readFileSync(path.join(root,name))]));
const built = buildStaging(root);
const output = built.output;
const read = name => fs.readFileSync(path.join(output,name),'utf8');
const settle = async () => { for (let n = 0; n < 6; n++) await new Promise(setImmediate); };
function browser(t, page = 'index.html', host = 'https://staging.fixingfortmyers.com') {
  const errors = [], console = new VirtualConsole();
  console.on('jsdomError',error => { if (!/Not implemented: navigation/.test(error.message)) errors.push(error.message); });
  const dom = new JSDOM(read(page),{url:host + '/' + (page === 'index.html' ? '' : page),runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
  const w = dom.window, d = w.document;
  let network = 0;
  w.fetch = async () => { network++; throw new Error('Native network must never be reached'); };
  w.Headers = Headers;
  w.matchMedia = () => ({matches:false});
  w.HTMLElement.prototype.scrollIntoView = function () {};
  if (w.HTMLDialogElement) {
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  }
  for (const script of d.querySelectorAll('script[src]')) w.eval(read(new URL(script.src).pathname.slice(1)));
  const enter = (id,value) => {
    const input = d.getElementById(id); assert.ok(input,id); input.value = value;
    input.dispatchEvent(new w.Event('input',{bubbles:true}));
    input.dispatchEvent(new w.Event('change',{bubbles:true}));
  };
  const submit = id => d.getElementById(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  t.after(() => { w.close(); assert.equal(network,0,'no original/native fetch calls'); assert.deepEqual(errors,[]); });
  return {w,d,enter,submit};
}

test('conversation staging stays on its inactive fallback without copying a live transport', t => {
  if (!fs.existsSync(path.join(output,'customer-conversation.html'))) return;
  const {d} = browser(t,'customer-conversation.html');
  assert.equal(d.getElementById('conversation-app').hidden,true);
  assert.equal(d.getElementById('unavailable').hidden,false);
  assert.match(d.getElementById('unavailable').textContent,/not open yet/);
  for (const name of ['customer-conversation.js','customer-conversation-config.js','customer-conversation-protocol.js'])
    assert.equal(fs.existsSync(path.join(output,name)),false,name + ': transport stays outside static staging');
});

test('every staged page has guard first, noindex, visible labeling, isolated resources and no production publication files', () => {
  const pages = fs.readdirSync(output).filter(name => name.endsWith('.html'));
  assert.deepEqual(pages.sort(),fs.readdirSync(root).filter(name => name.endsWith('.html') && !/^google[a-f0-9]+\.html$/i.test(name)).sort());
  for (const name of pages) {
    const html = read(name), dom = new JSDOM(html), d = dom.window.document;
    assert.match(d.title,/^STAGING/);
    assert.equal(d.querySelector('meta[name="robots"]').content,noindex);
    assert.equal(d.head.firstElementChild.httpEquiv,'Content-Security-Policy');
    assert.equal(d.head.firstElementChild.content,contentPolicy);
    assert.equal(d.querySelector('script').getAttribute('src'),'/__staging/guard.js');
    assert.match(d.getElementById('staging-notice').textContent,/nothing is sent or booked/);
    assert.equal(d.querySelectorAll('script:not([src]),iframe,object,embed,base,link[rel="canonical"],meta[http-equiv="refresh"],meta[http-equiv="origin-trial"]').length,0,name);
    for (const node of d.querySelectorAll('*')) for (const attr of node.attributes) {
      assert.ok(!/^on/i.test(attr.name),name + ': no inline event handler');
      assert.ok(!['toolname','tooldescription','toolautosubmit','formaction','ping'].includes(attr.name),name + ': no automation submit or ping');
    }
    for (const script of d.querySelectorAll('script[src]')) assert.ok(['__staging/guard.js',...scriptNames].includes(new URL(script.src,'https://staging.fixingfortmyers.com').pathname.slice(1)));
    for (const node of d.querySelectorAll('[href],[src],[srcset]')) {
      const values = ['href','src'].filter(attr => node.hasAttribute(attr)).map(attr => node.getAttribute(attr));
      if (node.hasAttribute('srcset')) values.push(...node.getAttribute('srcset').split(',').map(item => item.trim().split(/\s+/)[0]));
      for (const ref of values) {
        const url = new URL(ref,'https://staging.fixingfortmyers.com');
        assert.equal(url.origin,'https://staging.fixingfortmyers.com',name + ': ' + ref);
        assert.ok(['https:','http:'].includes(url.protocol),name + ': no contact protocol');
        if (!node.matches('a,area,form')) assert.ok(fs.existsSync(path.join(output,decodeURIComponent(url.pathname))),name + ': resource exists ' + ref);
      }
    }
    for (const form of d.forms) assert.match(form.textContent,/STAGING simulation/);
    dom.window.close();
  }
  for (const name of ['CNAME','sitemap.xml','googlefc91785ed4d05625.html','a0f8f7f6cad8445382fa07471976bd35.txt','_website-intake','tools','docs','deploy','node_modules','.git','.env']) assert.ok(!fs.existsSync(path.join(output,name)),name + ' excluded');
  assert.match(read('_headers'),/\/\*\n  X-Robots-Tag: noindex/);
  assert.match(read('_headers'),/connect-src 'none'/);
  assert.match(read('_headers'),/form-action 'none'/);
  assert.match(read('_headers'),/Permissions-Policy: geolocation=\(\), microphone=\(\), camera=\(\)/);
  assert.equal(read('robots.txt').split('\n').slice(0,2).join('\n'),'User-agent: *\nDisallow:');
  assert.doesNotMatch(read('robots.txt'),/^Sitemap:/im);
  assert.doesNotMatch(read('careers.js'),/formsubmit\.co/);
  const manifest = JSON.parse(read('staging-build.json'));
  assert.equal(manifest.commit,execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim());
  assert.equal(manifest.syntheticOnly,true); assert.equal(manifest.analytics,false); assert.equal(manifest.oauth,false);
  for (const [name,before] of sourceHashes) assert.deepEqual(fs.readFileSync(path.join(root,name)),before,name + ': production source unchanged');
});

test('repair form submits to browser-memory mock and keeps generated handoff links unable to contact the shop', async t => {
  const x = browser(t); await settle();
  x.enter('request-name','Synthetic Staging Tester');
  x.enter('request-phone','2025550100');
  x.enter('request-vehicle','2018 Test Vehicle');
  x.submit('bookingForm'); await settle();
  assert.equal(x.d.getElementById('request-done').hidden,false);
  assert.match(x.d.getElementById('request-done-heading').textContent,/Got it, Synthetic Staging Tester\. Tony calls back ASAP\./);
  assert.equal(x.w.PT_STAGING.calls.filter(call => call.path === '/hooks/lead/webform').length,1);
  assert.equal(x.w.PT_ANALYTICS_STATUS.customMetrics,'disabled');
  assert.equal(x.w.PT_ANALYTICS_STATUS.ga4,'preview_disabled');
  for (const a of x.d.querySelectorAll('a[href]')) assert.equal(new URL(a.href).origin,'https://staging.fixingfortmyers.com');
});

test('parts form produces only a synthetic mock receipt and no external draft', async t => {
  const x = browser(t,'parts.html'); await settle();
  x.enter('parts-name','Synthetic Parts Tester'); x.enter('parts-phone','2025550100');
  x.enter('parts-description','Synthetic part'); x.enter('parts-vehicle','2018 Test Vehicle');
  x.submit('partsForm'); await settle();
  assert.match(x.d.getElementById('parts-status').textContent,/received and saved/);
  assert.equal(x.w.PT_STAGING.calls.filter(call => call.path === '/hooks/lead/webform').length,1);
  assert.match(x.d.getElementById('parts-text').href,/#staging-notice/);
  assert.match(x.d.getElementById('parts-email-draft').href,/#staging-notice/);
});

test('careers form uses synthetic response rather than real FormSubmit email', async t => {
  const x = browser(t,'careers.html'); await settle();
  const form = x.d.getElementById('careers-form');
  for (const [name,value] of Object.entries({name:'Synthetic Candidate',phone:'2025550100',email:'candidate@example.invalid',details:'Synthetic application only'})) {
    const input = form.elements.namedItem(name); input.value = value; input.dispatchEvent(new x.w.Event('input',{bubbles:true}));
  }
  for (const name of ['role','experience']) form.elements.namedItem(name).selectedIndex = 1;
  x.submit('careers-form'); await settle();
  assert.match(x.d.getElementById('careers-status').textContent,/STAGING simulation complete\. No application was sent/);
  assert.deepEqual(JSON.parse(JSON.stringify(x.w.PT_STAGING.calls)),[{path:'/careers',method:'POST'}]);
});

test('unknown network routes, production endpoints, native forms and alternate transports fail closed', async t => {
  const x = browser(t); await settle(); const w = x.w;
  for (const target of ['https://fixingfortmyers.com/','https://perfect-timing-cloud-intake.prudhvi-pallempati.chatgpt.site/hooks/lead/webform','https://formsubmit.co/ajax/fixingfortmyers@gmail.com','/hooks/analytics/event','/__staging/mock/private/drain','/__staging/mock/healthz?redirect=production'])
    await assert.rejects(w.fetch(target,{method:'POST',mode:'no-cors'}),/STAGING blocked/);
  for (const name of ['XMLHttpRequest','WebSocket','EventSource','Worker','SharedWorker','RTCPeerConnection'])
    assert.throws(() => new w[name]('https://production.invalid'),/STAGING blocked/);
  assert.equal(w.navigator.sendBeacon('https://production.invalid','synthetic'),false);
  assert.equal(w.open('https://dashboard.fixingfortmyers.com'),null);
  assert.throws(() => { w.PT_CONTACT_CONFIG.endpoint = 'https://production.invalid'; },TypeError);
  assert.throws(() => { w.fetch = globalThis.fetch; },TypeError);
  assert.throws(() => x.d.getElementById('bookingForm').submit(),/STAGING blocked/);
  const f = x.d.createElement('form'); f.action = 'https://production.invalid'; x.d.body.append(f);
  let prevented = false; f.addEventListener('submit',e => { prevented = e.defaultPrevented; });
  f.requestSubmit(); assert.equal(prevented,true);
  let geoError; w.navigator.geolocation.getCurrentPosition(() => assert.fail('real location prohibited'),error => { geoError = error; });
  assert.equal(geoError.code,1);
  await assert.rejects(w.navigator.mediaDevices.getUserMedia({audio:true}),/STAGING blocked/);
  await assert.rejects(w.navigator.serviceWorker.register('/service-worker.js'),/STAGING blocked/);
});

test('static and freshly regenerated external/contact links cannot navigate through click, new-tab or context menu paths', async t => {
  const x = browser(t,'owner-desk.html'); await settle();
  const a = x.d.createElement('a'); x.d.body.append(a);
  for (const target of ['sms:+12393972048?body=synthetic','mailto:fixingfortmyers@gmail.com','tel:+12393972048','https://dashboard.fixingfortmyers.com/']) {
    a.removeAttribute('data-staging-blocked'); a.href = target;
    const click = new x.w.MouseEvent('click',{bubbles:true,cancelable:true}); a.dispatchEvent(click); assert.equal(click.defaultPrevented,true);
    a.removeAttribute('data-staging-blocked'); a.href = target; a.click(); assert.match(a.href,/#staging-notice/);
    a.removeAttribute('data-staging-blocked'); a.href = target;
    const context = new x.w.MouseEvent('contextmenu',{bubbles:true,cancelable:true}); a.dispatchEvent(context); assert.equal(context.defaultPrevented,true);
    a.removeAttribute('data-staging-blocked'); a.href = target; await settle(); assert.match(a.href,/#staging-notice/);
  }
  a.setAttribute('data-staging-blocked','Previously disabled');
  a.href = 'sms:+12393972048?body=synthetic'; await settle(); assert.match(a.href,/#staging-notice/);
  for (const link of x.d.querySelectorAll('a[href]')) assert.equal(new URL(link.href).origin,'https://staging.fixingfortmyers.com');
});

test('mock retries remain in memory and mock media/calendar never place real appointments', async t => {
  const x = browser(t); const w = x.w, base = w.PT_CONTACT_CONFIG.endpoint;
  const options = {method:'POST',headers:{'Idempotency-Key':'synthetic-retry-key'},body:'Synthetic data not retained'};
  const first = await (await w.fetch(base + '/hooks/lead/webform',options)).json();
  const second = await (await w.fetch(base + '/hooks/lead/webform',options)).json();
  assert.equal(first.id,second.id); assert.equal(first.synthetic,true);
  const media = await (await w.fetch(base + '/hooks/lead/media/' + first.id,{method:'POST',body:'Synthetic bytes'})).json();
  assert.equal(media.synthetic,true);
  const state = await (await w.fetch(base + '/hooks/calendar/status/' + first.id)).json();
  assert.equal(state.calendarPlaced,false); assert.equal(state.calendarConfirmed,false);
  assert.doesNotMatch(JSON.stringify(w.PT_STAGING.calls),/Synthetic data|Synthetic bytes|synthetic-retry-key/);
});

test('builder refuses unreviewed scripts and embeds before writing any output', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(),'website-staging-'));
  try {
    fs.mkdirSync(path.join(fixture,'assets'));
    for (const html of ['<!doctype html><script src="/new-integration.js"></script>','<!doctype html><iframe src="https://production.invalid"></iframe>']) {
      fs.writeFileSync(path.join(fixture,'index.html'),html);
      assert.throws(() => buildStaging(fixture),/unreviewed script|unsupported embedded document/);
      assert.equal(fs.existsSync(path.join(fixture,'.staging-dist')),false);
    }
  } finally { fs.rmSync(fixture,{recursive:true,force:true}); }
});

test('same-origin mocks also work on provider aliases and local verification hosts', async t => {
  for (const host of ['https://staging-preview.pages.dev','http://127.0.0.1:18934']) {
    const x = browser(t,'careers.html',host); await settle();
    assert.equal(x.w.PT_CONTACT_CONFIG.endpoint,host + '/__staging/mock');
    const endpoint = read('careers.js').match(/const endpoint = '([^']+)'/)[1];
    const result = await (await x.w.fetch(endpoint,{method:'POST',body:'Synthetic only'})).json();
    assert.equal(result.synthetic,true);
  }
});

test('CSS inspection rejects external destinations including escaped URLs and imports', () => {
  assert.throws(() => validateCss('a{background:url(https://production.invalid/image)}'),/External active resource/);
  assert.throws(() => validateCss('a{background:url(' + String.fromCharCode(92) + '68 ttps://production.invalid/image)}'),/External active resource/);
  assert.throws(() => validateCss('@import "/new-integration.css";'),/isolation review/);
  assert.deepEqual(validateCss('a{background:url(/assets/example.webp)}'),['assets/example.webp']);
});
