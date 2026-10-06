# Fixing Fort Myers — Simplify Plan ("get the basics right")

Owner goal (Raj): *Get the basics right, go through and simplify while retaining expert knowledge.*
Site goal: maximum calls, texts and repair-plan requests for high-ticket engine, transmission and diesel work.

- Audit base: `origin/main` @ `3eddeb2` (after PR #32 and PR #34), 48 published `.html` files, audited Oct 6, 2026.
- Phase 2 branch: `simplify/basics-plain-copy` (safe, non-structural copy/meta/CTA fixes; see §5).
- Out of bounds for this pass: form markup/fields, the `index.html` form section (`section.home-start`), `site.js` form logic, `contact-config.js`, `bay-one-*.js`, `_website-intake/`, `lead-notify.mjs` (PR #33 owns them). No pages deleted, merged, noindexed or redirected. Those are **proposals** in §4 for Raj to decide.

**Business facts used (nothing else invented):** Perfect Timing Auto Repair, owner/mechanic Tony. Engine, transmission and diesel repair in Fort Myers, by appointment at Tony's workshop in Bayshore Ranch (street address never published). Pickup only for vehicles that won't start. Phone/text (239) 397-2048, fixingfortmyers@gmail.com. "Request a repair anytime. Tony confirms every appointment." Hours schema Mon–Sat 08:00–20:00. ~4.8★ from ~70 Google reviews (as already on site).

---

## 1. Page inventory

Words = visible main-content words (nav, footer, form, scripts excluded). Near-dup % = share of the page's 5-word phrases that also appear on its most similar page (template boilerplate counts, so a 15–20% baseline is the shared service template). Inbound = internal links from other pages (footer links count once per page).

| Page | Purpose | Words | Near-dup % (closest page) | Nav | Footer | Sitemap | Inbound links | Recommendation |
|---|---|---:|---|:-:|:-:|:-:|---:|---|
| `index.html` | Home: engine/transmission/diesel, call/text/form | 1071 | 3% (workshop) | Y | Y | Y | 0 | Keep (core) |
| `engine-repair-fort-myers.html` | Engine service hub | 411 | 17% (cooling-system-repair) | – | Y | Y | 86 | Keep; make it the engine hub linking to 4 deep engine pages |
| `engine-rebuild-vs-replacement-fort-myers.html` | High-ticket decision page | 960 | 6% (engine-repair) | – | – | Y | 12 | Keep (core expert page) |
| `engine-knocking-noise-fort-myers.html` | Symptom → engine diag | 958 | 8% (diesel-repair) | – | – | Y | 9 | Keep (core expert page) |
| `blue-smoke-burning-oil-fort-myers.html` | Symptom → engine diag | 1165 | 6% (transmission-slipping) | – | – | Y | 8 | Keep (core expert page) |
| `head-gasket-overheating-damage-fort-myers.html` | Symptom → engine diag | 783 | 11% (transmission-slipping) | – | – | Y | 7 | Keep (core expert page) |
| `transmission-repair-fort-myers.html` | Transmission service hub | 365 | 21% (fuel-system-repair) | – | Y | Y | 55 | Keep; thinnest core page, sharpen |
| `transmission-slipping-fort-myers.html` | Symptom → transmission diag | 809 | 11% (head-gasket-overheating-damage) | – | – | Y | 6 | Keep (core expert page) |
| `diesel-repair-fort-myers.html` | Diesel service (Power Stroke/Duramax/Cummins) | 915 | 8% (engine-knocking-noise) | – | – | Y | 39 | Keep (core) |
| `workshop.html` | Tony’s workshop: tools, photos, capabilities | 843 | 5% (paint-correction-detailing) | – | Y | Y | 66 | Keep (core trust page) |
| `auto-diagnostics-fort-myers.html` | Diagnostics service | 517 | 13% (ac-repair) | – | Y | Y | 84 | Keep |
| `check-engine-light-diagnosis-fort-myers.html` | CEL diagnosis | 432 | 17% (cooling-system-repair) | – | – | Y | 36 | Keep; absorb exhaust/emissions |
| `no-start-diagnosis-fort-myers.html` | No-start (pickup-eligible) service | 403 | 17% (alternator-starter-repair) | – | – | Y | 20 | Keep; absorb alternator/starter |
| `cooling-system-repair-fort-myers.html` | Cooling/overheating service | 419 | 17% (fuel-system-repair) | – | – | Y | 17 | Keep (feeds head-gasket page) |
| `auto-electrical-repair-fort-myers.html` | Electrical faults | 517 | 13% (cooling-system-repair) | – | – | Y | 36 | Keep; absorb battery replacement |
| `module-programming-fort-myers.html` | Module programming | 497 | 14% (car-audio-installation) | – | Y | Y | 42 | Keep |
| `auto-repair-fort-myers.html` | Fort Myers local hub | 641 | 26% (auto-repair-north) | – | Y | Y | 78 | Keep as the single local hub |
| `fort-myers-mechanic.html` | “Mechanic” intent / meet the team | 627 | 6% (oil-change) | – | Y | Y | 36 | MERGE → about-perfect-timing (same intent; title clash with auto-repair-fort-myers) |
| `about-perfect-timing.html` | About Tony, license, profiles | 424 | 7% (fort-myers-mechanic) | Y | Y | Y | 64 | Keep; receives fort-myers-mechanic |
| `auto-repair-cape-coral.html` | City clone | 710 | 41% (auto-repair-lehigh-acres) | – | Y | Y | 46 | MERGE or NOINDEX → auto-repair-fort-myers (≈40% shared text) |
| `auto-repair-lehigh-acres.html` | City clone | 713 | 40% (auto-repair-cape-coral) | – | Y | Y | 46 | MERGE or NOINDEX → auto-repair-fort-myers |
| `auto-repair-north-fort-myers.html` | City clone | 739 | 39% (auto-repair-cape-coral) | – | Y | Y | 46 | MERGE or NOINDEX → auto-repair-fort-myers |
| `alternator-starter-repair-fort-myers.html` | Thin template service | 404 | 18% (no-start-diagnosis) | – | – | Y | 6 | MERGE → no-start-diagnosis |
| `battery-replacement-fort-myers.html` | Thin, low-ticket | 415 | 17% (car-audio-installation) | – | – | Y | 7 | MERGE → auto-electrical-repair (guide stays) |
| `exhaust-emissions-repair-fort-myers.html` | Exhaust/P0420 | 653 | 7% (check-engine-light-diagnosis) | – | – | Y | 3 | MERGE → check-engine-light-diagnosis |
| `fuel-system-repair-fort-myers.html` | Thin template service | 390 | 19% (transmission-repair) | – | – | Y | 7 | Keep for now; candidate MERGE → engine-repair |
| `ac-repair-fort-myers.html` | A/C service | 488 | 13% (auto-diagnostics) | – | Y | Y | 72 | Keep (seasonal demand) |
| `brake-repair-fort-myers.html` | Brakes | 480 | 14% (alternator-starter-repair) | – | Y | Y | 67 | Keep, low priority |
| `suspension-steering-repair-fort-myers.html` | Thin template service | 397 | 18% (alternator-starter-repair) | – | – | Y | 6 | Keep, low priority; candidate NOINDEX |
| `pre-purchase-inspection-fort-myers.html` | Thin template service | 431 | 17% (alternator-starter-repair) | – | – | Y | 4 | Keep, low priority |
| `oil-change-fort-myers.html` | Low-ticket maintenance | 768 | 6% (diesel-repair) | – | – | Y | 2 | NOINDEX (off-strategy), keep live |
| `car-audio-installation-fort-myers.html` | Off-strategy | 386 | 19% (battery-replacement) | – | – | Y | 1 | NOINDEX + drop from directory (1 inbound link) |
| `hot-rod-restoration-fort-myers.html` | Project cars | 410 | 20% (race-car-modifications) | – | – | Y | 6 | MERGE with race-car-modifications → one “hot rods & performance” page |
| `race-car-modifications-fort-myers.html` | Performance builds | 394 | 21% (hot-rod-restoration) | – | – | Y | 3 | MERGE → hot-rod-restoration |
| `paint-correction-detailing-fort-myers.html` | Paint/detailing (off-core) | 607 | 6% (workshop) | – | Y | Y | 38 | Keep live; remove from footer “Services” |
| `repair-guides.html` | Guides hub | 388 | 9% (repair-guide-car-overheating) | Y | – | Y | 104 | Keep |
| `repair-guide-car-wont-start.html` | Symptom guide | 712 | 18% (repair-guide-battery-keeps-dying) | – | – | Y | 10 | Keep |
| `repair-guide-battery-keeps-dying.html` | Symptom guide | 676 | 19% (repair-guide-ac-warm-at-idle) | – | – | Y | 10 | Keep |
| `repair-guide-ac-warm-at-idle.html` | Symptom guide | 618 | 21% (repair-guide-battery-keeps-dying) | – | – | Y | 8 | Keep |
| `repair-guide-car-overheating.html` | Symptom guide | 656 | 19% (repair-guide-ac-warm-at-idle) | – | – | Y | 9 | Keep |
| `repair-guide-flashing-check-engine-light.html` | Symptom guide | 709 | 18% (repair-guide-car-wont-start) | – | – | Y | 8 | Keep |
| `case-studies.html` | Repair proof | 421 | 2% (index) | Y | Y | Y | 63 | Keep |
| `careers.html` | Hiring | 312 | 2% (about-perfect-timing) | Y | Y | Y | 132 | Keep; move out of top nav to footer |
| `privacy-policy.html` | Legal | 1086 | 3% (sms-terms) | – | Y | Y | 53 | Keep |
| `sms-terms.html` | Legal (A2P) | 510 | 7% (privacy-policy) | – | Y | Y | 0 | Keep |
| `request-received.html` | Form receipt (noindex) | 209 | 2% (index) | – | – | – | 0 | Keep (correctly noindex, not in sitemap) |
| `data-privacy-policy.html` | Legacy stub → privacy-policy (noindex) | 8 | 0% () | – | – | – | 0 | Keep as stub |
| `404.html` | Not found (noindex) | 66 | 34% (about-perfect-timing) | – | – | – | 0 | Keep |
set()


**What the numbers say**
- **City pages are clones.** Cape Coral / Lehigh Acres / North Fort Myers share 39–41% of their text with each other, have no city-specific facts (we can't invent drive times or landmarks), and compete with `auto-repair-fort-myers` for the same "auto repair" intent.
- **About vs. "Fort Myers mechanic" overlap.** `fort-myers-mechanic` ("Your Fort Myers Auto Repair Shop") competed with `auto-repair-fort-myers` ("Auto Repair Shop in Fort Myers") for the same title. It also repeats the About page's "owner-led team, Tony checks every car" story.
- **The thin template services** (~400 words, 17–21% shared) are mostly low-ticket: battery, alternator/starter, fuel, suspension, car audio, oil change, race/hot-rod. Each one dilutes the engine/transmission/diesel focus and has 1–7 inbound links.
- **The real expert content is on the deep pages** (engine rebuild vs. replacement, knocking, blue smoke, head gasket, transmission slipping, diesel platforms; 780–1,165 words, ≤11% duplicate). Keep and sharpen these.

## 2. Basics checklist

| Basic | Before (main @ 3eddeb2) | Status after `simplify/basics-plain-copy` |
|---|---|---|
| One title pattern | Mostly `<Topic> in Fort Myers, FL \| Perfect Timing`. Outliers: workshop had a 3-part title; repair-guides was keyword-stuffed ("…& Auto Repair Shop Help…"); North Fort Myers title ≠ H1; 4 symptom titles were 67–73 chars | **Fixed** for about, fort-myers-mechanic, North Fort Myers, workshop, repair-guides, case-studies, blue smoke, knocking, head gasket, transmission slipping. The 5 symptom-guide titles (71–75 chars) are left for the guide editorial owner (docs/GUIDES.md) to shorten |
| One H1 that matches the title | 1 H1 on every page. Off-pattern H1s: "Meet Tony. Your Repair Shop.", "Real Repairs. No Fairy Tales.", "Your Fort Myers Auto Repair Shop" (clashes with `auto-repair-fort-myers`), paint H1 had a stray ", FL" | **Fixed:** "Meet Tony. Owner & Mechanic.", "Real Repairs. Real Records.", "Meet Your Fort Myers Mechanic", paint H1 made consistent |
| Meta descriptions | 8 over 160 chars; several used outdated "coordinate drop-off or pick-up" / "Drop-off or pick-up" / "paid pickup if it won't drive"; vague ("Confirm compatibility…") | **Rewritten on 33 pages:** `<Service> in Fort Myers: <the specific checks>. By appointment. Call or text (239) 397-2048.` All ≤160 chars except the homepage (163). Schema `description` values that copied the meta were updated to match |
| NAP consistency | Name/phone the same everywhere; location line said "Fort Myers & Southwest Florida · By appointment. Call Tony to coordinate drop-off or pick-up." | **Fixed:** footer line now reads "… · By appointment at Tony's workshop in Bayshore Ranch. Won't start? Ask about pickup." No street address anywhere (checked: `13037` appears on 0 pages) |
| One primary CTA (Call/Text + "Request a repair plan") | Hero: "Request a repair" + "Call". End-of-page box: "Book It / Schedule With Our Team", Phone, Email, a 7-town service-area list, "Request a repair" | **Fixed:** hero and guide buttons say **"Request a repair plan"** + Call. End box is now "Next Step / **Talk to Tony**": Call or text (tel + new `sms:` link), email, Where (workshop, by appointment, pickup for no-starts), "Request a repair plan". The top nav and the mobile sticky bar keep the short "Request a repair" label so they fit |
| Canonicals | Present and self-referencing on all indexable pages. `404` has no canonical (noindex, fine). `data-privacy-policy` → `privacy-policy` stub (fine) | No change needed |
| Sitemap / robots | robots.txt allows all + sitemap. Sitemap lists 45 URLs, every indexable page; the noindex pages (404, request-received, data-privacy-policy) are correctly left out. All lastmod values were 2026-10-01 | `lastmod` updated to 2026-10-06 for the 45 changed URLs. If §4 merges/noindexes are approved, remove those URLs from the sitemap at the same time |
| Image alt / size | No missing alts. Footer monogram alt was a slogan ("PT - Precision. Power. Perfection.") on 46 pages, with the brand name right next to it | **Fixed:** footer monogram is now decorative (`alt=""`); the brand text next to it carries the name |
| Page weight | Typical page: ~25 KB HTML + 84 KB CSS (5 files) + 57 KB JS + 39 KB images. `workshop.html` loads 654 KB of images (18 photos, lazy). About 7 MB of **unreferenced** assets are published (`bang-store.mp4` 2.7 MB, `pt-logo-new@2x.png` 1.5 MB, `mustang-burnout-intro.mp4` 1.2 MB, `pt-logo-new.png`, `new-shop-poster.jpg`, `bay-one-app-speaking.png`, `bay-one-original.png`, `og-card.jpg`) | Proposal only (§4.6): delete the unused assets; merge the 5 CSS files later |
| Broken / outdated claims | "Coordinate drop-off or pick-up" (41 pages), "Concierge pickup and return … paid add-on" (diesel, paint, workshop), "paid pickup if it won't drive", "Dealership quality … Because timing is everything" footer (37 pages), "dealership-level diagnostics" | **Fixed everywhere outside the form section:** pickup only for no-starts ("Won't start? Ask about pickup. If it runs but isn't safe to drive, have it towed in."), concierge add-on removed, hype footer replaced |
| Jargon / filler / hype | Generic template filler ("Good fit for…", "Great choice when you are tired of parts-cannon repairs", "spaghetti jungle", "stop the bleed before parts money gets torched", "That is the whole point", "not vibes", "gremlins", "because this is Florida"); one-line FAQ answers that say nothing ("Yes. Diagnostics are a major part of the service.") | **Fixed on 20 pages:** filler replaced with real diagnostic specifics (what gets tested, what the symptom pattern points to, when to stop driving). 31 thin FAQ answers rewritten, with FAQ schema kept in sync |
| Nav consistency | Service pages: About → `/#about` (a homepage section). Other pages: About → `/about-perfect-timing`, labeled "About Our Team" | **Fixed:** About always → `/about-perfect-timing`, labeled "About". The bigger nav cut is a proposal (§4.5) |
| Footer | "Services" column listed Paint & Detailing and Module Programming but not Diesel. "Meet the Team" and "About Our Team" pointed to two near-duplicate pages | **Fixed:** Services = Engine Repair, Engine Rebuild vs Replacement, Transmission Repair, Diesel Repair, Diagnostics, A/C, Brakes, All services. "Meet Tony" / "About the Shop". 9 pages (about, careers, case-studies, guides) still use an older "Proof / Get Help" footer; unifying it is a proposal |

## 3. Expert knowledge: what to keep and sharpen

Keep (and lead with) the real diagnostic specifics. They answer the customer's question and show Tony knows the work:
- **Engine:** compression, wet compression and leak-down before teardown. Top-end tick vs. bottom-end knock. Oil pressure. Head flatness/crack checks after overheating. Rebuild vs. replacement quoted after measurement.
- **Transmission:** fluid level/condition, codes, live data (gear commands, converter slip, temperature), solenoids, road test. Misfires or low voltage can feel like transmission faults. Slipping = heat = damage.
- **Diesel:** Power Stroke / Duramax / Cummins failure patterns. Injector balance rates, rail and fuel pressure, boost and turbo-vane data. Glow plugs and grid heaters for cold starts. EGR/DPF/limp mode.
- **Cooling / head gasket:** pressure test, combustion-leak (block) test, fan behavior at idle vs. highway, stop driving when the gauge climbs.
- **No-start / electrical:** crank vs. no-crank, voltage drop, parasitic draw, charging voltage, immobilizer/module communication.

Cut: hype ("dealership quality", "parts-cannon", "torched"), generic filler bullets ("Good fit for…"), repeated booking paragraphs (the same "call to coordinate…" sentence appeared up to 4 times on one page), unverifiable superlatives, and one-line "Yes." FAQ answers.

## 4. Recommended structure: proposals needing Raj's decision (NOT implemented)

GitHub Pages can't send real 301s. A "merge" here means: move the unique expert content into the target page, then turn the old URL into a stub with `<meta name="robots" content="noindex">`, `<link rel="canonical">` to the target and a meta-refresh (the pattern `data-privacy-policy.html` already uses), and remove it from the sitemap. "Noindex" means the page stays live and linkable but drops out of search and the sitemap.

### 4.1 Local pages (highest impact)
| Page | Proposal | Target | Why |
|---|---|---|---|
| `auto-repair-cape-coral` | MERGE (or noindex) | `auto-repair-fort-myers`, new short section "Driving in from Cape Coral, Lehigh Acres or North Fort Myers" | ~40% clone text, no unique local facts, competes with the Fort Myers hub |
| `auto-repair-lehigh-acres` | MERGE (or noindex) | same | same |
| `auto-repair-north-fort-myers` | MERGE (or noindex) | same | same |
| `fort-myers-mechanic` | MERGE | `about-perfect-timing` (retitle "About Tony, Fort Myers Mechanic") | Same intent as About; was a title clash with `auto-repair-fort-myers` (H1 already changed in this pass) |

*Lower-risk alternative:* keep the city pages and give each 2–3 real, owner-supplied local facts (which roads/bridges customers use, typical jobs from that area, customer reviews from there). Without those facts they stay thin.

### 4.2 Thin service clones
| Page | Proposal | Target |
|---|---|---|
| `alternator-starter-repair` | MERGE | `no-start-diagnosis` (pickup-eligible no-start page) |
| `battery-replacement` | MERGE | `auto-electrical-repair` (the `repair-guide-battery-keeps-dying` guide stays) |
| `exhaust-emissions-repair` | MERGE | `check-engine-light-diagnosis` (P0420 / O2 content fits there) |
| `race-car-modifications` | MERGE | `hot-rod-restoration` → retitle "Hot Rods, Restoration & Performance Builds" |
| `fuel-system-repair` | Keep for now; candidate MERGE | `engine-repair` |

### 4.3 Off-strategy pages (keep live, stop promoting)
| Page | Proposal |
|---|---|
| `car-audio-installation` | NOINDEX + remove from the homepage directory (1 inbound link) |
| `oil-change` | NOINDEX (low-ticket; keep live for existing customers) |
| `paint-correction-detailing` | Keep live/indexed (has unique photos), already removed from footer "Services" in this pass; has a pre-existing `check-clean-structure` failure (non-compact hero) to fix when touched |
| `suspension-steering-repair`, `pre-purchase-inspection`, `brake-repair` | Keep, low priority; revisit after a month of Search Console data |

### 4.4 Core pages to keep and tighten (next pass)
- `engine-repair` → make it the **engine hub**: short intro + 4 cards (rebuild vs. replacement, knocking, blue smoke, head gasket). Today it is a thin 411-word template.
- `transmission-repair` (365 words, thinnest core page) → hub for `transmission-slipping`. Add hard-shift / no-engagement / shudder sections using the same test-first specifics.
- `diesel-repair`, `workshop`, `engine-rebuild-vs-replacement`, `transmission-slipping`, `head-gasket…`, `blue-smoke…`, `engine-knocking…` → keep. Cut repeated booking paragraphs and lead with the symptom → test → decision flow.
- Homepage `section.home-start` (owned by PR #33): after #33 merges, change hero line "Won't drive? Tow it in, or ask about pickup." → "Won't start? Ask about pickup. Runs but unsafe to drive? Tow it in." (pickup is for no-starts only).

### 4.5 Navigation simplification
- **Top nav (all pages, one version):** Engine · Transmission · Diesel · Repair Guides · About | **Call/Text (239) 397-2048** · **Request a repair plan**. Move *Careers* and *Repair Proof* to the footer (Careers is not a lead path). This needs a small CSS re-check of PR #34's six-link nav rules, so it isn't in this pass.
- **Homepage service directory:** 27 flat links → 3 groups: *Engine & Transmission* (6), *Diesel*, *Diagnostics & Electrical* (5), plus a collapsed "Other services".
- **Footer:** use one footer on all 48 pages (9 pages still have the older "Proof / Get Help" footer).

### 4.6 Housekeeping
- Delete about 7 MB of unreferenced assets (list in §2). They are published but never loaded.
- Later: merge the 5 per-page CSS files (84 KB) into one versioned stylesheet.

## 5. What `simplify/basics-plain-copy` changes (safe, non-structural)
- Sitewide: hype footer tagline → plain positioning (37 pages). Footer NAP → workshop + "Won't start? Ask about pickup." Decorative monogram alt (46 pages). Footer Services column now high-ticket first. About nav link fixed.
- Primary CTA: hero and guide buttons say "Request a repair plan". End-of-page box is now "Talk to Tony" with Call or text (adds a `sms:` Text link), Where (workshop, by appointment, pickup for no-starts) and "Request a repair plan".
- Outdated claims: every "coordinate drop-off or pick-up", "concierge pickup … paid add-on" and "paid pickup if it won't drive" → pickup only for no-starts. Index FAQ and its schema updated (outside the form section).
- Expert copy: 31 thin FAQ answers rewritten with real diagnostic specifics (engine, transmission, diesel, diagnostics, check-engine, no-start, cooling, electrical, alternator/starter, battery, fuel, auto-repair hub, workshop, fort-myers-mechanic). FAQPage schema stays identical to the visible text. Filler "example" quotes rewritten. Generic "Good fit for…" bullets trimmed.
- Titles/H1/meta: 10 titles, 4 H1s and 33 meta descriptions made consistent (§2).
- Sitemap `lastmod` → 2026-10-06 for changed URLs.
- Test change: `tools/check-clean-structure.mjs` hero-label assertion `'Request a repair'` → `'Request a repair plan'` (it asserted the old copy).
- Not touched: form markup, `section.home-start`, `site.js`, `contact-config.js`, `bay-one-*`, `_website-intake/`, `docs/evidence/*`.
