import json, re, html
SP='/tmp/claude-0/-home-user-fixingfortmyers-site/5fe47957-1e7e-550d-ac5c-ff2143e542a2/scratchpad/'
src=open('engine-rebuild-vs-replacement-fort-myers.html').read()
i_ld=src.index('  <script type="application/ld+json">')
head_top=src[:i_ld].rstrip('\n')
ld_main=json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>',src,re.S).group(1))
head_tail=src[src.rindex('</script>',0,src.index('</head>'))+len('</script>'):src.index('</head>')]
nav=src[src.index('<body>'):src.index('</nav>')+len('</nav>')]
box=src[src.index('<div class="service-cta-box">'):]
cta_details=box[len('<div class="service-cta-box">'):box.index('<a href="/?service=')].strip('\n')
footer=src[src.index('  <!-- ============ FOOTER'):]
AREA="Fort Myers, Cape Coral, Lehigh Acres, North Fort Myers, Tice, Estero, Bonita Springs, Alva, Buckingham, Fort Myers Beach, Sanibel and Pine Island"
STYLE='''<style>
.ws-figure{margin:0}.ws-figure img,.ws-cap img{display:block;width:100%;height:auto;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:#12161d}
.ws-figure figcaption{margin-top:.6rem;font-size:.95rem;opacity:.8}
.ws-capabilities{display:grid;gap:2.5rem;margin-top:2rem}
.ws-cap{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:2rem;align-items:center}
.ws-cap:nth-child(even){grid-template-columns:minmax(0,7fr) minmax(0,5fr)}.ws-cap:nth-child(even) img{order:2}
.ws-cap h3{margin:0 0 .6rem}.ws-cap p{margin:0 0 .8rem;line-height:1.6}
.ws-cap.no-photo{grid-template-columns:1fr;max-width:62ch}
.ws-gallery.ws-gallery--2{grid-template-columns:repeat(2,minmax(0,1fr))}
main [hidden]{display:none!important}
.ws-pair{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-top:2rem}
.ws-gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.25rem;margin-top:2rem}
.ws-cap a,.ws-figure a,.service-hero__aside a,.faq-item a,.service-quote a{color:var(--color-accent);text-decoration:underline;text-underline-offset:3px}
@media (max-width:800px){.ws-cap,.ws-cap:nth-child(even){grid-template-columns:1fr}.ws-cap:nth-child(even) img{order:0}.ws-pair{grid-template-columns:1fr}.ws-gallery{grid-template-columns:1fr 1fr}}
@media (max-width:640px){.service-hero__content{grid-template-columns:minmax(0,1fr)}.service-hero__content>*,.service-hero__stat{min-width:0}.service-hero__stat strong{font-size:1.2rem;overflow-wrap:anywhere}}
@media (max-width:480px){.ws-gallery,.ws-gallery.ws-gallery--2{grid-template-columns:1fr}}
</style>'''

def faq_html(faqs):
    out=[]
    for i,(q,a) in enumerate(faqs):
        out.append(('' if i==0 else '')+f'''          <div class="faq-item reveal">
            <h3>{html.escape(q,quote=False)}</h3>
            <p>{a}</p>
          </div>''')
    return '\n'.join(out)

