// Blog index and post template: snippets, Article data, nav/footer links, and existing click tags.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM, VirtualConsole} from 'jsdom';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const SITE = 'https://fixingfortmyers.com';
const BANNED = [/shop/i, /mobile/i, /pickup/i, /by appointment/i, /24\/7/, /13037/, /Second St/i, /Saddleback/i];
const blogFiles = fs.readdirSync(new URL('blog/', root)).filter(name => name.endsWith('.html')).sort();
const INDEX_TITLE = 'Repair notes | Perfect Timing Auto Repair';
const INDEX_DESC = 'Repair notes from Tony at Perfect Timing Auto Repair in Fort Myers. Call (239) 397-2048.';
const POST_TITLE = 'Sample repair note | Perfect Timing';
const POST_DESC = 'Sample repair note from Tony at Perfect Timing Auto Repair in Fort Myers. Call (239) 397-2048.';
const NOTE_SLUG = 'brake-job-cost-fort-myers';
const NOTE_TITLE = 'What affects brake job cost in Fort Myers | Perfect Timing';
const NOTE_DESC = 'What affects a brake job in Fort Myers: pads, rotors, calipers, fluid, vehicle type, parts, and how long the work was put off. Call (239) 397-2048.';

const documentOf = file => new JSDOM(read(file)).window.document;
const ld = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
const snippetFields = document => [
  document.querySelector('title').textContent,
  document.querySelector('meta[name="description"]').getAttribute('content'),
  ...[...document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]')].map(node => node.getAttribute('content')),
];

test('blog files are the index, the post template, and published notes', () => {
  assert.deepEqual(blogFiles, ['_template.html', `${NOTE_SLUG}.html`, 'index.html']);
});

test('shared nav and footer link to /blog', () => {
  const pages = fs.readdirSync(root).filter(name => name.endsWith('.html'));
  let linked = 0;
  for (const file of pages) {
    const html = read(file);
    if (!html.includes('class="pt-layout-navigation"')) continue;
    linked += 1;
    const document = documentOf(file);
    assert.equal(document.querySelector('.pt-layout-navigation a[href="/blog"]')?.textContent.trim(), 'Blog', `${file} nav`);
    assert.equal(document.querySelector('footer a[href="/blog"]')?.textContent.trim(), 'Blog', `${file} footer`);
  }
  assert.ok(linked >= 50, `only ${linked} navs link to the blog`);
});

test('blog index snippet, canonical, published notes, and sitemap entry', () => {
  const html = read('blog/index.html');
  const document = documentOf('blog/index.html');
  const titles = [
    document.querySelector('title').textContent,
    document.querySelector('meta[property="og:title"]').getAttribute('content'),
    document.querySelector('meta[name="twitter:title"]').getAttribute('content'),
  ];
  const descriptions = [
    document.querySelector('meta[name="description"]').getAttribute('content'),
    document.querySelector('meta[property="og:description"]').getAttribute('content'),
    document.querySelector('meta[name="twitter:description"]').getAttribute('content'),
  ];
  assert.deepEqual(titles, [INDEX_TITLE, INDEX_TITLE, INDEX_TITLE]);
  assert.deepEqual(descriptions, [INDEX_DESC, INDEX_DESC, INDEX_DESC]);
  assert.equal(document.querySelector('link[rel="canonical"]').getAttribute('href'), `${SITE}/blog`);
  assert.equal(document.querySelector('meta[property="og:url"]').getAttribute('content'), `${SITE}/blog`);
  assert.equal(document.querySelector('meta[property="og:type"]').getAttribute('content'), 'website');
  assert.equal(document.getElementById('blog-empty'), null);
  const listed = [...document.querySelectorAll('#blog-posts li')];
  assert.equal(listed.length, 1);
  assert.equal(listed[0].querySelector('a').getAttribute('href'), `/blog/${NOTE_SLUG}`);
  assert.equal(listed[0].querySelector('a').textContent.trim(), NOTE_TITLE);
  assert.equal(listed[0].querySelector('time').getAttribute('datetime'), '2026-10-30');
  assert.equal(listed[0].querySelector('time').textContent.trim(), 'October 30, 2026');
  assert.match(read('sitemap.xml'), /<loc>https:\/\/fixingfortmyers\.com\/blog<\/loc>/);
  assert.match(read('sitemap.xml'), new RegExp(`<loc>https://fixingfortmyers\\.com/blog/${NOTE_SLUG}</loc>`));
  assert.doesNotMatch(read('sitemap.xml'), /blog\/(?:_template|post-slug)/);
  assert.match(read('site.js'), new RegExp(`'/blog/${NOTE_SLUG}'`));
  const blog = ld(html).flatMap(node => node['@graph'] || [node]).find(node => node['@type'] === 'Blog');
  assert.equal(blog.description, INDEX_DESC);
  assert.equal(blog.author.name, 'Tony');
  assert.equal(blog.author.affiliation.name, 'Perfect Timing Auto Repair');
  assert.equal(blog.publisher.name, 'Perfect Timing Auto Repair');
});

