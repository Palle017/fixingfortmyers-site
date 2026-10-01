import glob,re,json,sys
warn=[]
H=sorted(glob.glob('*.html'))
NEW={'workshop.html','paint-correction-detailing-fort-myers.html'}
def rd(f): return open(f,encoding='utf-8').read()
def wr(f,s): open(f,'w',encoding='utf-8').write(s)
def rep1(f,a,b,required=True):
    s=rd(f)
    if s.count(a)!=1:
        (warn.append(f'{f}: not found once: {a[:60]}') if not required else (_ for _ in ()).throw(SystemExit(f'{f}: {s.count(a)}x {a[:70]}')))
        return
    wr(f,s.replace(a,b))
# A hero image
n=0
for f in [x for x in H if x not in NEW]+['style.css','service-pages.css','site-updates.css']:
    s=rd(f); o=s
    s=s.replace('tony-mobile-diagnostics-small.webp','tony-at-work-small.webp').replace('tony-mobile-diagnostics.webp','tony-at-work.webp')
    if s!=o: wr(f,s); n+=1
print('A hero files',n)
# B careers image
rep1('careers.html','<img src="/assets/tony-mobile-engine-repair.webp" alt="Tony from Perfect Timing Auto Repair working under the hood of a car"','<img src="/assets/workshop-fabrication.webp" alt="Tony welding in the Perfect Timing workshop"')
# C about page
s=rd('about-perfect-timing.html')
m=re.search(r'(<p class="proof-hero__lead">[^<]*final check\.</p>)',s)
if m:
    wr('about-perfect-timing.html',s.replace(m.group(1),m.group(1)+'\n        <p class="proof-hero__lead">The work is done in <a href="/workshop">Tony’s own fully equipped workshop</a> at Bayshore Ranch: engine and transmission rebuilds and replacements, walnut blasting, welding, diesel, hot rods, restoration, and <a href="/paint-correction-detailing-fort-myers">paint correction and detailing</a>.</p>',1))
else: warn.append('about: lead paragraph not found')
# D index
rep1('index.html','        <span class="area-tag">Fort Myers Beach</span>\n','        <span class="area-tag">Fort Myers Beach</span>\n        <span class="area-tag">Sanibel</span>\n        <span class="area-tag">Pine Island</span>\n',False)
rep1('index.html','<a href="/diesel-repair-fort-myers">Diesel Repair</a>\n','<a href="/diesel-repair-fort-myers">Diesel Repair</a>\n<a href="/workshop">Tony’s Workshop</a>\n<a href="/paint-correction-detailing-fort-myers">Paint Correction &amp; Detailing</a>\n',False)
# E/F links, mini-links, footers
fam={'engine-repair-fort-myers','transmission-repair-fort-myers','engine-rebuild-vs-replacement-fort-myers','engine-knocking-noise-fort-myers','blue-smoke-burning-oil-fort-myers','diesel-repair-fort-myers','hot-rod-restoration-fort-myers','race-car-modifications-fort-myers','transmission-slipping-fort-myers','head-gasket-overheating-damage-fort-myers'}
L=M=F1=F2=0
for f in H:
    if f in NEW: continue
    s=rd(f); o=s
    parts=re.split(r'(<script\b.*?</script>|<head>.*?</head>|<a\b[^>]*>.*?</a>|<title>.*?</title>)',s,flags=re.S)
    for i,p in enumerate(parts):
        if p.startswith(('<script','<head','<a','<title')): continue
        parts[i],k=re.subn(r'Tony(’|\')s fully equipped workshop',lambda m:f'<a href="/workshop">Tony{m.group(1)}s fully equipped workshop</a>',p); L+=k
    s=''.join(parts)
    slug=f[:-5]
    if slug in fam and 'service-mini-link" href="/workshop"' not in s:
        s,k=re.subn(r'(<div class="service-mini-links[^>]*>\s*)',r'\1<a class="service-mini-link" href="/workshop">Tony’s Workshop</a>',s,count=1); M+=k
    if slug=='hot-rod-restoration-fort-myers' and 'service-mini-link" href="/paint-correction' not in s:
        s=re.sub(r'(<div class="service-mini-links[^>]*>\s*)',r'\1<a class="service-mini-link" href="/paint-correction-detailing-fort-myers">Paint Correction &amp; Detailing</a>',s,count=1)
    if '<footer' in s:
        a,b=s.index('<footer'),s.index('</footer>'); ft=s[a:b]
        if 'href="/workshop"' not in ft:
            ft,k=re.subn(r'(\n(\s*)<li><a href="/about-perfect-timing">About Our Team</a></li>)',r'\1\n\2<li><a href="/workshop">Tony’s Workshop</a></li>',ft,count=1); F1+=k
        if 'paint-correction-detailing' not in ft:
            ft,k=re.subn(r'(\n(\s*)<li><a href="/transmission-repair-fort-myers">Transmission[^<]*</a></li>)',r'\1\n\2<li><a href="/paint-correction-detailing-fort-myers">Paint &amp; Detailing</a></li>',ft,count=1); F2+=k
        s=s[:a]+ft+s[b:]
    if s!=o: wr(f,s)
