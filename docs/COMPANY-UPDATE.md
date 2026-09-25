# Targeted company update

**Follow-on release:** homepage simplification and five symptom guides are tracked in [LEAD-GROWTH-RELEASE.md](LEAD-GROWTH-RELEASE.md). Counts below describe the original 24/7 release; shared evidence files now record the latest verification run. Backend and Bay One activation boundaries remain unchanged.

Status: **static production release published and verified** at 19:21 UTC September 24, 2026, commit `5f4f9e5015f02b3d3932ba0270d75678c0831f48`. [Production readback](evidence/production.json) confirms the Pages build, current public files and exclusion of private backend/docs paths. Baseline commit: `b23633d02d84e2113d8a54fb6b03287ba5688dcf` (`Present Perfect Timing as mobile auto repair with Tony imagery`). Worktree: `C:\Users\LP15\fixingfortmyers-site\.worktrees\company-update`.

## Final scope and owner direction

Keep Perfect Timing's existing visual design, branding, mobile contact actions, service content and useful URLs. Update confirmed business information, provide useful repair guides, and make the conventional contact path clear and truthful. The owner confirmed **24/7 availability** and Tony's published phone/text number, `(239) 397-2048`. The owner reports already using **Beside** for business communication. This does not promise immediate dispatch, every repair at every location, or a response deadline.

**The owner's latest instruction turns public Bay One OFF until the rest of the website is production grade.** This configuration is now published and verified in the live mobile browser: no launcher or dialog appears, and the live configuration explicitly disables it. Keep its source/design assets and prepared routing work for later review. Backend activation is stopped at the owner's request. The previous 8 a.m.–8 p.m. Eastern/AI-assisted after-hours wording is superseded for this release. Do not enable the assistant simply because its local tests pass.

The revised public hours disclosure is:

> \* After-hours repairs depend on the job, location and availability; Tony confirms all dispatches. Bay One AI intake is currently offline. Call or text Tony directly.

The corresponding hero qualifier is “Tony confirms availability and dispatch.” Keep the `24/7*` links and readable disclosure consistent across pages and business structured data. Do not publish the superseded AI-assisted after-hours claim.

## What is prepared

- Existing site design and service/location paths retained, with owner-confirmed hours and consistent disclosure.
- A [repair-guide hub](../repair-guides.html) and three articles: [no-start symptoms](../repair-guide-car-wont-start.html), [A/C warm at idle](../repair-guide-ac-warm-at-idle.html), and [recurring dead battery](../repair-guide-battery-keeps-dying.html). These use AAA and DENSO primary references and avoid prices, remote diagnoses and safety/dispatch promises. See [GUIDES.md](GUIDES.md).
- Fixed service request links: no-start and battery guides select `electrical`; the A/C guide selects `ac`; the hub selects `diagnostics`. No customer information is put into those URLs.
- A conventional form that prepares the customer's repair details for a native SMS draft addressed to Tony, with email and copy alternatives. The customer must open the messaging app and press Send. Preparing a draft, opening an app, or copying details is not a received inquiry, durable website record, confirmed message delivery or appointment.
- An editable, deterministic first-match [IF/ELSE rule list](../_website-intake/routing-rules.json) with [configuration and recovery instructions](../_website-intake/ROUTING.md). A customer-reviewed `stranded=yes` AND `starts=no` inquiry requests a call and text alert to Tony at any hour; ELSE preserves normal follow-up. Unknown answers remain reviewable.

Routing, durable alert preparation and private-inbox recovery are **source-only preparation**. No backend was deployed, no provider was provisioned, no paid usage was enabled, and no actual alert was sent. The public assistant is disabled regardless of the prepared model code. Do not describe the rule system as operational in production.

The temporary production architecture is **static site → customer-reviewed text draft → customer presses Send → Tony's existing business number**. Email/copy and direct calls provide alternatives. This uses the customer's messaging app; it does not establish an API connection to Beside or add a messaging subscription. The website cannot observe whether the customer sent the message or Tony received it. Original durable-storage, notification-outbox and recovery requirements remain unmet in the active contact path; they are deferred, not passed by the static release.

