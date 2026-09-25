# Symptom pages that lead to a repair inquiry

Prepared September 24, 2026. Five substantial symptom articles and a guide hub are implemented locally for release review. Three existing article URLs are preserved; two articles are new. Deployment and Google indexing must be verified separately.

The objective is **qualified inquiries Tony actually receives**, followed by booked work. A search impression, visit, call-button tap or prepared text is not a received lead. Urgent symptoms can lead to valuable diagnostic work, but urgency does not establish repair value; diagnosis may find a small repair. No revenue, search-volume or ranking forecast is implied below.

## Query and page map

These are plain-language query hypotheses based on the symptoms and current service list, not measured local search demand. Validate and refine them using this property's Search Console queries and received-inquiry records when available.

| Priority | Customer language covered on one useful page | Article | Related service / form key |
| --- | --- | --- | --- |
| 1 | Car won't start; clicking but won't start; cranks but won't start; won't start after a jump | [No-start guide](../repair-guide-car-wont-start.html), existing URL | No-start diagnosis / `no-start` |
| 2 | Car overheating in traffic; temperature rising at idle; losing coolant | [Overheating guide](../repair-guide-car-overheating.html), new | Cooling-system repair / `cooling` |
| 3 | Flashing check engine light; blinking light and shaking; rough running or lost power | [Warning-light guide](../repair-guide-flashing-check-engine-light.html), new | Check-engine diagnosis / `diagnostics` |
| 4 | A/C warm at idle; cold while driving but warm at stoplights; repeated recharge | [A/C guide](../repair-guide-ac-warm-at-idle.html), existing URL | A/C repair / `ac` |
| 5 | Battery keeps dying overnight; new battery dead again; recurring drain after parking | [Battery guide](../repair-guide-battery-keeps-dying.html), existing URL | Electrical diagnosis, battery and alternator service / `battery` |

Priority reflects the immediate need for help and fit with existing services, not an assertion that Google traffic or average repair revenue is highest in that order. The hub puts the stopped-vehicle and warning-light articles first. Keep related variations together rather than generate near-duplicate pages for each wording or neighboring city.

## What changed

- Titles and descriptions now state the symptom and Fort Myers relevance. Headings answer specific questions in the customer's language without inserting a city into every paragraph.
- Each article opens with a useful answer, clear safety escalation where relevant, and direct **Call Tony / Text Tony** actions. The conventional short form remains available to prepare a message. Customers need neither a diagnostic code nor a photo to contact Tony.
- Existing articles now explain the next diagnostic step and what details to send. The new pages cover overheating and flashing warning lights with primary automotive references. No made-up repair examples, owner credentials, tool ownership, prices or same-day promises were added.
- Normal HTML links connect the hub, all five guides and the appropriate existing service pages. Articles remain separate crawlable URLs with canonical URLs, Article and BreadcrumbList structured data. The hub's CollectionPage lists all five. The sitemap includes the new pages.
- Bay One remains disabled. Links select an allowlisted service only; they contain no customer information. The current form prepares a text and cannot confirm that Tony received it.
- Visible revision dates reflect this actual editing date. No author expertise, medical-style review claim, publication history, FAQ rich-result promise or review-star eligibility was invented.

The original no-start article referenced `ww1.aaa.com/.../14-reasons-why-your-car-wont-start`, which returned 404 during this review. Its source link now uses the primary `www.aaa.com` article found in current search results.

## Discovery and conversion checks

1. Keep the homepage's symptom links crawlable and visible to a mobile customer, alongside its primary contact actions. Link to the hub and useful individual articles with descriptive text.
2. Add a relevant article link from the matching no-start, electrical, A/C, cooling and check-engine service pages during their next targeted review. Avoid a full site redesign or changing established service URLs solely for keywords.
3. Verify HTTP 200, canonical URLs, indexable HTML, sitemap entries, readable mobile layout and working fixed-recipient call/text/form links after release. Neither a live URL nor a valid sitemap establishes Google indexing.
4. In an already authorized Search Console property, check Pages indexing and inspect the hub plus new URLs. Submit the sitemap if not already submitted, and request indexing only for the changed priority URLs where appropriate. Do not claim an indexing request guarantees inclusion. Do not create a second property or change DNS without authorization.
5. Establish a 28-day baseline by landing page and non-brand symptom query. Compare impressions, clicks and CTR separately from received inquiries, qualified inquiries and booked jobs. Low volume may require a longer window. Use those findings to improve a weak page before adding more.
6. While the site uses native SMS drafts, Tony or the approved business inbox must record actual received inquiries and source when known. Draft creation and call clicks are useful interaction counts only. Keep names, phone numbers and message contents out of analytics and URLs.

## Evidence to add from the source-material intake

The strongest next upgrade is one genuine, permission-cleared repair example for each productive topic: the original symptom, the test used, what was found and the repair performed. Add a relevant tool-in-use photo or a brief owner explanation, with an accurate caption. Label real examples as examples rather than typical or guaranteed outcomes. Do not say Tony authored or reviewed an article until he actually does. Redact customer details and confirm publishing permission before using source material.

An existing service page is evidence of what the business currently advertises, not independent verification of equipment, certification or every repair capability. Ask Tony about any specific claim before strengthening it. His broad specialty-tool access is a useful messaging lead; the exact inventory and benefits should come from the raw material or confirmation.

## Authoritative references

Google recommends helpful content, language customers use in prominent page elements, and crawlable links. It explicitly says meeting its guidance does not guarantee crawling, indexing or serving a page: [Search Essentials](https://developers.google.com/search/docs/essentials). The editorial approach follows [people-first content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content). A sitemap assists discovery: [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview).

Each public article contains its relevant sources. Core new-article references: [AAA overheating guidance](https://info.oregon.aaa.com/dealing-with-an-overheating-car/), [DENSO cooling fans](https://www.denso-am.eu/products/ac-engine-cooling/cooling-fans), [AAA warning lights](https://www.midstates.aaa.com/automotive/vehicle-warning-lights), [AAA check-engine explanation](https://www.aaa.com/autorepair/articles/the-check-engine-light-common-causes-and-how-to-fix-it), [AAA when to call for assistance](https://mwg.aaa.com/via/car/diy-maintenance-tasks), and [AAA diagnostic-code explanation](https://www.aaa.com/autorepair/codetranslator). These sources support general explanations and precautions, not an affiliation or certification for Perfect Timing.

Scoped checks passed for **6 guide pages, 6 JSON-LD blocks and 315 local references**: one main and H1 per page, unique IDs, exact canonical URLs, one sitemap entry per page, direct fixed-recipient call/text links, valid local references and links among all guides. All six sitemap dates are September 24, 2026, the date these files were edited. `git diff --check` passed for the owned content files. Integrated mobile and accessibility checks belong to the release evidence; source validation is not a rendered-browser or indexing test.

**Prepared:** five guides, hub, metadata, structured data, related links and sitemap. **Applied:** local files only at this stage. **Verified:** the scoped source checks above. **Unverified:** new production URLs until release readback, Search Console access/indexing, actual search demand, received-lead lift and booked-job value. Public AI stays off.
