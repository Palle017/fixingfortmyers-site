# Lead-growth release — September 24, 2026

Status: **published and verified**. Website release `46b1b543883d58eb1f5ed1d7ab258800cb31cefe` reached GitHub Pages and passed public readback at 00:38 UTC September 25 (8:38 p.m. Eastern September 24). See [production evidence](evidence/production.json). Previous verified baseline: `463cbd8ebb980a6416ceff0866a2272f55a8e9d6` (website implementation `5f4f9e5`). Active source remains `.worktrees/company-update`; the root broad rebuild stays parked. A documentation-only follow-up records this result.

## Applied to production

- Homepage contact comes before long company/service information. First-screen call/text actions and a persistent mobile contact bar reach Tony's approved number. The conventional form remains available, with editable SMS/email/copy alternatives and honest send-yourself instructions.
- Reduced 18 large service cards to six common repair needs and retained all 22 standalone service links in a compact directory. Removed duplicate promotional panels and the burnout video from the contact area. Existing service URLs, review evidence, brand styling and company information remain.
- Replaced unsupported homepage statistics/certification/comparative claims with the owner-confirmed specialty-tool-access benefit and a realistic repair-timing conversation. Genuine tool-use photos are still awaiting source material; existing imagery is not newly certified as documentary evidence.
- Rewrote the three original symptom articles and added overheating and flashing-check-engine articles. Five separate articles, hub, normal HTML links, relevant service backlinks, descriptive titles, canonicals, structured data and sitemap entries are prepared. See [the query/page map](SEO-CONTENT.md).
- A fixed, allowlisted last-guide/service label can follow a visitor into the editable text draft. It is explicitly page context, not proven acquisition attribution. It never includes arbitrary query parameters, referrers or personal URL content. The privacy notice explains this tab-session storage.
- CSS/JS asset version `20260924-growth-v2` prevents old cached client scripts from being paired with revised markup.

## Prepared operational work

Use [SOURCE-MATERIALS.md](SOURCE-MATERIALS.md) for the private incremental inventory and ranking workflow. Actual business files have not arrived: the first inventory is empty. Originals/annotations remain outside the public worktree, ignored by Git and excluded from Pages. The local indexer makes no network/model calls and adds no service cost. Its synthetic deduplication, change detection and permission gates passed; evidence is in the private intake folder.

[PAID-ACQUISITION-PLAN.md](PAID-ACQUISITION-PLAN.md) gives Google-first and Meta-second steps, concrete draft copy, targeting, delivery tests, spending limits and pause rules. The illustrative $300 Google / $100 Meta pilot is **not approved spending**. No ad accounts changed, campaigns launched, trackers added or customer messages sent. The parallel [campaign concept](AD-CAMPAIGN-IDEA.md) and [three specialty-tool approaches](SPECIALTY-TOOLS-MESSAGING.md) are research/drafts; they do not establish delivery, account eligibility or conversion lift.

The [copyable handoff prompt](LEAD-GROWTH-HANDOFF.md) joins ingestion, homepage work, search articles, advertisements and one-action ADHD guidance. Current static changes add **$0 in provider subscriptions** to the existing GitHub Pages arrangement; this is not a statement about the owner's other existing account charges.

## Verification and limits

