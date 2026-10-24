# Static website staging isolation

This is the build boundary for a separate staging host sourced from this repository. Production remains GitHub Pages from `main` with its existing `CNAME`. The staging builder does not edit production pages, scripts, endpoints or search files.

## Build and test

Use Node 24, then run:

```text
npm ci
node --test tools/website-staging.test.mjs
npm run build:staging
```

Publish **only `.staging-dist`**, never the repository root. It is generated, ignored by Git, and explicitly excluded from the production Jekyll configuration. Do not use GitHub's `deploy-pages` action for staging in this repository: a repository has only one GitHub Pages site.

The generated static output carries a visible staging banner, per-page robots metadata, and host response rules in `_headers`. A static host must apply those response rules. All routes, including errors, require `X-Robots-Tag` noindex. The output has no production sitemap, CNAME, structured data or canonical links. Crawlers may fetch the output so they can read noindex; noindex is not access control.

The guard loads before application scripts. It supplies only in-memory synthetic responses for the existing repair/media/parts/careers flows, with calendar status remaining pending. CSP blocks real connections and native form submissions. The generated careers endpoint replaces its independent production email service. External active resources, analytics, Google sign-in and production dashboard navigation are disabled. Real calls, SMS, email drafts and device capture are blocked, including destinations created later by page scripts. Unknown endpoints fail closed. No backend, database, customer records, secrets, queues or scheduled workers are copied or started.

## User-facing feature and verification map

| Feature | Existing entry path | Source boundary | Proof |
| --- | --- | --- | --- |
| Repair request preview | Home dialog or `/request-a-repair.html`, existing booking form | first-loaded staging guard + mock intake/media/calendar | synthetic staging test; live hosted network readback remains required |
| Parts request preview | `/parts.html`, existing `partsForm` | generated contact config + same in-memory mock lead route | synthetic staging test |
| Careers preview | `/careers.html`, existing `careers-form` | staging build rewrites independent FormSubmit destination | synthetic staging test |
| Contact actions | Existing call/text/email/Owner Desk links, including receipt actions | static URL rewrite + runtime transport/navigation guards | synthetic staging test; browser readback when available |
| Search exclusion | Every generated HTML page, 404 and alias | noindex metadata + `_headers`; no sitemap/canonical/JSON-LD | every-page artifact assertions |

These are staging-only boundaries, not production delivery or calendar-integration proof. No keyboard shortcuts are added; existing form and dialog behavior remains in the application scripts. New executable resources or integration paths must be reviewed against the staging allowlist and exercised before deployment.

Use synthetic names, reserved email addresses and fictional phone numbers. Do not enter real customer details. Mock receipts do not represent a saved production lead, sent notification, calendar event, quote, payment or booking.

Hosting integration and DNS actions require a separate reviewed deployment runbook and the actual account/domain permissions. After publication, verify the precise deployed revision and headers on both the provider hostname and `staging.fixingfortmyers.com`, then exercise every form while observing network traffic. Source and jsdom checks alone do not establish that a hosting provider applied headers or kept injected analytics disabled.