test('post template carries the article snippet, related services, and closing actions', () => {
  const html = read('blog/_template.html');
  const document = documentOf('blog/_template.html');
  assert.match(html, /<meta name="robots" content="[^"]*noindex/);
  assert.equal(document.querySelector('title').textContent, POST_TITLE);
  assert.equal(document.querySelector('meta[name="description"]').getAttribute('content'), POST_DESC);
  assert.equal(document.querySelector('meta[property="og:title"]').getAttribute('content'), POST_TITLE);
  assert.equal(document.querySelector('meta[name="twitter:title"]').getAttribute('content'), POST_TITLE);
  assert.equal(document.querySelector('meta[property="og:description"]').getAttribute('content'), POST_DESC);
  assert.equal(document.querySelector('meta[name="twitter:description"]').getAttribute('content'), POST_DESC);
  assert.equal(document.querySelector('meta[property="og:type"]').getAttribute('content'), 'article');
  assert.equal(document.querySelector('link[rel="canonical"]').getAttribute('href'), `${SITE}/blog/post-slug`);
  assert.equal(document.querySelector('meta[property="og:url"]').getAttribute('content'), `${SITE}/blog/post-slug`);
  assert.match(html, /title: Sample repair note \| Perfect Timing/);
  assert.match(html, /date: 2026-10-30/);
  assert.match(html, /slug: post-slug/);
  assert.match(html, /related_services: \/engine-repair-fort-myers/);
  const related = [...document.querySelectorAll('.blog-related a')];
  assert.deepEqual(related.map(anchor => anchor.getAttribute('href')), ['/engine-repair-fort-myers']);
  assert.equal(fs.existsSync(new URL('../engine-repair-fort-myers.html', import.meta.url)), true);
  const article = ld(html).flatMap(node => node['@graph'] || [node]).find(node => node['@type'] === 'Article');
  assert.equal(article.headline, POST_TITLE);
  assert.ok(article.headline.length <= 110);
  assert.equal(article.description, POST_DESC);
  assert.equal(article.datePublished, document.querySelector('time').getAttribute('datetime'));
  assert.equal(article.dateModified, article.datePublished);
  assert.equal(article.author['@type'], 'Person');
  assert.equal(article.author.name, 'Tony');
  assert.equal(article.author.affiliation.name, 'Perfect Timing Auto Repair');
  assert.equal(article.publisher.name, 'Perfect Timing Auto Repair');
  assert.equal(article.publisher.logo.url, `${SITE}/assets/pt-logo-new.webp`);
  assert.equal(article.image, `${SITE}/assets/og-card-20260906.jpg`);
});

