"""Targeted public hours update; preserves existing content and Bay One."""
from pathlib import Path
import re, json

root = Path(__file__).resolve().parents[1]
days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
disclosure = ('After-hours repairs depend on the job, location and availability; Tony confirms all dispatches. '
              'Bay One AI intake is currently offline. Call or text Tony directly.')
hours = '24/7 availability · Service by confirmed appointment'
short = '<p class="service-hours">Available 24/7<a class="hours-asterisk" href="#hours-disclaimer" aria-label="Read after-hours service details">*</a><span>Tony confirms availability and dispatch.</span></p>'
for file in root.glob('*.html'):
    if file.name.startswith('repair-guide'):
        continue  # New guide pages have their own reviewed template.
    before = file.read_text(encoding='utf-8')
    html = before
    replacements = {
        'Mon–Sat, 7AM–7PM · By appointment': hours,
        'Monday-Saturday, 7AM-7PM, by appointment.': hours + '.',
        'By-appointment scheduling built around your work week, Mon–Sat 7am–7pm': '24/7 availability, with service scheduled around your work and the job requirements',
        'By appointment, Mon–Sat 7am–7pm': hours,
        'Mobile service is by appointment, Monday through Saturday, 7am to 7pm.': 'Mobile repair is available 24/7, with dispatch and appointments confirmed by Tony. Outside 8 a.m.–8 p.m. Eastern, Bay One AI assists Tony.',
        'Mon&ndash;Sat, 7AM&ndash;7PM, by appointment.': hours + '.',
    }
    for old, new in replacements.items():
        html = html.replace(old, new)
    def update_schema(match):
        content = match.group(2)
        if 'openingHoursSpecification' not in content:
            return match.group(0)
        data = json.loads(content)
        def walk(item):
            if isinstance(item, dict):
                if 'openingHoursSpecification' in item:
                    item['openingHoursSpecification'] = {
                        '@type':'OpeningHoursSpecification','dayOfWeek':days,
                        'opens':'00:00','closes':'23:59',
                        'description':'24/7 availability. '+disclosure}
                for value in item.values(): walk(value)
            elif isinstance(item, list):
                for value in item: walk(value)
        walk(data)
        return match.group(1)+'\n'+json.dumps(data, ensure_ascii=False, indent=2)+'\n'+match.group(3)
    html = re.sub(r'(<script[^>]*type="application/ld\+json"[^>]*>)(.*?)(</script>)', update_schema, html, flags=re.S)
    if 'id="hours-disclaimer"' not in html and '</footer>' in html:
        html = html.replace('</footer>', '<p class="hours-disclaimer" id="hours-disclaimer"><strong>Available 24/7*</strong><br>* '+disclosure+'</p>\n</footer>', 1)
    if 'class="service-hero__desc"' in html and 'class="service-hours"' not in html:
        html = re.sub(r'(<p class="service-hero__desc">.*?</p>)', r'\1\n'+short, html, count=1, flags=re.S)
    if file.name == 'index.html':
        html = html.replace('Owner-led team. Tony\'s personal final check.', 'Available 24/7<a class="hours-asterisk" href="#hours-disclaimer" aria-label="Read after-hours service details">*</a> · AI-assisted after hours. Tony confirms dispatch.')
        html = html.replace('<title>Mobile Mechanic Fort Myers | Perfect Timing Auto Repair</title>', '<title>24/7 Mobile Mechanic Fort Myers | Perfect Timing Auto Repair</title>')
    html = re.sub(r'(<li><a href="(?:/)?#services">Services</a></li>)(?!<li><a href="/repair-guides")', r'\1<li><a href="/repair-guides">Repair Guides</a></li>', html)
    html = re.sub(r'(<div class="nav__mobile-menu"[^>]*>\s*<a href="(?:/)?#services">Services</a>)(?!<a href="/repair-guides")', r'\1<a href="/repair-guides">Repair Guides</a>', html)
    if html != before:
        file.write_text(html, encoding='utf-8')
        print(file.name)