print('E/F text links',L,'mini',M,'footer workshop',F1,'footer paint',F2)
# G areaServed + H schema address
ADD=[('City','Tice'),('City','Estero'),('City','Bonita Springs'),('Place','Alva'),('Place','Buckingham'),('City','Fort Myers Beach'),('City','Sanibel'),('Place','Pine Island')]
BASE=['Fort Myers','Cape Coral','Lehigh Acres','North Fort Myers']
# The street address is hidden (owner, Oct 1), so no address is added to the schema or footer.
ADDR=None
G=A=FN=0
for f in H:
    if f in NEW: continue
    s=rd(f); o=s
    def fb(m):
        global G,A
        try: data=json.loads(m.group(2))
        except Exception: return m.group(0)
        hit=[False]
        def walk(x):
            global G,A
            if isinstance(x,dict):
                t=x.get('@type'); t=t if isinstance(t,list) else [t]
                if ('AutoRepair' in t or str(x.get('@id','')).endswith('/#business')) and ADDR and 'address' not in x and ('name' in x or 'telephone' in x):
                    items=list(x.items()); x.clear()
                    for kk,vv in items:
                        x[kk]=vv
                        if kk=='telephone': x['address']=dict(ADDR)
                    x.setdefault('address',dict(ADDR)); hit[0]=True; A+=1
                for k,v in list(x.items()):
                    if k=='areaServed' and isinstance(v,list) and all(isinstance(e,dict) and 'name' in e for e in v) and {e['name'] for e in v}&set(BASE):
                        names={e['name'] for e in v}
                        for b in BASE:
                            if b not in names: v.append({'@type':'City','name':b}); names.add(b); hit[0]=True
                        for tt,nn in ADD:
                            if nn not in names: v.append({'@type':tt,'name':nn}); hit[0]=True; G+=1
                    else: walk(v)
            elif isinstance(x,list):
                for e in x: walk(e)
        walk(data)
        return m.group(1)+json.dumps(data,indent=2,ensure_ascii=False)+m.group(3) if hit[0] else m.group(0)
    s=re.sub(r'(<script type="application/ld\+json">\n?)(.*?)(\n?</script>)',fb,s,flags=re.S)
    if s!=o: wr(f,s)
print('G towns added',G,'H schema address',A,'footer address',FN)
# I sitemap
s=rd('sitemap.xml')
for slug in ('workshop','paint-correction-detailing-fort-myers'):
    if f'/{slug}<' not in s:
        s=s.replace('</urlset>',f'  <url><loc>https://fixingfortmyers.com/{slug}</loc><lastmod>2026-10-01</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>\n</urlset>')
wr('sitemap.xml',s)
# J Bay One
f='_website-intake/public-chat.mjs'
rep1(f,"exhaust, diesel, car audio, performance and hot rods.","exhaust, diesel, car audio, performance, hot rods and restoration, engine and transmission rebuilds and replacements, walnut blasting, welding, paint work, buffing, paint correction and detailing. Workshop details: fixingfortmyers.com/workshop.",False)
# K link style
s=rd('site-updates.css')
if '/workshop"]' not in s:
    s+='\n/* Inline text links to the workshop and paint pages */\n.section-sub a[href^="/workshop"],.faq-item a[href^="/workshop"],.faq-item a[href^="/paint"],.mobile-image-caption a,.proof-hero__lead a,.service-hero__aside .section-sub a{color:var(--color-accent,#3ABEFF);text-decoration:underline;text-underline-offset:3px}\n'
    wr('site-updates.css',s)
# L version constants
for f,a in (('tools/version-assets.mjs',"versions[0]||'20260927-bay-one-v3'"),('tools/check-live.mjs',"version='20260929-clean-flow'")):
    rep1(f,a,a.replace('20260927-bay-one-v3','20261001-workshop').replace('20260929-clean-flow','20261001-workshop'),False)
print('WARN',warn)