def build(slug,title,h1name,desc,body_file,faqs,service_key,svc_type,hero_img,hero_small=None,is_service=True):
    url=f'https://fixingfortmyers.com/{slug}'
    top=head_top
    top=re.sub(r'<title>.*?</title>',f'<title>{title}</title>',top)
    for k in ('og:title','twitter:title'):
        top=re.sub(rf'(<meta (?:property|name)="{k}" content=")[^"]*',lambda m:m.group(1)+title,top)
    for k in ('description','og:description','twitter:description'):
        top=re.sub(rf'(<meta (?:property|name)="{k}" content=")[^"]*',lambda m:m.group(1)+desc,top)
    top=top.replace('https://fixingfortmyers.com/engine-rebuild-vs-replacement-fort-myers',url)
    pre=f'  <link rel="preload" as="image" href="./assets/{hero_img}" fetchpriority="high">'
    top=re.sub(r'(\s*<link rel="preload" as="image"[^\n]*)+',"\n"+pre,top,count=1)
    g=json.loads(json.dumps(ld_main))
    graph=g['@graph']
    svc=graph[1]; svc['@id']=url+'#service'; svc['name']=svc['serviceType']=svc_type; svc['description']=desc; svc['url']=url
    svc['mainEntityOfPage']={'@id':url+'#webpage'}
    wp=graph[2]; wp['@id']=url+'#webpage'; wp['url']=url; wp['name']=h1name.replace('&amp;','&'); wp['description']=desc; wp['about']={'@id':url+'#service'}
    wp['primaryImageOfPage']={'@type':'ImageObject','url':f'https://fixingfortmyers.com/assets/{hero_img}'}
    faqld={'@context':'https://schema.org','@type':'FAQPage','mainEntity':[{'@type':'Question','name':q,'acceptedAnswer':{'@type':'Answer','text':re.sub('<[^>]+>','',a)}} for q,a in faqs]}
    bc={'@context':'https://schema.org','@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'name':'Home','item':'https://fixingfortmyers.com/'},{'@type':'ListItem','position':2,'name':h1name.replace('&amp;','&'),'item':url}]}
    js=lambda o:json.dumps(o,indent=2,ensure_ascii=False)
    head=top+'\n  <script type="application/ld+json">\n'+js(g)+'\n</script>\n  <script type="application/ld+json">\n'+js(faqld)+'\n</script>\n  <script type="application/ld+json">\n'+js(bc)+'\n</script>'+head_tail+STYLE+'</head>'
    body=open(SP+body_file).read()
    body=body.replace('FAQ_ITEMS',faq_html(faqs)).replace('CTA_DETAILS',re.sub(r'(<div class="contact-detail__label">Service Area</div>\s*<div class="contact-detail__value">)[^<]*',lambda m:m.group(1)+AREA,cta_details))
    n=nav.replace('?service=engine#contact',f'?service={service_key}#contact')
    f=footer.replace('?service=engine#contact',f'?service={service_key}#contact')
    open(slug+'.html','w').write(head+'\n'+n+'\n\n'+body+'\n\n'+f)

ws_faq=[
 ("Can I just drop my car off?","Yes, by appointment. The workshop is based at Bayshore Ranch and has no walk-in counter, so call or text <a href=\"tel:+12393972048\">(239) 397-2048</a> to book a drop-off time. The drop-off details come with your booking."),
 ("What if my car won’t drive?","Tow it in at the booked drop-off time. Concierge pickup and return is also available as a paid add-on; ask when you book."),
 ("Do you rebuild engines and transmissions?","Yes. Engines and transmissions are rebuilt or replaced in the workshop. For engines, Tony tears it down and measures it first, so the rebuild-or-replace decision is based on what the parts show."),
 ("What is walnut blasting?","Walnut blasting cleans carbon deposits off the intake valves using crushed walnut shell media. It is most often needed on direct-injection engines, where fuel no longer washes over the valves and carbon builds up over time."),
 ("Do you work on diesels, hot rods and restorations?","Yes. Diesel repair, hot rod work and restoration projects are all done in the workshop."),
 ("Where is the workshop?","17686 Saddleback Loop, North Fort Myers, FL 33917, at Bayshore Ranch. You can come to the workshop or drop the car off and leave it. Call or text first so Tony knows it is coming. <a href=\"https://www.google.com/maps/search/?api=1&amp;query=17686+Saddleback+Loop%2C+North+Fort+Myers%2C+FL+33917\">Get directions</a>."),
]
build('workshop',"Tony’s Workshop | Engine, Transmission &amp; Major Repair | Perfect Timing Auto Repair LLC","Tony’s Workshop",
 "Tony’s fully equipped repair workshop at Bayshore Ranch, Fort Myers: engine and transmission rebuilds, walnut blasting, diesel, hot rods, restoration and paint correction. Drop-off by appointment.",
 'workshop_body.html',ws_faq,'engine','Engine, transmission and major repair workshop','workshop-wide.webp')

paint_faq=[
 ("Is paint correction the same as a wax?","No. Wax or sealant sits on top of the paint and fills in fine defects for a while. Paint correction machine-polishes the clear coat to remove swirls, light scratches and oxidation, so the improvement stays after the wax wears off."),
 ("Can you fix peeling clear coat?","Not with polishing. Once the clear coat is peeling or flaking, it has failed, and that area needs paint. Tony will tell you honestly which areas can be corrected and which need paint."),
 ("How long does paint correction last?","Removed defects stay removed, but the Florida sun, lovebugs and automatic car washes will add new ones over time. Protection after correction, and careful washing, make it last much longer. Ask Tony about the options for your vehicle."),
 ("Do I bring the car to you?","Yes. Send photos first, then book a time to drop the vehicle at <a href=\"/workshop\">Tony’s workshop</a>. Concierge pickup and return is available as a paid add-on."),
 ("What should I send to get a quote?","Year, make, model and colour, and a few daylight photos: the whole vehicle, then close-ups of the areas that bother you. Say whether you want paint work, correction, a detail or all three."),
]
build('paint-correction-detailing-fort-myers',"Paint Correction &amp; Detailing in Fort Myers, FL | Perfect Timing Auto Repair LLC","Paint Correction & Detailing in Fort Myers, FL",
 "Paint work, buffing, paint correction and detailing in Fort Myers. Send photos and Tony confirms what can be polished out and what needs paint. (239) 397-2048.",
 'paint_body.html',paint_faq,'maintenance','Paint Correction, Paint Work and Detailing','tony-at-work.webp')