## Current infrastructure and business-profile evidence

The domain and baseline Pages deployment remain associated with the GitHub repository. The main-branch `CNAME` is `fixingfortmyers.com`. The historical browser configuration points to `https://redline.taild5f39d.ts.net:10000`; read-only checks from this workstation could not resolve/reach it. REDLINE is now identified under the different `tail68bd87` tailnet and reports offline. This is the observed access state, not proof of a global outage or permission to change Tailscale.

No live receiver/data path was found on this workstation, and the actual REDLINE database has not been inspected, migrated or restored. Do not create an empty replacement database or present a static release as repairing production intake. The final static form must use the direct-message path rather than claim to submit to that unavailable receiver. Locating and validating the real backend remains separate work after the owner's pause is lifted.

**Google Business Profile change applied:** profile ID `15150482990043040433` was saved with all seven days set to **Open 24 hours**. Google's management interface showed verification processing, with a stated wait of up to five days. Public visibility and final verification remain unconfirmed; the saved editor state is the evidence of application. Google's [hours instructions](https://support.google.com/business/answer/15300403?hl=en) document selecting 24 hours for each open day and saving. Do not save repeated edits merely because verification is still processing.

The owner confirmed that the profile's **Shopmonkey quote-request link is old and unused**. The Google Booking editor was inspected but displayed only the verification-processing notice and no accessible deletion control; it says edits become visible after verification. **The old link remains. Removal is prepared but blocked until the relevant profile controls become available after verification.** Return to the Booking editor then, remove the obsolete link, save and read back before reporting success. It is not a candidate CRM integration for this release. No Shopmonkey connection, Beside API connection or new CRM was activated.

GitHub Pages remains a static host for this targeted release. `_config.yml` explicitly excludes `_website-intake`, `tools`, `docs`, `tests`, `node_modules`, package files and README. The Node listener, SQLite database, rule execution, private inbox and Twilio credentials must never be part of public Pages output. A source commit does not restart a receiver on REDLINE.

## 24/7 market context and claim boundaries

Primary business pages checked September 24, 2026 already advertise around-the-clock service:

| Business source | Observed claim / scope |
| --- | --- |
| [Deep In It Mobile Mechanic: Fort Myers](https://deepinitfl.com/serviceareas/fort-myers) | Advertises 24-hour, seven-day mobile repair in Fort Myers. |
| [P&C Mobile Repair](https://pandcrepairs.com/) | Advertises 24/7 emergency calls for mobile truck and heavy-equipment work; this is a different service mix. |
| [Lou's Total Car Care](https://loustotalcarcarefl.com/featured-services/24-hour-mobile-mechanic-near-me) | Advertises 24-hour mobile mechanic service in Fort Myers. |

These are advertising observations, not independently tested response times or endorsements. They do not establish that Perfect Timing is the area's only 24/7 operator, nor predict lead volume. Owner-confirmed availability supports stating the hours; it does not support invented guarantees. FTC guidance says advertising claims need a truthful basis and material qualifications must be noticeable and understandable. See the [small-business advertising guide](https://www.ftc.gov/business-guidance/resources/advertising-faqs-guide-small-business) and [disclosure guidance](https://www.ftc.gov/business-guidance/blog/2014/09/full-disclosure). Keep the qualifier consistent with the headline rather than using it to contradict a dispatch promise.

## Verification and acceptance boundaries

The final run passed **24 synthetic tests: 14 backend and 10 frontend**, including public AI shutdown, native-message drafts, optional callback number and the parked routing/storage behavior. See [test evidence](evidence/tests.txt), [structure evidence](evidence/structure.json) (39 pages, 87 structured-data blocks, 1,479 local references) and [mobile browser review](evidence/mobile-review.json). The intentionally injected SQLite failure in the test log verifies that a storage failure cannot produce a success receipt.

| Check | Evidence / remaining work |
| --- | --- |
| Guide structure and links | Four guide pages parsed; JSON-LD, canonical URLs, IDs, local references and fixed service keys checked. Duplicate footer links/disclosures were removed. |
| Mobile guide layout | Integrated browser at 390 × 844 showed no horizontal overflow and three unobscured contact actions; electrical service prefill verified. This observation preceded the latest public-AI shutdown. |
| Structural accessibility | Six-page jsdom/axe-core audit at 19:16 UTC found **0 violations** after minimal landmark fixes: named navigation role on existing mobile contact bars, one main wrapper on the homepage and distinct region names. Color contrast was excluded because jsdom does not render; actual visual layout, focus and dynamic states require browser verification. See [accessibility evidence](evidence/accessibility.json). |
| Conventional form | Final mobile browser check passed: synthetic no-start/stranded details create an editable draft to +12393972048, callback number optional, no horizontal overflow, customer-Send instructions and no receipt claim. Native device app rendering and actual delivery remain untested. |
| Public AI | OFF in production by owner request, verified by live configuration and mobile browser readback. No model call was made. Reactivation requires new direction. |
| Rule/storage/alerts | Synthetic tests cover ordered decisions, persistence, duplicates, limits and failure/recovery. Real REDLINE persistence, actual notifications and paid-provider setup remain unverified and inactive. |
| Analytics | Anonymous measurements must distinguish clicks/draft preparation from delivery or storage. The active direct-message path cannot verify sent or received texts; do not record draft preparation as a stored lead. A tap-to-call is not proof of a completed call. |
| Google hours | Saved all seven days in management UI; verification processing and public visibility remain pending. |
| Production website | Static deployment, live readback, indexing and cache verification remain pending final release checks. |

Run `npm test` from this worktree with Node 24. Run `node tools/audit-accessibility.mjs` for the separate six-page structural accessibility audit; it does not execute site scripts or fetch external resources and does not add unit tests. `npm run preview` serves `http://127.0.0.1:18909` with isolated synthetic storage, mocked provider behavior, disabled alerts and noindex headers. Do not reuse production data or send real inquiries for local verification.

## Static deployment and rollback

1. Complete the final post-shutdown tests, static structure check, conventional mobile draft flow, email/copy fallback and accessibility review. Verify no public AI launcher or current AI-service claim remains, and that the draft screen clearly requires the customer to send it.
2. Review the exact release diff and commit. Confirm `CNAME`, Pages source settings and `_config.yml` exclusions. Publish only after the release owner's final checks; no DNS, hosting migration, backend restart or paid activation is included.
3. Read back the live homepage, representative service page, all four guide URLs, hours disclosure, call/text links, native-message draft and fallback states, canonicals and sitemap. Confirm Pages reports the intended release commit. Ensure excluded backend/configuration paths cannot be fetched publicly. Do not send a real text or email merely to test draft construction.
4. For a static rollback, create a new revert commit for the release rather than resetting or force-pushing shared history. Baseline reference: `b23633d02d84e2113d8a54fb6b03287ba5688dcf`. Verify the resulting Pages build and live content. Keep the owner's public-AI-off instruction in effect: the baseline originally exposed Bay One, so a rollback needs that shutdown retained unless the owner changes direction.
5. Preserve every live inquiry and runtime database. Reverting static files must not delete SQLite/WAL data or change Tailscale. Prepared additive backend tables can remain; any future receiver rollback must preserve data and reconcile uncertain alerts as described in [ROUTING.md](../_website-intake/ROUTING.md).

Google hours are a separate applied change. A website rollback does not undo them; do not revert owner-confirmed 24/7 hours without new direction.

**Prepared:** inactive routing/backend source and operational handoff. **Applied:** website release and saved Google hours. **Verified:** Pages release commit, live homepage/service/guide URLs/config/sitemap, backend/docs paths return 404, 24 synthetic tests, six-page structural accessibility audit, local editable draft to Tony, and published mobile form/Bay One shutdown with no horizontal overflow. **Unverified:** native texting-app rendering and real delivery, public Google hours visibility, removal of the old booking link, other directory updates, actual backend durability and Beside account integration. No real message was sent and no new paid service was activated.
