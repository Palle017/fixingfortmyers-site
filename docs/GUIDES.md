# Repair guides

**Latest revision:** see [SEO-CONTENT.md](SEO-CONTENT.md) for the five-guide symptom strategy and [LEAD-GROWTH-RELEASE.md](LEAD-GROWTH-RELEASE.md) for current release verification. The notes below retain the original guide-stage context.

Prepared September 24, 2026 in the isolated `company-update` worktree. These new static pages reuse Perfect Timing's existing navigation, branding, footer and contact bar. **Public Bay One is disabled in the prepared release at the owner's request.** Its source/assets remain for later review, but the guides must not advertise an available assistant or expose an active chat entry point. No existing service page is replaced.

## Pages and request attribution

| Public URL | Source | Fixed request link |
| --- | --- | --- |
| `/repair-guides` | `repair-guides.html` | `/?service=diagnostics#contact` |
| `/repair-guide-car-wont-start` | `repair-guide-car-wont-start.html` | `/?service=no-start#contact` |
| `/repair-guide-ac-warm-at-idle` | `repair-guide-ac-warm-at-idle.html` | `/?service=ac#contact` |
| `/repair-guide-battery-keeps-dying` | `repair-guide-battery-keeps-dying.html` | `/?service=battery#contact` |
| `/repair-guide-car-overheating` | `repair-guide-car-overheating.html` | `/?service=cooling#contact` |
| `/repair-guide-flashing-check-engine-light` | `repair-guide-flashing-check-engine-light.html` | `/?service=diagnostics#contact` |

The request links use the frontend's agreed service whitelist. They contain no customer details. The final conventional path prepares a direct text-message draft for Tony, with email/copy alternatives; the customer must press Send in their messaging app. Draft preparation is not stored-lead or delivery confirmation. The guide hub and articles link to existing related service pages. Shared guide styling is scoped to `.guides-page` in `repair-guides.css`. There is no guide-specific JavaScript or new third-party integration.

## Editorial scope

The articles explain useful symptom observations and information to provide with an inquiry. They do not identify a failed part from a symptom, give repair prices, declare a vehicle safe to drive, promise a dispatch, or present generic jump-start/refrigerant procedures. They include brief hazard guidance and direct contact paths. No Tony technical-review claim, invented testimonial, certification, repair outcome, or original workshop image is added.

Each page displays `24/7*` linking to the readable current footer note: “* After-hours repairs depend on the job, location and availability; Tony confirms all dispatches. Bay One AI intake is currently offline. Call or text Tony directly.” This replaces the earlier AI-assisted after-hours wording.

Article metadata identifies the site as publisher, without inventing a named author or review. Canonicals use the existing extensionless convention. The hub has CollectionPage/Article links and every page has breadcrumb structured data. The root release task owns adding these URLs to the existing sitemap and navigation; creating these files does not establish indexing or deployment.

## Primary references checked September 24, 2026

- No-start symptom distinctions: [AAA: 14 reasons a car will not start](https://ww1.aaa.com/autorepair/articles/14-reasons-why-your-car-wont-start). Symptoms overlap; the article deliberately avoids turning a click into a definitive parts diagnosis.
- Charging warnings: [AAA: signs of a bad alternator](https://mwg.aaa.com/via/car/signs-of-a-bad-alternator).
- A/C heat rejection and stationary airflow: [DENSO condensers](https://www.denso-am.eu/products/ac-engine-cooling/condensers), [DENSO cooling fans](https://www.denso-am.eu/products/ac-engine-cooling/cooling-fans). DENSO is the component manufacturer's source. Treating the idle-versus-driving pattern as a reason to inspect airflow is an inference, not a diagnosis.
- Changed A/C performance and repeat recharge history: [AAA A/C guidance](https://cluballiance.aaa.com/the-extra-mile/advice/car/is-your-cars-air-conditioner-trying-to-tell-you-something).
- Battery drain, accessories and parking patterns: [AAA dead-battery causes](https://www.acg.aaa.com/connect/blogs/4c/auto/6-unexpected-reasons-your-car-battery-is-dead), [AAA short-trip/battery guidance](https://cluballiance.aaa.com/the-extra-mile/advice/car/make-battery-last).

Source links are placed discreetly at each article's end. Copy is original, concise, and limited to the relevant facts. Vehicle-specific owner manuals take precedence over general information. No source image or diagram was copied.

## Verification and future articles

Local structural verification passed for all four guide pages: JSON-LD parsed, local references resolved, each page has one H1 and the expected canonical, IDs are unique, hours-note anchors exist, and request links use approved service codes. Duplicate footer links/disclosures and a provisional stylesheet reference were removed and checks rerun. The separate six-page jsdom/axe audit, including all four guides, reported **zero violations** after minimal landmark corrections; color contrast was excluded because jsdom does not render. See [release evidence and limitations](COMPANY-UPDATE.md).

Before release, confirm mobile navigation, absence of a public Bay One entry point, each expected service selection and the native-message draft/fallback flow in the integrated preview. A 390 × 844 guide preview showed no horizontal overflow and correct electrical prefill before the final direct-message changes; final release checks remain with the release owner. No real inquiry, AI request, call or text is needed to verify these static pages.

For another guide, use the same flat `repair-guide-*.html` pattern, restrained symptom-to-inquiry structure, primary sources, and a fixed approved service code. Update the hub, related links, sitemap and metadata together. Recheck sources when technical content changes. Do not add a new “reviewed by Tony” line without his actual review.

**Prepared:** hub, three articles, scoped CSS, direct-contact links and this editorial handoff. **Applied:** local guide files and minimal landmark fixes. **Verified:** primary sources, structural/link checks, zero jsdom/axe violations with contrast excluded, and the limited mobile observation above. **Unverified:** final direct-message mobile flow, live publication and AI shutdown, indexing, message delivery and a named technical reviewer.
