// Public copy for the owner-directed Bay One pause. No runtime is started.
import fs from 'node:fs';
const old = 'Outside 8 a.m.–8 p.m. Eastern, Tony is assisted by Bay One AI. After-hours repairs depend on the job, location and availability; Tony confirms all dispatches.';
const current = 'After-hours repairs depend on the job, location and availability; Tony confirms all dispatches. Bay One AI intake is currently offline. Call or text Tony directly.';
for (const name of fs.readdirSync('.').filter(name => name.endsWith('.html'))) {
  let html = fs.readFileSync(name, 'utf8');
  html = html.replaceAll(old, current)
    .replaceAll('AI-assisted after hours. Tony confirms dispatch.', 'Tony confirms availability and dispatch.')
    .replaceAll('Outside 8 a.m.–8 p.m. Eastern, Bay One AI assists Tony.', 'Call or text Tony directly; Bay One AI intake is currently offline.')
    .replaceAll('Bay One is available from the chat button. You can always call or use the request form.', 'Call or text Tony directly, or use the request form to prepare your details.')
    .replaceAll('Bay One can help collect information; the form and phone are always available.', 'Call or text Tony directly; the form helps you prepare a clear message.');
  fs.writeFileSync(name, html);
}
