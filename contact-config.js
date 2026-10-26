// Positioning: Perfect Timing Auto Repair — engine, transmission and diesel repair in Fort Myers, by appointment at Tony's workshop.
// Owner-approved 2026-10-03: repair requests are saved in durable cloud intake before receipt is confirmed.
// Keep local previews from sending production inquiries; the preview server supplies its own mock endpoint.
window.PT_CONTACT_CONFIG = /^(www\.)?fixingfortmyers\.com$/.test(location.hostname)
  ? { endpoint: 'https://perfect-timing-cloud-intake.prudhvi-pallempati.chatgpt.site', requestEndpoint: 'https://perfect-timing-cloud-intake.prudhvi-pallempati.chatgpt.site/hooks/lead/webform', ga4MeasurementId: 'G-0PR5LCGYF9', googleClientId: '' }
  : { endpoint: '', requestEndpoint: '', ga4MeasurementId: '', googleClientId: '' };
// The v1 form submits directly; Cloud Intake saves the request and queues the shop email.
// Release gate: deployed site_form_v1 compatibility, durable receipt and email acceptance.
// requestEndpoint is public HTTPS, never visitors' loopback. No mail app is required.
// Keep endpoint for existing analytics, parts and receipt consumers unchanged.
// See deliverables/form-backend-spec.md for the receiver contract and release evidence.
// Owner's fixingfortmyers.com web stream verified October 21, 2026. Preview
// hosts stay disabled. See docs/ANALYTICS-SETUP.md for settings and receipt events.
// googleClientId: the shop's public Google OAuth web client ID (ends in .apps.googleusercontent.com;
// not a secret). Authorized JavaScript origins: https://fixingfortmyers.com and https://www.fixingfortmyers.com.
// While it is empty, no Google sign-in button renders and the Google script never loads.
