# September 6, 2026 website update

Public business details:

- Perfect Timing Auto Repair LLC
- Phone: (239) 397-2048 (`tel:+12393972048`)
- Email: fixingfortmyers@gmail.com
- Location: Fort Myers and Southwest Florida, by appointment. Call before bringing a vehicle.
- The next shop is being prepared. Do not publish a street address, directions, coordinates, or opening date until the owner authorizes them.

## Website changes

The homepage displays its introduction and call/request buttons immediately, with a persistent mobile contact bar. The intro video is optional. Contact inputs have visible labels, explicit consent, request timeouts, stable retry identifiers, and an email-draft fallback that does not claim delivery.

The five priority service pages, About page, and Cape Coral, Lehigh Acres, and North Fort Myers pages have revised customer-focused content. Visible FAQs and their structured data agree. Internal service links use the existing extensionless canonical URLs. Physical HTML files remain in place for existing links.

The phone number is updated in visible content, phone links, metadata, schema, policies, and the social preview image. Old location and travel-time claims are removed. Address and coordinate schema remain absent until there is a current approved public location.

## Contact service

`contact-config.js` specifies the public intake base URL, currently `https://redline.taild5f39d.ts.net:10000`. This port serves only the customer request receiver. Keep the private assistant and owner inbox off this public port.

Receiver source and installation instructions are in `_website-intake/`. That source folder is excluded from GitHub Pages. Never commit its runtime configuration, customer database, recordings, logs, or test databases. The running service lives separately on the shop computer.

The owner opens the **Perfect Timing Website Requests** desktop shortcut to read requests and recordings, call customers, and mark items contacted or closed. Desktop alerts require the inbox to remain open. This service does not send automatic texts or emails. The Contact the team widget opens the contact section; it does not claim to be a live chat agent.

The computer must be awake and online for website submissions to reach it. The receiver starts without a command window at Windows sign-in. Calling, texting, and the email-draft fallback remain available if the receiver is unreachable.

## Search follow-up

Check the site's property in Google Search Console after publication and request indexing of the homepage and priority service pages. Update the Google Business Profile phone and location visibility separately in its owner account. Do not add the future address there until it is ready for customer traffic. Search ranking and traffic changes require actual Search Console data; this update does not claim a measured ranking increase.
