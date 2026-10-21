(() => {
  'use strict';
  // Bounded anonymous events: no persistent browser identifier or customer data.
  const metricsEndpoint = (window.PT_CONTACT_CONFIG?.endpoint || '').replace(/\/$/, '');
  const productionHost = /^(www\.)?fixingfortmyers\.com$/.test(location.hostname);
  const metricsEnabled = Boolean(metricsEndpoint && productionHost);
  const metricSources = new Set(['direct','google','bing','facebook','instagram','chatgpt','perplexity','gemini','claude','qr','other']);
  const metricSource = (() => {
    // Store only one fixed category for this tab's session. Internal navigation
    // must not turn Google/AI/referral arrivals into direct traffic.
    let source = '';
    const campaign = new URLSearchParams(location.search).get('utm_source');
    if (campaign) source = metricSources.has(campaign.toLowerCase()) ? campaign.toLowerCase() : 'other';
    try {
      const host = new URL(document.referrer).hostname.toLowerCase();
      const internal = host.replace(/^www\./, '') === location.hostname.replace(/^www\./, '');
      const domains = [['gemini.google.com','gemini'],['chatgpt.com','chatgpt'],['chat.openai.com','chatgpt'],['perplexity.ai','perplexity'],['claude.ai','claude'],['google.com','google'],['bing.com','bing'],['facebook.com','facebook'],['instagram.com','instagram']];
      if (!source && !internal) source = domains.find(([domain]) => host === domain || host.endsWith('.' + domain))?.[1] || 'other';
    } catch (_) { /* Empty or invalid referrers do not erase a known session source. */ }
    try {
      if (!source) { const saved = sessionStorage.getItem('pt-metric-source-v1'); if (metricSources.has(saved)) source = saved; }
      source ||= 'direct';
      sessionStorage.setItem('pt-metric-source-v1', source);
    } catch (_) { /* A blocked store still permits attribution on the landing page. */ }
    return source || 'direct';
  })();
  // Never export an arbitrary path, query, fragment or referrer to analytics.
  // Keep this list aligned with actual public HTML pages when adding a page.
  const analyticsPages = new Set([
    '/', '/about-perfect-timing', '/ac-repair-fort-myers', '/alternator-starter-repair-fort-myers',
    '/auto-diagnostics-fort-myers', '/auto-electrical-repair-fort-myers', '/auto-repair-cape-coral',
    '/auto-repair-fort-myers', '/auto-repair-lehigh-acres', '/auto-repair-north-fort-myers',
    '/battery-replacement-fort-myers', '/blue-smoke-burning-oil-fort-myers', '/brake-repair-fort-myers',
    '/car-audio-installation-fort-myers', '/careers', '/case-studies', '/check-engine-light-diagnosis-fort-myers',
    '/cooling-system-repair-fort-myers', '/data-privacy-policy', '/diesel-repair-fort-myers',
    '/engine-knocking-noise-fort-myers', '/engine-rebuild-vs-replacement-fort-myers', '/engine-repair-fort-myers',
    '/exhaust-emissions-repair-fort-myers', '/fort-myers-mechanic', '/fuel-system-repair-fort-myers',
    '/head-gasket-overheating-damage-fort-myers', '/hot-rod-restoration-fort-myers', '/module-programming-fort-myers',
    '/no-start-diagnosis-fort-myers', '/oil-change-fort-myers', '/paint-correction-detailing-fort-myers',
    '/vehicle-water-damage-restoration-fort-myers',
    '/owner-desk', '/owner-desk-privacy',
    '/parts', '/pre-purchase-inspection-fort-myers', '/privacy-policy', '/race-car-modifications-fort-myers',
    '/repair-guide-ac-warm-at-idle', '/repair-guide-battery-keeps-dying', '/repair-guide-car-overheating',
    '/repair-guide-car-wont-start', '/repair-guide-ecu-tcm-programming', '/repair-guide-flashing-check-engine-light',
    '/repair-guides', '/request-a-repair', '/request-received', '/sms-terms',
    '/suspension-steering-repair-fort-myers', '/transmission-repair-fort-myers',
    '/transmission-slipping-fort-myers', '/walnut-blasting-fort-myers', '/workshop'
  ]);
  const normalizedPath = location.pathname.replace(/\/$/, '').replace(/\.html$/, '') || '/';
  const publicPath = normalizedPath === '/index' ? '/' : normalizedPath;
  const metricPath = analyticsPages.has(publicPath) ? publicPath : '/other';
  // Existing receiver contract: do not expand it without the cloud schema and a
  // coordinated deployment. GA4 uses metricPath; the receiver keeps its buckets.
  const metricPage = new Set(['/','/module-programming-fort-myers','/repair-guide-ecu-tcm-programming','/parts','/parts-quote']).has(publicPath) ? publicPath : '/other';
  const recordedMetrics = new Set();
  const reportMetric = (eventName, once = true) => {
    if (!metricsEnabled || (once && recordedMetrics.has(eventName))) return;
    if (once) recordedMetrics.add(eventName);
    const eventId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
    const body = JSON.stringify({event:eventName,event_id:eventId,page:metricPage,source:metricSource});
    const deliver = () => {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 5000);
      return Promise.resolve().then(() => fetch(metricsEndpoint + '/hooks/analytics/event', {
        method:'POST',headers:{'Content-Type':'application/json'},body,credentials:'omit',referrerPolicy:'no-referrer',keepalive:true,signal:controller.signal
      })).then(response => { if (response.status >= 500) throw new Error('retry'); }).finally(() => clearTimeout(timer));
    };
    deliver().catch(() => setTimeout(() => deliver().catch(() => {}), 1500));
  };
  reportMetric('visit');
  // A real owner's GA4 measurement ID belongs in contact-config.js. Blank means
  // no Google tag/request: dataLayer is local diagnostics, not collected data.
  const GA4_ID = typeof window.PT_CONTACT_CONFIG?.ga4MeasurementId === 'string' ? window.PT_CONTACT_CONFIG.ga4MeasurementId.trim() : '';
  window.dataLayer = window.dataLayer || [];
  const validGa4Id = /^G-[A-Z0-9]{4,20}$/.test(GA4_ID);
  const gtagReady = validGa4Id && productionHost;
  let ga4Status = !productionHost ? 'preview_disabled' : !GA4_ID ? 'not_configured' : !validGa4Id ? 'invalid_id' : 'loading';
  window.PT_ANALYTICS_STATUS = Object.freeze({
    customMetrics: metricsEnabled ? 'configured_unverified' : 'disabled',
    get ga4() { return ga4Status; },
    page: metricPath, receiverPage: metricPage, source: metricSource
  });
  const safePage = {page_location: 'https://fixingfortmyers.com' + metricPath, page_referrer: '', page_title: metricPath};
  if (gtagReady) {
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA4_ID, {...safePage, send_page_view:false, allow_google_signals:false, allow_ad_personalization_signals:false});
    const tag = document.createElement('script');
    tag.async = true; tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
    tag.referrerPolicy = 'no-referrer';
    tag.addEventListener('load', () => { ga4Status = 'tag_loaded_unverified'; });
    tag.addEventListener('error', () => { ga4Status = 'tag_load_failed'; });
    document.head.append(tag);
  }
  // Conversion events carry fixed categories only: never names, phones, vehicles or symptoms.
  const trackedEvents = new Set(['page_view','phone_click','text_click','email_click','request_form_click','form_start','form_validation_error','form_submit_attempt','form_submit_success','form_submit_error','form_photo_added']);
  const trackedServices = new Set(['Diagnosis / not sure yet','A/C repair','Brakes','Electrical / no-start','Engine','Transmission','Module programming','Diesel','Oil change / maintenance','Walnut blasting / carbon cleaning','Water damage / flood vehicle','Detailing / paint correction','Other','Engine / transmission','Diesel service','Maintenance / other repair']);
  const trackedFields = new Set(['name','phone','vehicle','details','city','service','starts','stranded','locationChoice','carAddress','callbackTime','smsConsent']);
  const track = (eventName, params = {}) => {
    if (!trackedEvents.has(eventName)) return;
    const detail = {...safePage, page_path: metricPath, lead_source: metricSource};
    if (['form','nav','footer','sticky_bar','page'].includes(params.placement)) detail.placement = params.placement;
    if ('service' in params) detail.service = trackedServices.has(params.service) ? params.service : 'not_given';
    if ('field' in params) detail.field = trackedFields.has(params.field) ? params.field : 'unknown';
    if (['network'].includes(params.reason) || /^http_[1-5][0-9]{2}$/.test(params.reason)) detail.reason = params.reason;
    if (Number.isInteger(params.attempt) && params.attempt >= 1 && params.attempt <= 3) detail.attempt = params.attempt;
    if (Number.isInteger(params.count) && params.count >= 0 && params.count <= 6) detail.count = params.count;
    if (['dropoff','address','device','not_given'].includes(params.car_location)) detail.car_location = params.car_location;
    for (const key of ['has_photos','text_consent']) if (typeof params[key] === 'boolean') detail[key] = params[key];
    try {
      if (gtagReady) window.gtag('event', eventName, detail);
      else window.dataLayer.push({event: eventName, ...detail});
    } catch (_) { /* Analytics must never block contacting the shop. */ }
  };
  window.PT_TRACK = track;
  track('page_view');
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    const placement = link.closest('#contact, .request-done') ? 'form' : link.closest('nav, .nav') ? 'nav' : link.closest('footer') ? 'footer' : link.closest('.mobile-contact-bar') ? 'sticky_bar' : 'page';
    if (/^tel:/i.test(href)) { reportMetric('call_clicked'); track('phone_click', {placement}); }
    else if (/^sms:/i.test(href)) { reportMetric('text_clicked'); track('text_click', {placement}); }
    else if (/^mailto:/i.test(href)) { reportMetric('email_clicked'); track('email_click', {placement}); }
    else {
      try {
        const url = new URL(href, location.href);
        if (url.origin === location.origin && /^\/parts(?:-quote)?(?:\.html)?\/?$/.test(url.pathname)) reportMetric('parts_quote_started');
        if (url.origin === location.origin && (url.hash === '#contact' || /^\/request-a-repair(?:\.html)?\/?$/.test(url.pathname))) track('request_form_click', {placement});
      }
      catch (_) { /* Invalid links cannot produce analytics data. */ }
    }
  });
  const byId = id => document.getElementById(id);
  // Keep the existing lead-channel contract; only known campaign codes enter message drafts.
  const validChannel = value => typeof value === 'string' && /^[a-z0-9_-]{2,30}$/.test(value);
  const draftChannels = new Set(['google','nextdoor','referral','trade_referral','gbp_no_start','gbp_walnut','gbp_major','nextdoor_no_start','nextdoor_walnut','nextdoor_major']);
  const landedChannel = (new URLSearchParams(location.search).get('utm_source') || '').toLowerCase();
  let leadChannel = validChannel(landedChannel) ? landedChannel : '';
  try {
    if (leadChannel) sessionStorage.setItem('pt-lead-channel', leadChannel);
    else {
      const saved = sessionStorage.getItem('pt-lead-channel');
      if (validChannel(saved)) leadChannel = saved;
    }
  } catch (_) { /* A blocked session store still permits attribution from this page's URL. */ }
  window.PT_LEAD_CHANNEL = leadChannel;
  const draftChannel = draftChannels.has(leadChannel) ? leadChannel : '';
  // Service attribution is a fixed category, never arbitrary query text.
  const services = Object.freeze({diagnostics:'Diagnosis / not sure yet',ac:'A/C repair',brakes:'Brakes',electrical:'Electrical / no-start','no-start':'Electrical / no-start',battery:'Electrical / no-start',cooling:'Engine',engine:'Engine',transmission:'Transmission',programming:'Module programming',diesel:'Diesel',maintenance:'Oil change / maintenance',walnut:'Walnut blasting / carbon cleaning','water-damage':'Water damage / flood vehicle',detailing:'Detailing / paint correction'});
  const servicePages = {'auto-diagnostics-fort-myers':'diagnostics','check-engine-light-diagnosis-fort-myers':'diagnostics','ac-repair-fort-myers':'ac','brake-repair-fort-myers':'brakes','auto-electrical-repair-fort-myers':'electrical','no-start-diagnosis-fort-myers':'no-start','battery-replacement-fort-myers':'battery','engine-repair-fort-myers':'engine','transmission-repair-fort-myers':'engine','module-programming-fort-myers':'programming','diesel-repair-fort-myers':'diesel','oil-change-fort-myers':'maintenance','repair-guide-car-wont-start':'no-start','repair-guide-ac-warm-at-idle':'ac','repair-guide-battery-keeps-dying':'battery'};
  Object.assign(servicePages,{'repair-guide-ecu-tcm-programming':'programming','cooling-system-repair-fort-myers':'cooling','repair-guide-car-overheating':'cooling','repair-guide-flashing-check-engine-light':'diagnostics','walnut-blasting-fort-myers':'walnut','vehicle-water-damage-restoration-fort-myers':'water-damage','paint-correction-detailing-fort-myers':'detailing','engine-rebuild-vs-replacement-fort-myers':'engine','engine-knocking-noise-fort-myers':'engine','transmission-repair-fort-myers':'transmission','transmission-slipping-fort-myers':'transmission'});
  const validService = key => typeof key === 'string' && Object.hasOwn(services,key);
  const requestedService = new URLSearchParams(location.search).get('service');
  const pageService = servicePages[location.pathname.replace(/^\//,'').replace(/\.html$/,'')];
  const serviceKey = validService(requestedService) ? requestedService : validService(pageService) ? pageService : '';
  // Carry a known guide/service page into the customer's editable text draft.
  // Never copy arbitrary URLs, search queries, referrers or ad parameters.
  const sourcePages = new Set(['repair-guides', ...Object.keys(servicePages)]);
  const currentSource = location.pathname.replace(/^\//,'').replace(/\.html$/,'');
  let sourcePage = sourcePages.has(currentSource) ? currentSource : '';
  try {
    if (sourcePage) sessionStorage.setItem('pt-repair-source',sourcePage);
    else if (['/', '/index.html', '/request-a-repair', '/request-a-repair.html'].includes(location.pathname)) {
      const saved = sessionStorage.getItem('pt-repair-source');
      if (sourcePages.has(saved)) sourcePage = saved;
    }
  } catch (_) { /* A blocked session store does not block contacting Tony. */ }
  window.PT_REPAIR_CONTEXT = {service:serviceKey,applyService(key){const field=byId('request-service');if(field&&validService(key)&&field.selectedIndex===0)field.value=services[key];}};
  const toggle = byId('mobileToggle');
  const menu = byId('mobileMenu');
  if (toggle && menu) {
    const close = () => { menu.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open menu'); };
    toggle.addEventListener('click', () => { const open = menu.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); });
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('open')) { close(); toggle.focus(); } });
  }
  const nav = byId('nav');
  if (nav) { const update = () => nav.classList.toggle('nav--scrolled', window.scrollY > 60); update(); window.addEventListener('scroll', update, { passive: true }); }
  const quickCall = document.querySelector('.mobile-contact-bar[aria-label="Quick contact"] a[href="tel:+12393972048"], .mobile-contact-bar[aria-label^="Engine or transmission"] a[href="tel:+12393972048"]');
  if (quickCall) { quickCall.textContent = 'Call'; quickCall.setAttribute('aria-label', 'Call Perfect Timing Auto Repair at (239) 397-2048'); }
  const brandVideo = document.querySelector('.bang-video-wrap video');
  if (brandVideo) {
    brandVideo.removeAttribute('autoplay');
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
      new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) brandVideo.play().catch(() => {}); else brandVideo.pause(); }), { threshold: .25 }).observe(brandVideo);
    } else { brandVideo.pause(); brandVideo.controls = true; }
  }
  byId('partsForm')?.addEventListener('input', () => reportMetric('parts_quote_started'), {once:true});
  const form = byId('bookingForm');
  if (!form) return;
  window.PT_REPAIR_CONTEXT.applyService(serviceKey);
  const problemField = byId('request-details');
  if (problemField) problemField.addEventListener('input',()=>problemField.setCustomValidity(problemField.maxLength>0&&problemField.value.length>problemField.maxLength?'Your notes are preserved. Please shorten them to fit the form before sending.':''));
  for (const id of ['request-vehicle','request-city','request-starts','request-stranded']) {
    const field = byId(id);
    if (field) field.addEventListener('input',()=>{field.dataset.userEdited='true';});
  }
  // Any hour is eligible for a tentative request, not an automatic reservation.
  // A receipt alone cannot establish that Google Calendar accepted an event.
  const visitBox = byId('request-appointment'), visitDay = byId('request-visit-date'), visitTime = byId('request-visit-time');
  const pencilAck = byId('request-pencil-ack');
  const paymentButton = byId('request-payment-link'), paymentIntent = byId('request-payment-intent');
  if (visitDay) {
    const easternDay = date => {
      const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
      const value = part => parts.find(item => item.type === part)?.value || '';
      return value('year') + '-' + value('month') + '-' + value('day');
    };
    const today = easternDay(new Date());
    visitDay.min = today;
    const updatePreference = () => {
      if (visitTime) visitTime.disabled = !visitDay.value;
      if (pencilAck) {
        const needsAcknowledgement = Boolean(visitDay.value && visitTime?.value);
        pencilAck.required = needsAcknowledgement;
        pencilAck.checked = false; // A changed time needs a fresh acknowledgement.
        pencilAck.closest('label').hidden = !needsAcknowledgement;
        if (needsAcknowledgement && visitBox) visitBox.open = true;
      }
    };
    updatePreference();
    for (const input of [visitDay,visitTime]) {
      input?.addEventListener('change', updatePreference);
      input?.addEventListener('input', updatePreference);
    }
    if (new URLSearchParams(location.search).get('schedule') === '1' && visitBox) visitBox.open = true;
  }
  // The homepage is a compact preference picker. It mirrors the same canonical
  // preferredDate/preferredTime fields already used by the scheduled-service form.
  // Never create a booking or add a new receiver contract here.
  const heroDate = byId('hero-appointment-date');
  const heroTime = byId('hero-appointment-time');
  const heroContinue = byId('hero-appointment-continue');
  if (heroDate && heroTime && heroContinue && visitDay && visitTime) {
    const error = byId('hero-appointment-error');
    const instructions = byId('request-instructions');
    heroDate.min = visitDay.min;
    let copiedFromHero = false;
    let updatingForm = false;
    const nowEastern = () => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone:'America/New_York',year:'numeric',month:'2-digit',
        day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
      }).formatToParts(new Date());
      const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
      return {day: fields.year + '-' + fields.month + '-' + fields.day, time:fields.hour + ':' + fields.minute};
    };
    const errorText = message => { if (error) { error.textContent = message; error.hidden = !message; } };
    const summary = () => {
      let el = byId('request-appointment-summary');
      if (!copiedFromHero || !visitDay.value || !visitTime.value) { el?.remove(); return; }
      if (!el && instructions) {
        el = document.createElement('p');
        el.id = 'request-appointment-summary';
        el.className = 'request-appointment-summary';
        instructions.after(el);
      }
      if (el) {
        const [hour, minute] = visitTime.value.split(':').map(Number);
        const label = (hour % 12 || 12) + ':' + String(minute).padStart(2,'0') + (hour < 12 ? ' AM' : ' PM');
        el.textContent = 'Requested time: ' + visitDay.value + ' at ' + label +
          ' Eastern. Penciled in only after calendar placement; never confirmed until Tony verbally confirms by phone. Complete the form to send your request.';
      }
    };
    const validate = () => {
      const now = nowEastern();
      const date = heroDate.value, time = heroTime.value;
      if (!date) return {message:'Choose a preferred date.',field:heroDate};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < now.day || date < visitDay.min)
        return {message:'Choose a future date.',field:heroDate};
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
        return {message:'Choose a preferred time at any hour (24/7).',field:heroTime};
      if (date === now.day && time <= now.time)
        return {message:'Choose a future date or time in Fort Myers.',field:heroTime};
      return null;
    };
    const clearFromHero = () => {
      if (!copiedFromHero) return;
      updatingForm = true;
      visitDay.value = '';
      visitDay.dispatchEvent(new Event('change',{bubbles:true}));
      visitTime.value = '';
      visitTime.dispatchEvent(new Event('change',{bubbles:true}));
      updatingForm = false;
      copiedFromHero = false;
      summary();
    };
    const copyToForm = () => {
      const invalid = validate();
      if (invalid) { clearFromHero(); return invalid; }
      updatingForm = true;
      visitDay.value = heroDate.value;
      visitDay.dispatchEvent(new Event('change',{bubbles:true}));
      visitTime.value = heroTime.value;
      visitTime.dispatchEvent(new Event('change',{bubbles:true}));
      updatingForm = false;
      copiedFromHero = true;
      summary();
      return null;
    };
    for (const input of [heroDate,heroTime]) {
      input.addEventListener('change', () => { errorText(''); copyToForm(); });
      input.addEventListener('input', () => { errorText(''); copyToForm(); });
    }
    for (const field of [visitDay,visitTime]) {
      const syncHero = () => {
        if (updatingForm) return;
        heroDate.value = visitDay.value;
        heroTime.value = visitTime.value;
        copiedFromHero = Boolean(visitDay.value && visitTime.value);
        summary();
      };
      field.addEventListener('change',syncHero);
      field.addEventListener('input',syncHero);
    }
    heroContinue.addEventListener('click', event => {
      const invalid = copyToForm();
      if (!invalid) return; // Existing repair-dialog.js opens the single repair form.
      event.preventDefault();
      errorText(invalid.message);
      invalid.field.focus();
    });
  }
  const params = new URLSearchParams(location.search);
  const oilPrepayOffer = params.get('offer') === 'liquimoly-labor50' && params.get('service') === 'maintenance';
  const serviceSelector = byId('request-service'), oilOfferNotice = byId('request-oil-offer');
  const syncOilOffer = () => {
    if (oilOfferNotice) oilOfferNotice.hidden = !(oilPrepayOffer && serviceSelector?.value === 'Oil change / maintenance');
  };
  syncOilOffer();
  serviceSelector?.addEventListener('change', syncOilOffer);
  const requestMore = byId('request-options');
  if (params.get('service') === 'detailing' && requestMore) requestMore.open = true;
  const suggestedDescriptions = {
    maintenance: 'Please contact me about a scheduled LIQUI MOLY oil and filter service. Confirm the manufacturer-required oil specification and filter for my car.',
    detailing: 'I would like a quote for professional interior/exterior car detailing or paint correction.',
    walnut: 'I would like an assessment for intake-valve carbon cleaning / walnut blasting.'
  };
  if (params.get('schedule') === '1' && problemField && !problemField.value && Object.hasOwn(suggestedDescriptions, serviceKey)) {
    problemField.value = suggestedDescriptions[serviceKey];
  }
  if (oilPrepayOffer) {
    if (visitBox) visitBox.open = true;
    if (paymentIntent) paymentIntent.value = 'yes';
    if (paymentButton) {
      paymentButton.setAttribute('aria-pressed', 'true');
      paymentButton.textContent = 'Remove parts-payment request';
    }
    const paymentMessage = byId('request-payment-message');
    if (paymentMessage) paymentMessage.textContent =
      'LIQUI MOLY prepay offer selected. Submit your request to receive a shop-approved oil quote and secure payment link. Only oil-change labor is discounted by 50% after eligible oil prepayment; no payment is taken here.';
  }
  paymentButton?.addEventListener('click', () => {
    if (!paymentIntent) return;
    const requested = paymentIntent.value !== 'yes';
    paymentIntent.value = requested ? 'yes' : 'no';
    paymentButton.setAttribute('aria-pressed', String(requested));
    paymentButton.textContent = requested ? 'Remove parts-payment request' : 'Ask for a parts-payment link';
    const feedback = byId('request-payment-message');
    if (feedback) feedback.textContent = requested
      ? 'Parts-payment link requested. Submit the form. The shop will first confirm your parts and the itemized amount; no payment is taken now.'
      : 'No card details or payment on this form. After checking fitment and your quote, the shop can send a secure itemized payment link.';
    paymentIntent.dispatchEvent(new Event('input', {bubbles:true}));
  });
  const configuredEndpoint = (window.PT_CONTACT_CONFIG?.endpoint || '').replace(/\/$/, '');
  let endpoint = configuredEndpoint;
  const status = byId('request-status');
  const submit = byId('request-submit');
  const backup = byId('request-backup');
  const preview = byId('request-preview');
  const textDraft = byId('request-text');
  const phoneField = byId('request-phone');
  const cleanPhone = value => value.replace(/[^\d+()\s.-]/g, '').trim();
  const validPhone = value => /^\+?[\d\s().-]+$/.test(value) && /^\d{10,15}$/.test(value.replace(/\D/g, ''));
  const locationChoice = byId('request-location-choice');
  const carAddress = byId('request-car-address');
  const locationButton = byId('request-use-location');
  const locationStatus = byId('request-location-status');
  let deviceLocation = null, locationAttempt = 0;
  const updateCarLocation = () => {
    if (!locationChoice) return;
    const atLocation = locationChoice.value === 'location';
    byId('request-car-location').hidden = !atLocation;
    carAddress.disabled = !atLocation;
    carAddress.required = atLocation;
    const dropoff = locationChoice.value === 'dropoff';
    byId('request-dropoff').hidden = !dropoff;
    byId('request-dropoff-time').disabled = !dropoff;
  };
  locationChoice?.addEventListener('change', () => {
    locationAttempt++;
    deviceLocation = null;
    if (carAddress.value.startsWith('Current location: ')) carAddress.value = '';
    locationStatus.textContent = '';
    locationButton.disabled = false;
    locationButton.textContent = 'Use current location';
    updateCarLocation();
  });
  carAddress?.addEventListener('input', () => {
    locationAttempt++;
    deviceLocation = null;
    locationStatus.textContent = '';
    locationButton.disabled = false;
    locationButton.textContent = 'Use current location';
    carAddress.setCustomValidity('');
  });
  locationButton?.addEventListener('click', () => {
    if (locationChoice.value !== 'location') return;
    if (!navigator.geolocation) {
      locationStatus.textContent = 'Current location is unavailable. Please type the car’s address.';
      carAddress.focus();
      return;
    }
    const attempt = ++locationAttempt;
    locationButton.disabled = true;
    locationButton.textContent = 'Finding location…';
    locationStatus.textContent = 'Allow location access when your browser asks, or type the car’s address.';
    const finish = () => { locationButton.disabled = false; locationButton.textContent = 'Use current location'; };
    const fail = () => {
      if (attempt !== locationAttempt) return;
      finish();
      locationStatus.textContent = 'Could not get your location. Please type the car’s address instead.';
      carAddress.focus();
    };
    try {
      navigator.geolocation.getCurrentPosition(position => {
        if (attempt !== locationAttempt || locationChoice.value !== 'location') return;
        const {latitude, longitude, accuracy} = position.coords;
        if (![latitude,longitude,accuracy].every(Number.isFinite) || Math.abs(latitude)>90 || Math.abs(longitude)>180 || accuracy<0 || !Number.isFinite(position.timestamp)) { fail(); return; }
        deviceLocation = {type:'device',latitude,longitude,accuracyMeters:accuracy,capturedAt:new Date(position.timestamp).toISOString(),carAtDevice:true};
        carAddress.value = `Current location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        carAddress.setCustomValidity('');
        finish();
        locationStatus.textContent = `Location added (within about ${Math.max(1,Math.round(accuracy))} metres). Check that your car is here before sending.`;
      }, fail, {enableHighAccuracy:true,timeout:15000,maximumAge:0});
    } catch (_) { fail(); }
  });
  updateCarLocation();
  const cityField = byId('request-city');
  const senderLocationButton = byId('request-use-my-location');
  const senderLocationStatus = byId('request-sender-location-status');
  const latitudeField = byId('request-latitude');
  const longitudeField = byId('request-longitude');
  const mapsLinkField = byId('request-maps-link');
  let senderLocationAttempt = 0, senderMetadata = null;
  const removeSenderPin = byId('request-remove-my-location');
  const clearSenderPin = () => {
    const hadPin = Boolean(senderMetadata || latitudeField?.value || longitudeField?.value || mapsLinkField?.value);
    senderMetadata = null;
    if (removeSenderPin) removeSenderPin.hidden = true;
    if (latitudeField) latitudeField.value = '';
    if (longitudeField) longitudeField.value = '';
    if (mapsLinkField) mapsLinkField.value = '';
    if (hadPin) senderPinChanged();
  };
  removeSenderPin?.addEventListener('click', () => {
    ++senderLocationAttempt; clearSenderPin();
    senderLocationButton.disabled = false; senderLocationButton.textContent = 'Use my location';
    senderLocationStatus.textContent = 'Map pin removed from future requests and drafts. Requests already sent are unchanged.';
  });
  senderLocationButton?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      if (senderLocationStatus) senderLocationStatus.textContent = 'Location is unavailable in this browser. Enter your city or ZIP instead.';
      cityField?.focus();
      return;
    }
    const attempt = ++senderLocationAttempt;
    senderLocationButton.disabled = true;
    if (removeSenderPin) removeSenderPin.hidden = false;
    senderLocationButton.textContent = 'Finding location…';
    if (senderLocationStatus) senderLocationStatus.textContent = 'Allow location access when your browser asks, or type your city or ZIP.';
    const finish = () => { senderLocationButton.disabled = false; senderLocationButton.textContent = 'Use my location'; };
    const fail = () => {
      if (attempt !== senderLocationAttempt) return;
      finish();
      clearSenderPin();
      if (senderLocationStatus) senderLocationStatus.textContent = 'Could not get your location. Your city or ZIP still works.';
      cityField?.focus();
    };
    try {
      navigator.geolocation.getCurrentPosition(position => {
        if (attempt !== senderLocationAttempt) return;
        const {latitude, longitude, accuracy} = position.coords;
        if (![latitude,longitude,accuracy].every(Number.isFinite) || Math.abs(latitude)>90 || Math.abs(longitude)>180 || accuracy<0 || !Number.isFinite(position.timestamp)) { fail(); return; }
        const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(latitude + ',' + longitude)}`;
        latitudeField.value = String(latitude);
        longitudeField.value = String(longitude);
        mapsLinkField.value = mapsLink;
        senderMetadata = {senderAccuracyMeters:accuracy,senderCapturedAt:new Date(position.timestamp).toISOString()};
        senderPinChanged();
        finish();
        if (senderLocationStatus) senderLocationStatus.textContent = `Map pin added (within about ${Math.max(1,Math.round(accuracy))} metres).`;
      }, fail, {enableHighAccuracy:true,timeout:15000,maximumAge:0});
    } catch (_) { fail(); }
  });
  const applyMode = () => {
  phoneField.required = Boolean(endpoint);
  byId('request-phone-label').textContent = endpoint ? 'Best number' : 'Callback number, if different (optional)';
  byId('request-sms-consent').closest('.request-consent').hidden = !endpoint;
  byId('request-direct-consent').hidden = Boolean(endpoint);
  const media = byId('request-media'); if (media) media.closest('label').hidden = !(endpoint && mediaReady);
  const voice = document.querySelector('.request-voice'); if (voice) voice.hidden = !endpoint;
  const heading = byId('request-heading'); if (heading) heading.textContent = endpoint ? 'How can we help with your car?' : 'Prepare a repair message';
  if (!sending && !sentRequestId) submit.textContent = endpoint ? 'Request Repair' : 'Prepare text to the shop';
  // Preserve the current page's guidance while online.
  if (!endpoint) byId('request-instructions').textContent = 'Online requests are unavailable right now. Fill in what you know to prepare a text or email, then send it yourself. Nothing is sent from this page.';
  };
  let mediaReady = false;
  // sms:+number?&body= opens a prefilled message on both iOS and Android.
  // Copy and email stay available when a device has no texting app.
  const smsHref = body => `sms:+12393972048?&body=${encodeURIComponent(body)}`;
  const refreshDraftLinks = () => {
    if (textDraft) textDraft.href = smsHref(preview.value);
    byId('request-email').href = `mailto:fixingfortmyers@gmail.com?subject=${encodeURIComponent('Repair inquiry for Perfect Timing Auto Repair')}&body=${encodeURIComponent(preview.value)}`;
  };
  preview.addEventListener('input',refreshDraftLinks);
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let requestKey = uid();
  let sentRequestId = '';
  let sending = false;
  let requestPayload = null, voicePayload = null;
  // Stored as consent evidence, so it must be the exact wording shown beside the checkbox in index.html.
  const consentDisclosure = 'Yes, I agree to receive text messages from Perfect Timing Auto Repair LLC at the number provided about my inquiry, estimates, scheduling, and service updates. Optional; consent is not a condition of purchase. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.';
  const readRequest = () => {
    const data = new FormData(form);
    const consent = byId('request-sms-consent').checked;
    const city = String(data.get('city') || '').trim();
    const starts = ['yes','no'].includes(data.get('starts')) ? data.get('starts') : 'unknown';
    const stranded = ['yes','no'].includes(data.get('stranded')) ? data.get('stranded') : 'unknown';
    const symptoms = String(data.get('details') || '').trim();
    const enteredVin = String(data.get('vin') || '').trim().toUpperCase().slice(0,32);
    const originalTiming = String(data.get('timing') || '').trim();
    const requestedDay = String(data.get('preferredDate') || '');
    const requestedTime = String(data.get('preferredTime') || '');
    const dayOk = visitDay && /^\d{4}-\d{2}-\d{2}$/.test(requestedDay) && requestedDay >= visitDay.min;
    const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(requestedTime);
    const acknowledged = Boolean(dayOk && timeOk && pencilAck?.checked);
    const preferredVisit = dayOk
      ? 'Preferred appointment: ' + requestedDay + (timeOk ? ' at ' + requestedTime : ' (flexible time)') +
        ' America/New_York; PENCILED-IN REQUEST ONLY; NOT CONFIRMED until Tony verbally confirms by phone'
      : '';
    const callbackTime = preferredVisit || originalTiming;
    const pencilAcknowledgedAt = acknowledged ? new Date().toISOString() : '';
    const wantsPartsLink = data.get('paymentIntent') === 'yes';
    const offerRequested = oilPrepayOffer && data.get('service') === 'Oil change / maintenance';
    const latitude = Number(data.get('latitude'));
    const longitude = Number(data.get('longitude'));
    const mapsLink = String(data.get('mapsLink') || '').trim();
    const senderPin = Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
      && mapsLink.startsWith('https://www.google.com/maps/')
      ? {latitude, longitude, mapsLink}
      : null;
    if (deviceLocation && carAddress.value !== `Current location: ${deviceLocation.latitude.toFixed(6)}, ${deviceLocation.longitude.toFixed(6)}`) deviceLocation = null;
    const choice = locationChoice?.value || '';
    const carLocation = choice === 'dropoff'
      ? {type:'dropoff',preferredTime:String(data.get('dropoffTime') || '').trim()}
      : choice === 'location' ? deviceLocation || {type:'address',address:String(data.get('carAddress') || '').trim()} : null;
    const carLocationText = !carLocation ? 'Car location: not given yet; ask on the callback.' : carLocation.type === 'dropoff'
      ? `Car location: Shop drop-off requested${carLocation.preferredTime ? '; preferred time: ' + carLocation.preferredTime : ''}. Shop to confirm.`
      : carLocation.type === 'device'
        ? `Car location: Current device location (${carLocation.latitude.toFixed(6)}, ${carLocation.longitude.toFixed(6)}; accuracy about ${Math.max(1,Math.round(carLocation.accuracyMeters))} metres)\nMap: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(carLocation.latitude + ',' + carLocation.longitude)}`
        : `Car location: ${carLocation.address}\nMap: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(carLocation.address)}`;
    const senderPinText = senderPin
      ? `Sender map pin: ${senderPin.latitude.toFixed(6)}, ${senderPin.longitude.toFixed(6)}\nSender map: ${senderPin.mapsLink}`
      : '';
    // Keep these details useful to the existing receiver during a staged rollout.
    // Fixed categories only: where the visitor came from and the last service page viewed.
    const pencilContext = acknowledged
      ? 'Customer checked the penciled-in appointment disclosure at ' + pencilAcknowledgedAt +
        '; Tony must verbally confirm by phone before the customer arrives.'
      : '';
    const attribution = `Found via: ${draftChannel || metricSource}${sourcePage ? '; last page viewed: /' + sourcePage : ''}`;
    const context = [carLocationText, enteredVin ? `Customer-entered VIN (unverified): ${enteredVin}` : '', city ? `City / ZIP: ${city}` : '', senderPinText, `Does it drive: ${starts}`, `Stranded: ${stranded}`, callbackTime ? `Preferred timing: ${callbackTime}` : '', (offerRequested ? 'Offer requested: LIQUI MOLY prepay labor50. 50% discount applies to oil-change labor ONLY once correct-spec LIQUI MOLY oil is purchased and paid for in advance; oil/filter/taxes/other repairs remain full quoted price. Shop must confirm fitment, invoice, payment and appointment; no payment taken here.' : ''), (wantsPartsLink ? 'Customer requests a secure parts payment link after quote/fitment approval. No payment collected online.' : ''), pencilContext, attribution].filter(Boolean).join('\n');
    // Optional email: sent only when it looks like a real address (the browser also blocks an invalid one on submit).
    const email = String(data.get('email') || '').trim().slice(0, 254);
    const emailOk = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
    return { name: String(data.get('name') || '').trim(), ...(emailOk ? {email} : {}), phone: String(data.get('phone') || '').replace(/[^\d+()\s.-]/g, '').trim(), ...(emailOk ? {email} : {}), ...(window.PT_LEAD_CHANNEL ? {channel: window.PT_LEAD_CHANNEL} : {}), vehicle: String(data.get('vehicle') || '').trim() || 'Not provided; see request details', service: String(data.get('service') || ''), details: symptoms ? `${symptoms}\n\n${context}` : '', ...(carLocation ? {carLocation} : {}), city: city || 'Not provided', ...(senderPin ? {latitude: senderPin.latitude, longitude: senderPin.longitude, mapsLink: senderPin.mapsLink, ...senderMetadata} : {}), starts, stranded, callbackTime, preferredDate:dayOk?requestedDay:'', preferredTime:dayOk&&timeOk?requestedTime:'', appointmentPencilAcknowledged:acknowledged, appointmentPencilAcknowledgedAt:pencilAcknowledgedAt, appointmentPencilDisclosureVersion:acknowledged?'2026-10-16-v1':'', source:'form', locationContract:'sender-v1', website: String(data.get('website') || ''), smsConsent: consent, smsConsentTimestamp: consent ? new Date().toISOString() : '', smsConsentVersion: '2026-09-06-v1', smsConsentSource: 'website-repair-request', smsConsentPage: location.origin + location.pathname, smsConsentDisclosure: consentDisclosure };
  };
  const makeBackup = data => {
    const callback = data.phone || 'Please reply to this text';
    const consent = !endpoint ? 'Please reply about this repair inquiry.' : data.smsConsent ? `Text-message consent: Yes\n${consentDisclosure}` : 'Text-message consent: No; please call';
    const message = `Repair inquiry for Perfect Timing Auto Repair\n\nName: ${data.name}\nCallback: ${callback}\nVehicle: ${data.vehicle}\nService: ${data.service}\n\n${data.details}\n\n${consent}${draftChannel ? '\nWebsite source: ' + draftChannel : ''}\nWebsite page context: /${sourcePage}${sourcePage ? ' (last guide or service viewed)' : ''}`;
    preview.value = message;
    refreshDraftLinks();
    backup.hidden = false;
  };
  function senderPinChanged() {
    // Location buttons do not fire a form input event. Invalidate every cached
    // representation so removing a pin cannot resend it through a voice retry
    // or a previously prepared text/email draft.
    requestKey = uid(); requestPayload = null; voicePayload = null;
    voiceKey = uid(); sentRequestId = '';
    if (!backup.hidden) status.textContent = 'Location changed. Prepare your text or email draft again before sending.';
    preview.value = ''; refreshDraftLinks(); backup.hidden = true;
  }
  const sameRequestContent = data => JSON.stringify({...data,smsConsentTimestamp:'',appointmentPencilAcknowledgedAt:''});
  const send = async (path, body, key, json = true) => {
    if (!endpoint) throw new Error('unavailable');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(endpoint + path, { method: 'POST', body: json ? JSON.stringify(body) : body, headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), 'Idempotency-Key': key }, signal: controller.signal, credentials: 'omit' });
      let result = null;
      try { result = await response.json(); } catch (_) { /* A non-JSON reply is not a receipt. */ }
      if (!response.ok || result?.ok !== true || result.received !== true || typeof result.id !== 'string' || !result.id.trim()) {
        // Keep the intake's short validation message (for example a bad phone number) to show as text.
        throw Object.assign(new Error('unconfirmed'), {status: response.status, reason: typeof result?.error === 'string' && result.error.length <= 200 ? result.error : ''});
      }
      return result;
    } finally { clearTimeout(timer); }
  };
  applyMode();
  // Online only while the shop's receiver answers; otherwise the form keeps preparing a text draft.
  if (configuredEndpoint) {
    const probe = new AbortController(), probeTimer = setTimeout(() => probe.abort(), 6000);
    fetch(configuredEndpoint + '/healthz', {credentials:'omit', cache:'no-store', signal:probe.signal})
      .then(response => response.ok ? response.json() : null)
      .then(health => { if (health?.ok !== true) throw new Error('down'); mediaReady = health.media === 'ready'; applyMode(); })
      .catch(() => { if (!sentRequestId && !submit.disabled) { endpoint = ''; applyMode(); } })
      .finally(() => clearTimeout(probeTimer));
  }
  const mediaTypes = {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif',mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm'};
  const uploadMedia = async (result, files = byId('request-media')?.files, statusField = status) => {
    const items = !(mediaReady && result.mediaToken) ? [] : [...(files || [])]
      .map(file => ({file, type: Object.values(mediaTypes).includes((file.type||'').toLowerCase()) ? file.type.toLowerCase() : mediaTypes[(file.name.split('.').pop()||'').toLowerCase()] || ''}))
      .filter(item => item.type && item.file.size <= (item.type.startsWith('video/') ? 100 : 15) * 1024 * 1024).slice(0, 6);
    let sent = 0;
    for (const [n, item] of items.entries()) {
      statusField.textContent = `Request received. Sending photo/video ${n + 1} of ${items.length}… keep this page open.`;
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 300000);
      try {
        const response = await fetch(`${endpoint}/hooks/lead/media/${result.id}`, {method:'POST', credentials:'omit', headers:{'Content-Type':item.type,'X-Media-Token':result.mediaToken}, body:item.file, signal:controller.signal});
        const receipt = await response.json().catch(() => null);
        // A successful HTTP response can still be an error page or an unsaved upload.
        if (response.ok && receipt?.ok === true && receipt.received === true) sent++;
      }
      catch (_) { /* The request is saved; the customer can text the file instead. */ }
      finally { clearTimeout(timer); }
    }
    // Count skipped files (wrong type, too large or past the limit) as not sent, so the customer is told.
    return {sent, total: Math.max(items.length, (files || []).length || 0)};
  };
  let preparingWithWebMcp = false;
  let formStartTracked = false;
  form.addEventListener('input', () => {
    if (!preparingWithWebMcp) { reportMetric('form_started'); if (!formStartTracked) { formStartTracked = true; track('form_start'); } }
    clearTimeout(retryTimer); requestKey = uid(); requestPayload = null; voicePayload = null; voiceKey = uid(); sentRequestId = ''; status.textContent = '';
  });
  document.querySelector('.request-ai-help')?.addEventListener('toggle', event => { if (event.currentTarget.open) reportMetric('ai_help_opened'); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending) return;
    reportMetric('form_started');
    // Browser autofill can insert invisible characters without an input event.
    phoneField.value = cleanPhone(phoneField.value);
    if (carAddress && !carAddress.disabled) carAddress.setCustomValidity(carAddress.value.trim() ? '' : 'Enter the car’s address or use current location.');
    if (visitDay?.value && visitTime?.value && !pencilAck?.checked) {
      if (visitBox) visitBox.open = true;
      status.textContent = 'Please acknowledge that this is penciled in only and Tony must verbally confirm by phone.';
      pencilAck?.focus();
      return;
    }
    if (!form.reportValidity()) { track('form_validation_error', {field: form.querySelector(':invalid')?.name || 'unknown'}); return; }
    const currentData = readRequest();
    if (requestPayload && sameRequestContent(currentData) !== sameRequestContent(requestPayload)) { requestKey = uid(); requestPayload = null; sentRequestId = ''; }
    const data = requestPayload || currentData;
    if (data.website) return;
    if ((endpoint || data.phone) && !validPhone(data.phone)) { status.textContent = endpoint ? 'Please include a valid phone number with its area code.' : 'Please include a valid phone number with its area code, or leave the optional callback field blank when texting.'; phoneField.focus(); return; }
    if (!data.name || !data.details) { status.textContent = 'Please enter your name and a description of the problem. Incomplete vehicle details are okay.'; return; }
    makeBackup(data);
    requestPayload = data;
    if (!endpoint) { status.textContent = 'Your text draft is ready below. Review it, open your texting app, attach photos or a short video of the problem if you have them, and tap Send. Nothing has been sent yet. You can also copy the text, email it or call the shop.'; backup.scrollIntoView({behavior:'auto',block:'nearest'}); return; }
    autoRetries = 0;
    deliver(data, requestKey);
  });
  // Success replaces the form in place, so the customer never lands on an unrelated page.
  const done = byId('request-done');
  let receipt = null;
  let tonyTextReference = '';
  const appointmentNotice = byId('request-done-appointment-state');
  const clip = (value, max) => String(value || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const problemFromDetails = details => {
    const symptoms = String(details || '').split('\n\n')[0];
    const lines = symptoms.split('\n').map(line => line.trim()).filter(Boolean);
    if (!lines.length) return '';
    const first = lines[0].replace(/^Problem:\s*/, '');
    const rest = lines.slice(1).join(' ');
    return [first, rest].filter(Boolean).join('. ');
  };
  // Short text Tony can read on his phone. The long draft stays available for the offline fallback.
  const tonyTextBody = (data, reference) => {
    const summary = typeof window.ptCalmRepairSummary === 'function' ? window.ptCalmRepairSummary() : null;
    const name = clip(summary?.name || data?.name, 80);
    const vehicleRaw = clip(summary?.vehicle || data?.vehicle, 80);
    const vehicle = !vehicleRaw || /^not provided/i.test(vehicleRaw) ? 'car' : vehicleRaw;
    let problem = clip(summary?.problem || problemFromDetails(data?.details), 140).replace(/!/g, '');
    if (!problem) problem = 'a repair';
    if (!/\.$/.test(problem)) problem += '.';
    const ref = clip(reference, 80);
    const body = `Hi, I filled out the repair form on your website. This is ${name || 'a customer'} texting about my ${vehicle}: ${problem}`;
    return (ref ? `${body} Reference: ${ref}.` : body).replace(/!/g, '');
  };
  const fillTonyText = reference => {
    tonyTextReference = reference || '';
    const link = byId('request-done-text');
    if (!link) return;
    const body = tonyTextBody(requestPayload, tonyTextReference);
    link.href = smsHref(body);
    link.dataset.body = body;
  };
  window.ptRefreshTonyText = () => {
    if (done?.hidden) return;
    fillTonyText(tonyTextReference);
  };
  const setTonyCopy = saved => {
    const heading = byId('request-done-heading');
    const lead = byId('request-done-lead');
    const note = byId('request-done-note');
    if (saved) {
      if (heading) heading.textContent = 'Your request is in.';
      if (lead) lead.textContent = 'Send Tony a quick text so he has your number.';
      if (note) note.hidden = false;
    } else {
      if (heading) heading.textContent = "The online request didn't go through.";
      if (lead) lead.textContent = 'A text is the way to reach Tony.';
      if (note) note.hidden = true;
      const ref = byId('request-done-ref');
      if (ref) ref.textContent = '';
      if (appointmentNotice) appointmentNotice.hidden = true;
    }
  };
  const showFailedHandoff = () => {
    setTonyCopy(false);
    fillTonyText('');
    done.hidden = false;
    byId('request-done-text')?.focus({preventScroll:true});
    done.scrollIntoView({behavior:'auto', block:'nearest'});
  };
  function startVerifiedAppointmentStatus(result) {
    if (!appointmentNotice || !requestPayload?.preferredDate || !requestPayload?.preferredTime) return;
    appointmentNotice.hidden = false;
    appointmentNotice.textContent = 'Repair request saved. Calendar placement has not been verified yet. Please call Tony at (239) 397-2048 to confirm.';
    // This capability is returned only after an authenticated server-side receipt.
    // No token or private detail is placed in the URL, analytics, or browser storage.
    const proof = result?.appointmentStatusToken;
    if (!endpoint || typeof proof !== 'string' || proof.length < 40) return;
    let attempts = 0;
    const verify = async () => {
      if (receipt?.id !== result.id || done.hidden) return;
      attempts++;
      let finished = false;
      try {
        const check = await fetch(endpoint + '/hooks/calendar/status/' + encodeURIComponent(result.id), {
          method:'GET',credentials:'omit',cache:'no-store',
          headers:{'X-Appointment-Status-Token':proof}
        });
        const state = await check.json();
        if (check.ok && state?.ok === true) {
          if (state.status === 'confirmed_by_tony' && state.calendarConfirmed === true) {
            appointmentNotice.textContent = 'Tony verbally confirmed your appointment. The shop calendar was updated.';
            finished = true;
          } else if (state.status === 'penciled_in_call_tony' && state.calendarPlaced === true) {
            appointmentNotice.textContent = 'Your appointment is penciled into the shop calendar. Please call Tony at (239) 397-2048 to make it official before visiting.';
            finished = true;
          } else if (state.status === 'verbal_recorded_calendar_sync_pending') {
            appointmentNotice.textContent = 'Tony’s phone confirmation was recorded. The calendar update is still being verified.';
            finished = true;
          } else if (state.status === 'call_tony_to_clarify_time') {
            appointmentNotice.textContent = 'Your requested clock time needs clarification. Please call Tony at (239) 397-2048.';
            finished = true;
          }
        }
      } catch (_) {
        // Provider status failed; the verified lead receipt is still valid.
      }
      if (!finished && attempts < 4 && receipt?.id === result.id && !done.hidden)
        setTimeout(() => { void verify(); }, 4000);
    };
    void verify();
  }
  const showDone = (result, sentMedia) => {
    receipt = result;
    setTonyCopy(true);
    fillTonyText(result.id);
    backup.hidden = true; form.hidden = true; done.hidden = false;
    startVerifiedAppointmentStatus(result);
    byId('request-done-ref').textContent = `Reference: ${result.id}`;
    const confirmCall = byId('request-done-call');
    if (confirmCall) confirmCall.textContent = requestPayload?.preferredDate && requestPayload?.preferredTime
      ? 'Call Tony to confirm (239) 397-2048'
      : 'Call Tony about your request (239) 397-2048';
    const failed = sentMedia.total - sentMedia.sent;
    byId('request-done-status').textContent = failed
      ? `${failed} photo/video file(s) did not go through. Choose Add another photo to try again, or text them to (239) 397-2048.`
      : sentMedia.sent ? `${sentMedia.sent} photo/video file(s) received.` : '';
    byId('request-done-photo').hidden = !(mediaReady && result.mediaToken);
    byId('repair-request-dialog')?.setAttribute('aria-labelledby', 'request-done-heading');
    const heading = byId('request-done-heading');
    heading.focus({preventScroll:true});
    done.scrollIntoView({behavior:'auto', block:'nearest'});
    // Receipt evidence contains no name, phone number, vehicle or message contents.
    try { sessionStorage.setItem('pt-last-request', JSON.stringify({id: result.id, receivedAt: result.receivedAt || new Date().toISOString(), confirmed:true})); } catch (_) { /* The on-page receipt is enough. */ }
  };
  byId('request-done-media')?.addEventListener('change', async event => {
    const input = event.currentTarget, doneStatus = byId('request-done-status');
    if (!receipt || !input.files.length) return;
    input.disabled = true;
    const sentMedia = await uploadMedia(receipt, input.files, doneStatus);
    input.value = ''; input.disabled = false;
    if (sentMedia.total) track('form_photo_added', {count: sentMedia.sent});
    doneStatus.textContent = !sentMedia.total
      ? 'That file type or size can’t be sent here. Text it to (239) 397-2048 instead.'
      : sentMedia.sent === sentMedia.total ? `${sentMedia.sent} more photo/video file(s) received. Thank you.`
      : `${sentMedia.total - sentMedia.sent} file(s) did not go through. Try again, or text them to (239) 397-2048.`;
  });
  // A dropped connection retries the same saved payload and key in the background, so a
  // customer who already pressed send is not left with an unsent lead after a brief outage.
  let retryTimer = 0, autoRetries = 0;
  // Only a 4xx is a definite rejection; anything else may have been saved, so retry with the same key.
  const retryable = error => !error.status || error.status < 400 || error.status >= 500 || error.status === 408 || error.status === 429;
  async function deliver(data, submittedKey) {
    clearTimeout(retryTimer);
    sending = true; submit.disabled = true; submit.textContent = 'Sending…';
    status.textContent = autoRetries ? 'Trying again to send your repair request…' : 'Sending your repair request…';
    reportMetric('submit_attempted', false);
    track('form_submit_attempt', {service: data.service, attempt: autoRetries + 1});
    try {
      const result = await send('/hooks/lead/webform', data, submittedKey);
      if (submittedKey !== requestKey) { status.textContent = 'The earlier request was received. Your edited details have not been sent; send again to share this update.'; submit.textContent = 'Send updated request'; return; }
      sentRequestId = result.id;
      const files = byId('request-media')?.files?.length || 0;
      track('form_submit_success', {service: data.service, has_photos: files > 0, car_location: data.carLocation?.type || 'not_given', text_consent: data.smsConsent === true});
      status.textContent = `Repair request received. Reference: ${result.id}.`;
      const sentMedia = await uploadMedia(result);
      showDone(result, sentMedia);
    } catch (error) {
      reportMetric('submit_unconfirmed', false);
      track('form_submit_error', {reason: error.status ? `http_${error.status}` : 'network', attempt: autoRetries + 1});
      if (submittedKey !== requestKey) {
        status.textContent = 'Receipt of the earlier request could not be confirmed. Your changed details have not been sent. Send again to share the update, or call (239) 397-2048.';
        submit.textContent = 'Send updated request';
      } else if (error.status && !retryable(error)) {
        status.textContent = `${error.reason || 'The shop’s system could not accept this request.'} Your details are still here: correct them and send again, or call (239) 397-2048.`;
        submit.textContent = 'Retry repair request';
        showFailedHandoff();
      } else if (autoRetries < 2) {
        autoRetries++;
        status.textContent = 'We could not confirm receipt yet. Your details are safe on this page, and we’re trying again in a few seconds. You can also call (239) 397-2048.';
        submit.textContent = 'Retry now';
        retryTimer = setTimeout(() => { if (!sending && !sentRequestId && submittedKey === requestKey && requestPayload) deliver(requestPayload, submittedKey); }, autoRetries === 1 ? 4000 : 12000);
      } else {
        status.textContent = 'We could not confirm receipt. Your details are preserved below. Retry, call (239) 397-2048, or open the text/email draft and send it yourself.';
        submit.textContent = 'Retry repair request';
        showFailedHandoff();
      }
    } finally { sending = false; submit.disabled = form.hidden; }
  }
  // With scripts unavailable the disabled control cannot navigate away with an unsent form.
  submit.disabled = false;
  byId('request-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(preview.value); status.textContent = 'Request copied. Paste it into your email or text message and send it to the shop.'; }
    catch (_) { preview.focus(); preview.select(); status.textContent = 'Select and copy the message above, then paste it into your email or text.'; }
  });
  byId('request-done-copy')?.addEventListener('click', async () => {
    const text = byId('request-done-text')?.dataset.body || '';
    const doneStatus = byId('request-done-status');
    try {
      await navigator.clipboard.writeText(text);
      if (doneStatus) doneStatus.textContent = 'Text copied. Paste it into your messages app and send it to Tony.';
    } catch (_) {
      if (doneStatus) doneStatus.textContent = 'Select the message and paste it into your messages app, or call (239) 397-2048.';
    }
  });
  let recorder, stream, chunks = [], recording, recordingUrl, stopTimer, voiceKey;
  const start = byId('voice-start'), stop = byId('voice-stop'), voiceSend = byId('voice-send'), voiceStatus = byId('voice-status');
  const releaseMic = () => { clearTimeout(stopTimer); stream?.getTracks().forEach(track => track.stop()); stream = null; };
  start.addEventListener('click', async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { voiceStatus.textContent = 'Recording is unavailable in this browser. Type your symptoms above, or record with your phone and attach the file to an email or text.'; return; }
    start.disabled = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      chunks = []; recording = null; voiceKey = uid(); voicePayload = null;
      voiceSend.hidden = true; byId('voice-preview').hidden = true; byId('voice-download').hidden = true;
      recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
      recorder.addEventListener('error', () => { releaseMic(); start.disabled = false; stop.disabled = true; voiceStatus.textContent = 'Recording failed. Please type your request or call the shop.'; });
      recorder.addEventListener('stop', () => {
        releaseMic(); start.disabled = false; stop.disabled = true;
        recording = new Blob(chunks, { type: recorder.mimeType });
        if (!recording.size) { voiceStatus.textContent = 'No audio was recorded. Try again or type your request.'; return; }
        if (recordingUrl) URL.revokeObjectURL(recordingUrl);
        recordingUrl = URL.createObjectURL(recording);
        const audio = byId('voice-preview'); audio.src = recordingUrl; audio.hidden = false;
        const download = byId('voice-download'); download.href = recordingUrl; download.download = 'perfect-timing-repair-note.' + (recording.type.includes('mp4') ? 'm4a' : recording.type.includes('ogg') ? 'ogg' : 'webm'); download.hidden = false;
        voiceSend.hidden = !endpoint; voiceStatus.textContent = 'Recording ready. Listen to it before sending, or download it to attach to an email or text.';
      });
      recorder.start(); reportMetric('voice_started'); stop.disabled = false; voiceStatus.textContent = 'Recording… stops automatically after 60 seconds.';
      stopTimer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 60000);
    } catch (_) { releaseMic(); start.disabled = false; voiceStatus.textContent = 'Microphone access was unavailable. You can type your request above or use your phone recorder.'; }
  });
  stop.addEventListener('click', () => { if (recorder?.state === 'recording') recorder.stop(); });
  voiceSend.addEventListener('click', async () => {
    if (carAddress && !carAddress.disabled) carAddress.setCustomValidity(carAddress.value.trim() ? '' : 'Enter the car’s address or use current location.');
    if (carAddress && !carAddress.disabled && !carAddress.reportValidity()) { voiceStatus.textContent = 'Enter the car’s address above, or change “Where is the car?” to Not sure yet, before sending your recording.'; return; }
    const currentData = { ...readRequest(), source:'voice', requestId: sentRequestId };
    if (voicePayload && sameRequestContent(currentData) !== sameRequestContent(voicePayload)) { voiceKey = uid(); voicePayload = null; }
    const data = voicePayload || currentData;
    if (!data.name || data.phone.replace(/\D/g, '').length < 10 || !data.vehicle) { voiceStatus.textContent = 'Enter your name, phone number, and vehicle in the form above so we can respond to your recording.'; byId('request-name').focus(); return; }
    if (!recording) return;
    voicePayload = data;
    const submittedVoiceKey = voiceKey;
    voiceSend.disabled = true; start.disabled = true; voiceStatus.textContent = 'Sending recording…';
    const upload = new FormData();
    upload.append('audio', recording, byId('voice-download').download);
    Object.entries(data).forEach(([key, value]) => upload.append(key, key === 'carLocation' ? JSON.stringify(value) : String(value)));
    try { const result = await send('/hooks/lead/voicenote', upload, submittedVoiceKey, false); voiceStatus.textContent = submittedVoiceKey !== voiceKey
      ? `The earlier recording was received. Reference: ${result.id}. Your changed details have not been sent; send again to share the update.`
      : `Recording received. Reference: ${result.id}. Our team will follow up; your appointment is not confirmed yet.`; }
    catch (_) { voiceStatus.textContent = submittedVoiceKey !== voiceKey
      ? 'Receipt of the earlier recording could not be confirmed. Your changed details have not been sent; send again to share the update, or call (239) 397-2048.'
      : 'We could not confirm receipt. Retry, or download the recording and attach it to your email or text. You can also call (239) 397-2048.'; }
    finally { voiceSend.disabled = false; start.disabled = false; }
  });
  window.addEventListener('pagehide', () => { if (recorder?.state === 'recording') recorder.stop(); releaseMic(); if (recordingUrl) URL.revokeObjectURL(recordingUrl); });

  // Agent assistance fills the visible form. The customer reviews and submits it
  // through the same handler above; this tool never contacts the receiver.
  const repairToolFields = {
    details: ['request-details', 'The repair problem in the customer’s own words. Required before sending.'],
    service: ['request-service', 'The type of repair, or Diagnosis / not sure yet.'],
    starts: ['request-starts', 'Whether the vehicle can be driven: yes, no, or unknown.'],
    vehicle: ['request-vehicle', 'Vehicle year, make and model, if known.'],
    locationChoice: ['request-location-choice', 'Optional. location means the car is at an address; dropoff means asking the shop to arrange a drop-off.'],
    carAddress: ['request-car-address', 'Street address, city and parking details when locationChoice is location.'],
    dropoffTime: ['request-dropoff-time', 'Preferred time when locationChoice is dropoff; the shop must confirm it.'],
    name: ['request-name', 'The customer’s name. Required before sending.'],
    phone: ['request-phone', 'The customer’s callback number, including area code. Required for online requests.'],
    city: ['request-city', 'The customer’s city or ZIP code, if known.'],
    stranded: ['request-stranded', 'Whether the customer is stranded: yes, no, or unknown.'],
    timing: ['request-timing', 'Preferred repair timing or callback time, in the customer’s words.']
  };
  const repairToolProperties = Object.fromEntries(Object.entries(repairToolFields).map(([name, [id, description]]) => {
    const field = byId(id), property = {type:'string', description};
    if (field.tagName === 'SELECT') property.enum = [...field.options].filter(option => option.value && !option.hidden).map(option => option.value);
    else if (field.maxLength > 0) property.maxLength = field.maxLength;
    return [name, property];
  }));
  const prepareRepairRequest = input => {
    const failure = (code, message, fields = []) => ({status:code, submitted:false, reviewRequired:true, message, fields});
    if (sending) return failure('busy', 'A request is being sent. Wait for its result before editing.');
    if (!input || typeof input !== 'object' || Array.isArray(input)) return failure('invalid_input', 'Provide an object containing repair form fields.');
    // Validate the entire update before changing the customer’s existing entries.
    for (const [name, value] of Object.entries(input)) {
      if (!Object.hasOwn(repairToolFields, name)) return failure('invalid_input', 'Use only the listed repair form fields.', [name]);
      const property = repairToolProperties[name];
      if (typeof value !== 'string' || (property.maxLength && value.length > property.maxLength) || (property.enum && !property.enum.includes(value))) return failure('invalid_input', `Provide a valid value for ${name}.`, [name]);
      if (name === 'phone' && value.trim() && !validPhone(cleanPhone(value))) return failure('invalid_input', 'Include a valid callback number with its area code.', [name]);
    }
    const chosenLocation = input.locationChoice ?? locationChoice.value;
    if (Object.hasOwn(input, 'carAddress') && chosenLocation !== 'location') return failure('invalid_input', 'Choose location when providing the car’s address.', ['locationChoice']);
    if (Object.hasOwn(input, 'dropoffTime') && chosenLocation !== 'dropoff') return failure('invalid_input', 'Choose dropoff when providing a preferred drop-off time.', ['locationChoice']);
    preparingWithWebMcp = true;
    try {
    if (Object.hasOwn(input, 'locationChoice') && locationChoice.value !== input.locationChoice) {
      locationChoice.value = input.locationChoice;
      locationChoice.dispatchEvent(new Event('input', {bubbles:true}));
      locationChoice.dispatchEvent(new Event('change', {bubbles:true}));
    }
    for (const [name, value] of Object.entries(input)) {
      if (name === 'locationChoice') continue;
      const field = byId(repairToolFields[name][0]);
      const nextValue = name === 'phone' ? cleanPhone(value) : value;
      // Repeating a preparation must retain an uncertain submission’s retry key.
      if (field.value === nextValue) continue;
      field.value = nextValue;
      field.dispatchEvent(new Event('input', {bubbles:true}));
      field.dispatchEvent(new Event('change', {bubbles:true}));
      const options = field.closest('details');
      if (options) options.open = true;
    }
    } finally { preparingWithWebMcp = false; }
    reportMetric('webmcp_prepared');
    // Native constraints plus the same phone/address rules used on human submit.
    if (!carAddress.disabled) carAddress.setCustomValidity(carAddress.value.trim() ? '' : 'Enter the car’s address or use current location.');
    const incomplete = Object.entries(repairToolFields).filter(([, [id]]) => {
      const field = byId(id);
      return !field.disabled && ((!field.value.trim() && field.required) || !field.checkValidity());
    }).map(([name]) => name);
    if ((endpoint || phoneField.value.trim()) && !validPhone(cleanPhone(phoneField.value)) && !incomplete.includes('phone')) incomplete.push('phone');
    const ready = incomplete.length === 0;
    const message = ready
      ? endpoint ? `Review the form and choose ${submit.textContent.trim()}. The shop must confirm appointments.` : 'Review the form and choose Prepare text to the shop, then send the draft yourself.'
      : 'Complete the listed fields, then review the form before sending.';
    status.textContent = `${message} Nothing has been sent by the agent.`;
    form.dispatchEvent(new Event('pt:repair-review'));
    form.scrollIntoView({behavior:'auto', block:'nearest'});
    (ready ? submit : byId(repairToolFields[incomplete[0]][0])).focus();
    return {status:ready ? 'ready_for_review' : 'needs_details', submitted:false, reviewRequired:true, message, fields:incomplete};
  };
  let repairToolRegistration;
  const registerRepairTool = () => {
    const context = document.modelContext;
    if (repairToolRegistration || typeof context?.registerTool !== 'function') return;
    const controller = new AbortController();
    repairToolRegistration = controller;
    try {
      Promise.resolve(context.registerTool({
        name:'prepare_repair_request',
        description:'Fill the visible Perfect Timing Auto Repair intake form with customer-provided repair and contact details. Preserves omitted fields and returns missing fields or readiness for customer review and manual submission.',
        inputSchema:{type:'object', properties:repairToolProperties, additionalProperties:false},
        execute:prepareRepairRequest,
        annotations:{readOnlyHint:false, consequentialHint:false, untrustedContentHint:false}
      }, {signal:controller.signal})).catch(() => { if (repairToolRegistration === controller) repairToolRegistration = null; });
    } catch (_) { repairToolRegistration = null; /* Ordinary form use remains available. */ }
  };
  registerRepairTool();
  window.addEventListener('pagehide', () => { repairToolRegistration?.abort(); repairToolRegistration = null; });
  window.addEventListener('pageshow', event => { if (event.persisted) registerRepairTool(); });
})();


