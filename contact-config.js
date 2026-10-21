// Positioning: Perfect Timing Auto Repair — engine, transmission and diesel repair in Fort Myers, by appointment at Tony's workshop.
// Owner-approved 2026-10-03: repair requests are saved in durable cloud intake before receipt is confirmed.
// Keep local previews from sending production inquiries; the preview server supplies its own mock endpoint.
window.PT_CONTACT_CONFIG = /^(www\.)?fixingfortmyers\.com$/.test(location.hostname)
  ? { endpoint: 'https://perfect-timing-cloud-intake.prudhvi-pallempati.chatgpt.site', ga4MeasurementId: '', googleClientId: '' }
  : { endpoint: '', ga4MeasurementId: '', googleClientId: '' };
// Add only the owner's actual GA4 web-stream ID. Until then, no Google tag is
// loaded. See docs/ANALYTICS-SETUP.md for property settings and receipt events.
// googleClientId: the shop's public Google OAuth web client ID (ends in .apps.googleusercontent.com;
// not a secret). Authorized JavaScript origins: https://fixingfortmyers.com and https://www.fixingfortmyers.com.
// While it is empty, no Google sign-in button renders and the Google script never loads.
