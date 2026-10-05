// Positioning: Perfect Timing Auto Repair — engine, transmission and diesel repair in Fort Myers, by appointment at Tony's workshop.
// Owner-approved 2026-10-03: repair requests are saved in durable cloud intake before receipt is confirmed.
// Keep local previews from sending production inquiries; the preview server supplies its own mock endpoint.
window.PT_CONTACT_CONFIG = /^(www\.)?fixingfortmyers\.com$/.test(location.hostname)
  ? { endpoint: 'https://perfect-timing-cloud-intake.prudhvi-pallempati.chatgpt.site' }
  : { endpoint: '' };