test('published brake-cost note matches its snippet, date, and related services', () => {
  const html = read(`blog/${NOTE_SLUG}.html`);
  const document = documentOf(`blog/${NOTE_SLUG}.html`);
  assert.equal(document.querySelector('meta[name="robots"]'), null);
  assert.equal(document.querySelector('title').textContent, NOTE_TITLE);
  assert.equal(document.querySelector('meta[name="description"]').getAttribute('content'), NOTE_DESC);
  assert.equal(document.querySelector('meta[property="og:title"]').getAttribute('content'), NOTE_TITLE);
  assert.equal(document.querySelector('meta[name="twitter:title"]').getAttribute('content'), NOTE_TITLE);
  assert.equal(document.querySelector('meta[property="og:description"]').getAttribute('content'), NOTE_DESC);
  assert.equal(document.querySelector('meta[name="twitter:description"]').getAttribute('content'), NOTE_DESC);
  assert.equal(document.querySelector('meta[property="og:type"]').getAttribute('content'), 'article');
  assert.equal(document.querySelector('link[rel="canonical"]').getAttribute('href'), `${SITE}/blog/${NOTE_SLUG}`);
  assert.equal(document.querySelector('meta[property="og:url"]').getAttribute('content'), `${SITE}/blog/${NOTE_SLUG}`);
  assert.equal(document.querySelector('h1').textContent, 'What affects brake job cost in Fort Myers');
  assert.equal(document.querySelector('time').getAttribute('datetime'), '2026-10-30');
  const related = [...document.querySelectorAll('.blog-related a')].map(anchor => anchor.getAttribute('href'));
  assert.deepEqual(related, ['/brake-repair-fort-myers', '/suspension-steering-repair-fort-myers', '/auto-diagnostics-fort-myers']);
  for (const href of related) assert.equal(fs.existsSync(new URL(`..${href}.html`, import.meta.url)), true, href);
  const article = ld(html).flatMap(node => node['@graph'] || [node]).find(node => node['@type'] === 'Article');
  assert.equal(article.headline, NOTE_TITLE);
  assert.equal(article.description, NOTE_DESC);
  assert.equal(article.datePublished, '2026-10-30');
  assert.equal(article.dateModified, '2026-10-30');
  assert.equal(article.mainEntityOfPage, `${SITE}/blog/${NOTE_SLUG}`);
  assert.equal(article.author.name, 'Tony');
  assert.equal(article.publisher.name, 'Perfect Timing Auto Repair');
});

test('blog snippets and JSON-LD stay inside the caps and out of the banned words', () => {
  for (const file of blogFiles) {
    const html = read(`blog/${file}`);
    const document = documentOf(`blog/${file}`);
    const fields = snippetFields(document);
    const json = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');
    for (const title of [fields[0], document.querySelector('meta[property="og:title"]').getAttribute('content'), document.querySelector('meta[name="twitter:title"]').getAttribute('content')]) {
      assert.ok([...title].length <= 60, `${file} title is ${[...title].length}`);
    }
    for (const description of [fields[1], document.querySelector('meta[property="og:description"]').getAttribute('content'), document.querySelector('meta[name="twitter:description"]').getAttribute('content')]) {
      assert.ok([...description].length <= 160, `${file} description is ${[...description].length}`);
    }
    for (const text of [...fields, json]) for (const word of BANNED) assert.doesNotMatch(text, word, `${file} ${word}`);
    assert.doesNotMatch(json, /13037|Saddleback|Second St/i, file);
  }
});

test('every blog page closes with Call, Text, and Request a repair', () => {
  for (const file of blogFiles) {
    const document = documentOf(`blog/${file}`);
    const actions = [...document.querySelectorAll('.blog-cta .guide-actions a')];
    assert.deepEqual(actions.map(anchor => [anchor.textContent.trim(), anchor.getAttribute('href'), anchor.className]), [
      ['Call', 'tel:+12393972048', 'btn btn--primary'],
      ['Text', 'sms:+12393972048', 'btn btn--outline'],
      ['Request a repair', '/request-a-repair', 'btn btn--outline'],
    ], file);
    assert.match(read(`blog/${file}`), /<script src="\/site\.js/);
  }
});

test('blog contact actions use the existing site.js click tags', () => {
  const html = read('blog/_template.html');
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!/Not implemented: navigation/.test(error.message)) throw error; });
  const dom = new JSDOM(html, {url: `${SITE}/blog/post-slug`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole});
  const w = dom.window;
  w.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
  w.eval(read('site.js'));
  for (const selector of ['.blog-cta a[href^="tel:"]', '.blog-cta a[href^="sms:"]', '.blog-cta a[href="/request-a-repair"]']) {
    w.document.querySelector(selector).dispatchEvent(new w.MouseEvent('click', {bubbles: true, cancelable: true}));
  }
  const tagged = [...w.dataLayer].filter(entry => entry && ['phone_click', 'text_click', 'request_form_click'].includes(String(entry.event)));
  assert.deepEqual(tagged.map(entry => String(entry.event)), ['phone_click', 'text_click', 'request_form_click']);
  for (const entry of tagged) assert.equal(String(entry.placement), 'page');
  assert.match(read('site.js'), /'\/blog'/);
  w.close();
});
