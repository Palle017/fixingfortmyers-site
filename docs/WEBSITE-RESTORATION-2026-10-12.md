# Website and Bay One restoration — October 12, 2026

The public website remains GitHub Pages at https://fixingfortmyers.com.

## Service and search content

Pages now describe both the temporary Bayshore Ranch workshop and suitable mobile jobs. Tony confirms scope, equipment, location and appointment availability. Removed unconfirmed around-the-clock repair hours from visible text and structured data. Customer-story/workshop copy no longer presents unfinished case studies as documented repair proof. Existing URLs, canonicals, sitemap and Google verification remain intact.

The current logo and original Bay One artwork are preserved pending the owner's replacement logo. Real customer-approved job details and photos are still needed for stronger case studies. No new review counts, credentials, prices or guarantees were invented.

## Bay One runtime and recovery

Original public Bay One ran in the Node intake service through a Tailscale Funnel on an owner-operated computer. Its estimator was replaced by intake-only behavior in September. Source history preserved the earlier implementation; laptop uptime and local database backups were separate risks.

The restored optional public assistant uses https://bay-one-website-assistant.ubnvs1.chatgpt.site, with separately versioned source in its managed Site repository. It has durable D1 quotas/history and a server-only DeepSeek credential. It does not require the laptop to stay awake. Keep the hosting account, provider credential and provider balance available. Versioned source is recoverable; it is not a guarantee of permanent service or a backup of old laptop records.

The two-per-Eastern-day estimates are preliminary AI planning ranges, not live parts prices, verified book labor time, or confirmed shop quotes. Six recent exchanges are retained. Records older than seven days are removed on later chat traffic. See the public privacy policy and the hosted service README.

Repair requests and attachments still use the existing separate cloud intake endpoint in contact-config.js. No old lead database, private shop system or customer records were moved or deleted. Chat artwork and API calls wait until the visitor opens Bay One; the launcher remains available on mobile.

## Measurement and maintenance

Configuration now loads before site.js across measured pages. Acquisition categories survive internal navigation, and only a confirmed saved request counts as a form success. GA4 remains unconfigured until the owner's actual measurement ID and account settings are supplied; see ANALYTICS-SETUP.md.

Original CSS files remain editable. Run npm run build:styles after stylesheet changes to regenerate deterministic, cache-versioned bundles. The legacy 24/7 hours generator is retired.

## Verification

Checked mobile and desktop layouts, mobile chat visibility, and an isolated synthetic form submission with receipt. No production repair inquiry or notification was sent. Hosted assistant session, real model Q&A, two real planning estimates, and rejection of a third estimate were verified. Search ranking and field Core Web Vitals improvements have not yet been measured.