(() => {
  'use strict';
  // Optional "Sign in with Google" that only pre-fills the repair form. Dormant until
  // PT_CONTACT_CONFIG.googleClientId is set: no button, no Google script. The ID token is
  // decoded in the browser to fill fields and is never sent; submit and intake are unchanged.
  const clientId = String(window.PT_CONTACT_CONFIG?.googleClientId || '').trim();
  const form = document.getElementById('bookingForm');
  const anchor = document.getElementById('request-instructions');
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId) || !form || !anchor) return;
  const box = document.createElement('div');
  box.className = 'request-fineprint request-google';
  box.id = 'request-google';
  box.style.margin = '0 0 18px';
  const slot = document.createElement('div');
  slot.id = 'request-google-button';
  const note = document.createElement('p');
  note.id = 'request-google-note';
  note.style.margin = '6px 0 0';
  note.textContent = 'Optional: sign in with Google to fill in your name and email. You can also just type them.';
  box.append(slot, note);
  anchor.after(box);
  const claimsOf = token => {
    try {
      const part = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const bytes = atob(part + '='.repeat((4 - part.length % 4) % 4));
      return JSON.parse(decodeURIComponent([...bytes].map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
    } catch (_) { return null; }
  };
  const prefill = (field, value) => {
    if (!field || typeof value !== 'string' || !value.trim() || field.value.trim()) return false;
    field.value = value.trim().slice(0, field.maxLength > 0 ? field.maxLength : 200);
    field.dispatchEvent(new Event('input', {bubbles:true}));
    return true;
  };
  const onCredential = response => {
    const claims = claimsOf(response?.credential);
    if (!claims || claims.aud !== clientId) return;
    const named = prefill(form.querySelector('#request-name'), claims.name);
    // Fills the optional email field only with a Google-verified address, and only if it is empty.
    if (claims.email_verified) prefill(form.querySelector('input[name="email"]'), claims.email);
    note.textContent = named ? 'Name filled in from Google. Check it, then finish the form.' : 'Signed in. Finish the form below.';
  };
  const start = () => {
    const gsi = window.google?.accounts?.id;
    if (!gsi) { box.remove(); return; }
    gsi.initialize({client_id:clientId, callback:onCredential, auto_select:false, cancel_on_tap_outside:true, context:'use', ux_mode:'popup', itp_support:true});
    gsi.renderButton(slot, {type:'standard', theme:'outline', size:'medium', text:'signin_with', shape:'pill', logo_alignment:'left'});
  };
  let loading = false;
  const load = () => {
    if (loading) return;
    loading = true;
    const tag = document.createElement('script');
    tag.src = 'https://accounts.google.com/gsi/client';
    tag.async = true;
    tag.onload = start;
    tag.onerror = () => box.remove();
    document.head.append(tag);
  };
  // Load Google's script only when the form is near the screen or someone starts typing.
  form.addEventListener('focusin', load, {once:true});
  if ('IntersectionObserver' in window) {
    const watch = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { watch.disconnect(); load(); } }, {rootMargin:'200px'});
    watch.observe(form);
  } else if (document.readyState === 'complete') load();
  else window.addEventListener('load', load, {once:true});
})();
