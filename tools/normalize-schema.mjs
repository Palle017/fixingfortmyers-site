// Keeps the business entity in JSON-LD identical on every page and fills the
// structured-data fields Google reads for a service-area auto repair business.
// Business facts (name, phone, hours, service area) come from the homepage
// node, which mirrors the visible copy; this script never invents new ones.
// Usage: node tools/normalize-schema.mjs [--check]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const SITE = 'https://fixingfortmyers.com';
const BIZ = `${SITE}/#business`;
const check = process.argv.includes('--check');
const LD = /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g;
const pages = fs.readdirSync('.').filter(f => f.endsWith('.html')).sort();

const blocks = html => [...html.matchAll(LD)].map(m => JSON.parse(m[2]));
const nodes = j => (j['@graph'] || [j]);

const home = nodes(blocks(fs.readFileSync('index.html', 'utf8'))[0]).find(n => n['@type'] === 'AutoRepair');
const { hasOfferCatalog, ...homeBiz } = home;
const ORDER = ['@type', '@id', 'name', 'legalName', 'alternateName', 'description', 'url', 'logo', 'image',
  'telephone', 'email', 'priceRange', 'address', 'hasMap', 'openingHoursSpecification', 'areaServed', 'sameAs'];
const mapUrl = homeBiz.sameAs.find(u => u.startsWith('https://www.google.com/maps/'));
const business = Object.fromEntries(ORDER.map(k => [k, ({
  ...homeBiz,
  alternateName: 'Perfect Timing Auto Repair',
  // Service-area business: city and state only. The street address stays private.
  address: { '@type': 'PostalAddress', addressLocality: 'Fort Myers', addressRegion: 'FL', addressCountry: 'US' },
  hasMap: mapUrl,
  areaServed: homeBiz.areaServed.map(a => ({ '@type': a.name === 'Tice' ? 'Place' : a['@type'], name: a.name })),
})[k]]).filter(([, v]) => v !== undefined));

// Compact business reference for pages that don't carry the full node, so the
// @id still resolves to a name, URL and logo on that page.
const bizRef = { '@type': 'Organization', '@id': BIZ, name: business.name, url: business.url, logo: business.logo };

const meta = (html, prop) => (html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`)) || [])[1];
const gitDate = (f, first) => {
  const out = execFileSync('git', ['log', '--format=%cs', '--', f], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  return first ? out.at(-1) : out[0];
};

function fixNode(n, page, html) {
  if (n['@type'] === 'AutoRepair' && n['@id'] === BIZ) {
    // Each page keeps the profile links it already lists (pages link different Facebook URLs
    // that could not be confirmed as the same page).
    const merged = { ...business, sameAs: n.sameAs ?? business.sameAs };
    return page === 'index.html' ? { ...merged, ...(hasOfferCatalog && { hasOfferCatalog }) } : merged;
  }
  if (n['@type'] === 'Service' && typeof n.serviceType === 'string') {
    // serviceType names the kind of service; the city belongs in areaServed.
    n.serviceType = n.serviceType.replace(/\s+(?:in|for)\s+(?:Fort Myers|Cape Coral|Lehigh Acres|North Fort Myers)(?:,\s*FL|\s+Drivers)?$/i, '');
  }
  if (n['@type'] === 'Article') {
    const img = meta(html, 'og:image');
    n.image ??= img ? [img] : undefined;
    n.author ??= bizRef;
    n.publisher = bizRef;
    n.datePublished ??= gitDate(page, true);
    n.dateModified = n.dateModified ?? gitDate(page, false);
    n.isPartOf ??= { '@id': `${SITE}/#website` };
    if (!n.image) delete n.image;
  }
  if (n['@type'] === 'WebPage' && n.about?.['@type'] === 'Organization') n.about = bizRef;
  return n;
}

let changed = 0;
for (const page of pages) {
  const html = fs.readFileSync(page, 'utf8');
  const out = html.replace(LD, (all, open, body, close) => {
    const j = JSON.parse(body);
    const before = JSON.stringify(j);
    if (j['@graph']) j['@graph'] = j['@graph'].map(n => fixNode(n, page, html));
    else Object.assign(j, fixNode(j, page, html));
    if (JSON.stringify(j) === before) return all;
    const lead = body.startsWith('\n') ? '\n' : '';
    return open + lead + JSON.stringify(j, null, 2) + (body.endsWith('\n') ? '\n' : '') + close;
  });
  if (out !== html) {
    changed++;
    if (check) console.log('needs normalizing:', page);
    else fs.writeFileSync(page, out);
  }
}
console.log(`${check ? 'checked' : 'normalized'} ${pages.length} pages, ${changed} ${check ? 'out of date' : 'changed'}`);
if (check && changed) process.exit(1);