- `npm test`: 25 synthetic tests passed, including fixed-recipient drafts, optional callback, unavailable AI fallback, source-label privacy and prepared inactive backend persistence/retries. Tests never contacted a real recipient. Structural checks covered 41 HTML pages and 89 JSON-LD blocks; see [evidence](evidence/structure.json).
- `node tools/audit-accessibility.mjs`: eight pages, zero detected violations. This jsdom audit excludes color contrast and cannot prove full accessibility. Browser review separately checks mobile rendering and keyboard interaction.
- Chrome local review at 390×844 and 320×740: homepage has no horizontal overflow; hero and sticky call/text links visible; synthetic form prepares editable fixed-recipient draft without mandatory phone/vehicle; overheating guide carries correct service and page context to form. Menu pointer/keyboard operation and Escape focus return pass. No console errors/warnings observed. Two Playwright pointer calls timed out at the tooling layer; direct browser click and keyboard checks succeeded.
- Live mobile verification at 390×844 confirmed the deployed asset version, call/text controls, zero horizontal overflow and zero Bay One UI. The live overheating guide led to the correctly prefilled form and editable fixed-recipient synthetic SMS draft; no message was sent and no received claim appeared. All five guide URLs and the hub returned 200; backend, internal docs and raw-material paths returned 404. Homepage source is 33% smaller than the prior baseline; this is HTML size, not a measured conversion or cellular-speed gain. See [mobile evidence](evidence/growth-mobile-review.json).
- Search Console in the currently connected browser opens the **welcome/add-website screen**, with no accessible site property shown. The previously used business browser is not connected in this turn. No property, DNS verification, sitemap submission or indexing request was made. Actual indexing, queries, impressions, ranking, search volume and received-lead lift remain unverified. Business Profile verification is a separate process.
- Google says a crawl request can take days to weeks and does not guarantee indexing. Titles, useful content, crawlable links and sitemaps make discovery possible, not certain: [Search Essentials](https://developers.google.com/search/docs/essentials), [recrawl guidance](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl).
- A high-urgency symptom does not prove an expensive repair or profitable job. Establish a 28-day page/query baseline and compare actually received, qualified and booked inquiries once authorized Search Console and the operational inbox can be inspected. Avoid publishing near-duplicate articles just to multiply keywords.

Bay One is off; automatic storage, notification, private recovery and provider delivery are still inactive. The static SMS path is usable but **does not satisfy the original durable website-intake requirement**. Physical-phone text rendering and actual delivery need an explicitly approved recipient test. No claim of production AI or notification success is made from local tests.

## Deploy, verify and roll back

The owner's instruction to roll out the website updates covers this static release. It does not cover advertising spend, DNS, backend activation or real messages.

1. From this worktree, run `npm test`, `node tools/audit-accessibility.mjs`, `node tools/version-assets.mjs --check` and `git diff --check`. Review the diff, preserve other work, and stage only the scoped release files.
2. Fetch `origin/main` and confirm the release descends from it. Commit and push `HEAD:main` without force. A rejected push requires inspection/merge of concurrent changes, not a forced update.
3. Wait for the GitHub Pages build to report `built` for the intended commit. Run `node tools/check-live.mjs COMMIT_SHA`. Verify homepage, five guides, hub, matching service links, sitemap, disabled configs and 404s for backend/docs/raw-material paths. A push alone is not proof of publication.
4. Check live mobile layout and the guide-to-form route without sending a real message. Record the time/commit in `docs/evidence/production.json` and this file. Google indexing remains separate.
5. If contact, navigation or availability wording regresses, revert the scoped website release with a new Git commit, preserving later unrelated work. Restore the prior static baseline behavior without resetting main or reactivating AI. Push normally, wait for Pages and verify contact plus disabled configs again. Keep backend/database untouched.

Maintenance: review delivered/qualified/booked inquiries weekly; check contact links and receipt truthfulness after every release; review Search Console queries monthly when access is available; update article facts when real repair evidence arrives. Recheck live review totals before changing them. Do not infer a retention/legal requirement from marketing material; private customer records follow the approved operational policy.

**Owner's one next action:** copy one existing folder of photos, clips or repair notes into `C:\Users\LP15\fixingfortmyers-site\source-materials\inbox`, then say “Index the new source material.” No sorting or rewriting needed. Stop after the copy.

**Prepared:** private ingestion/ranking workflow, reusable handoff, Google/Meta campaign drafts and launch checks. **Applied:** static homepage, five guides, internal links, source context and privacy wording. **Verified:** local tests/accessibility/mobile checks, Pages build and live contact-draft path. **Still unverified:** Google indexing/rankings, real lead lift, physical SMS delivery, actual raw assets and ad-account readiness. Durable backend/notifications and Bay One remain inactive.
