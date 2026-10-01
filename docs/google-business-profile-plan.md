# Google Business Profile and workshop showcase plan

Prepared September 28, 2026. **This is a plan for review, not a set of applied changes.** It makes no website edits, no Google Business Profile edits and no publication. Any customer-facing wording below is a **draft** until Tony approves it.

## Owner decisions, October 1, 2026 (latest: these win over anything below)

- **Positioning: a mobile repair shop.** Tony has all the tools: he is mobile equipped and also has a fully equipped workshop at Bayshore Ranch. Use "mobile repair shop" (not "mobile mechanic", which is also not a Google category). This replaces the workshop-only wording from September 28.
- **Address: hidden.** No street address on Google or on the site. The workshop is named only as "based at Bayshore Ranch". The street address was removed from every page footer, the `AutoRepair` schema, the Workshop page and Bay One's shop details (October 1). The Google profile stays a service-area business, which also means no re-verification.
- **Hours: Open 24 hours.** After normal business hours customers get Bay One (the AI assistant). If it's an emergency and Tony can manage it, he takes it.
- **Booking line: "Call Tony to coordinate drop-off or pick-up."**
- **Facebook: ignore it.** No action on either page.

Where a section below still says "workshop only", "address shown" or "bring or tow it in", these decisions win.

## Update, October 1, 2026 (earlier the same day)

- **No Google re-verification.** The owner does not want to trigger a re-verification, so **do not change the business name, address, address visibility or categories on the Google profile** for now. Those are the edits most likely to trigger one. *(Superseded: the address is now hidden on the website too.)* Edits that are safe to make on Google: photos, posts, the description, services, attributes, replying to reviews, and removing the Shopmonkey appointment link.
- **Photos.** The owner chose his photos; the others are already on the Google profile. Three welding photos are on the site: `tony-at-work.webp` (welding an exhaust flange: the page header image and the Workshop gallery), `workshop-wide.webp` (Tony in the workshop: the Workshop page header and "How a workshop job works") and `workshop-fabrication.webp` (stick welding, also used on Careers). Slots without a photo yet are **kept in the page but hidden** (`hidden` attribute, `data-photo` names the shot): the capability photos, the extra gallery shots, and both before/after sections (walnut blasting, paint correction). To turn one on, save the photo under its filename and remove `hidden`.
- **Merged to main** with PR #11. The old driveway and van images were deleted.

## Owner decisions (September 28, 2026)

| Question | Decision |
| --- | --- |
| Address | **Hidden (owner, Oct 1).** No street address on Google or the site; the workshop is named only as based at Bayshore Ranch. *(Sept 28 history: hidden, then briefly "show it"; the street address that went on the site was removed Oct 1.)* |
| Verification | The Google profile **is verified**. The edits in 1.0 step 2 can go ahead. |
| Business name | **Keep it exactly as it appears now.** It matches the signage. No change. |
| Hours | **Keep Open 24 hours.** After normal business hours Bay One answers; Tony takes emergencies when he can manage them (owner, Oct 1). |
| Service towns | **All 12 confirmed:** Fort Myers, Cape Coral, Lehigh Acres, North Fort Myers, Tice, Estero, Bonita Springs, Alva, Buckingham, Fort Myers Beach, Sanibel, Pine Island. |
| Categories | **Add all of them**, A/C and electrical included, plus detailing and paint (see 1.2). |
| Priority jobs | **Engine jobs, transmission jobs and no-start problems.** |
| Scope | **Confirmed:** engine rebuilds and replacements; transmission rebuilds and replacements; diesel; hot rods; restoration. **New:** paint work, buffing, paint correction and detailing. |
| Business phone | **(239) 397-2048** is the business line (Beside "Tony's Box", confirmed from the owner's Beside settings, Sept 28). **(239) 271-4854** is Tony's personal sign-in phone in Beside, not a business line. It should not appear on any listing. |
| Facebook | **Leave both pages as they are.** |
| Shopmonkey booking link | **Not confirmed removed.** The website has no Shopmonkey link (checked across all pages and scripts). Google's public Maps page can't be read without a browser session, and there's no owner access from here, so the owner needs to check it in the editor (Edit profile → Booking / appointment links). |

## Positioning update (September 28, 2026): superseded

On September 28 the plan was rewritten for a workshop-only model and three decisions were flagged as conflicting with it. The owner's October 1 decisions above replace that: Tony is a mobile repair shop, the address stays hidden, the hours stay 24, and the Facebook pages are ignored. No flags remain open.

## Starting facts

These facts come from the owner and the current `main` branch (after PR #12):

- **Business:** Perfect Timing Auto Repair LLC, (239) 397-2048, fixingfortmyers.com, fixingfortmyers@gmail.com.
- **Model:** a **mobile repair shop** (owner, Oct 1). Tony is mobile equipped and has a fully equipped workshop based at Bayshore Ranch in the Fort Myers area. Customers call Tony to coordinate drop-off or pick-up. Available 24 hours: after normal business hours Bay One answers, and Tony takes emergencies when he can manage them.
- **Workshop capabilities (owner-stated):** engine assembly, tolerance and timing checks, transmissions, walnut blasting (carbon cleaning), "and more". The full tool list has not been supplied yet.
- **The site shows no street address.** The footer and schema say "Fort Myers & Southwest Florida". The `AutoRepair` schema in every page has `areaServed` (Fort Myers, Cape Coral, Lehigh Acres, North Fort Myers, Tice) and no `address`. Bay One's shop profile says "Customers book an appointment and bring or tow the vehicle to Tony's shop; call or text (239) 397-2048 to book a drop-off time" (`_website-intake/public-chat.mjs`).
- **The profile already exists.** According to `docs/COMPANY-UPDATE.md`: profile ID `15150482990043040433`; all seven days saved as **Open 24 hours**; verification was **processing**; an old Shopmonkey quote link is still in Booking and must be removed once the controls unlock. `tools/CONTACT-AND-SEO-UPDATE.md` also says: "Do not add the future address there until it is ready for customer traffic."
- **Images:** the website's hero and workshop-section images are `assets/tony-mobile-diagnostics.webp` (plus `-small`), `assets/tony-mobile-engine-repair.webp` and `assets/perfect-timing-mobile-workshop.webp` (old file names; they show a driveway and a van). The last one is captioned on the site as an **illustration** ("Illustrative workshop setup"). None of them shows the real workshop.

**Claim boundaries for everything below:** no prices, no warranties, no guarantees, no certifications (ASE or otherwise), no brand affiliations, no "best" or "#1" claims and no review counts unless Tony confirms each one in writing. Where this plan says "only if true", leave the item out until the owner confirms it.

---

## Part 1 – Google Business Profile plan

### 1.0 Order of work

1. ~~Wait until verification completes.~~ **Done:** the profile is verified.
2. Now: remove the Shopmonkey link (the task already recorded as pending), then set the categories, service area, services, description and attributes **in one sitting**.
3. Photos and the first posts go up **after** that sitting, as the owner's material arrives.
4. Review requests start as soon as the profile is public (section 1.10).

### 1.1 Business name

Use the real-world name exactly as it appears on the vehicle, invoices and signage: **"Perfect Timing Auto Repair"**. Google discourages legal suffixes, so add "LLC" only if the signage and invoices consistently show it. Nothing else.

- **Do not** add "Mobile", "Fort Myers", "Engine Rebuilds", "24/7" or any other keyword or location to the name field. That is keyword stuffing. It breaks Google's guidelines and is a common reason profiles get suspended.
- Service words belong in categories, services and the description. They never go in the name.

### 1.2 Categories

Google lets you choose one primary category plus up to 9 additional ones (10 in total). The primary category carries the most weight. Add only categories that describe work Tony **actually does and wants more of**, and confirm each name in the category picker, because Google renames categories from time to time.

| Role | Category | Why / condition |
| --- | --- | --- |
| **Primary** | **Auto repair shop** | Matches the site's "fully equipped repair shop" wording and its `AutoRepair` schema. Covers the broadest set of repair searches, including no-start calls (which have no category of their own). |
| Secondary | **Engine rebuilding service** | Confirmed: rebuilds and replacements. A priority job. Supports `engine-repair-fort-myers` and `engine-rebuild-vs-replacement-fort-myers`. |
| Secondary | **Transmission shop** | Confirmed: rebuilds and replacements. A priority job. Supports `transmission-repair-fort-myers`. |
| Secondary | **Diesel engine repair service** | Confirmed. Supports `diesel-repair-fort-myers`. |
| Secondary | **Auto restoration service** | Confirmed: hot rods and restoration. Supports `hot-rod-restoration-fort-myers`. |
| Secondary | **Auto air conditioning service** | Owner wants it. Supports `ac-repair-fort-myers`. |
| Secondary | **Auto electrical service** | Owner wants it. Covers electrical, no-start and module work. Supports `auto-electrical-repair-fort-myers` and `no-start-diagnosis-fort-myers`. |
| Secondary | **Car detailing service** | New: detailing, buffing and paint correction. The site has no page for this yet (see 3.6). |
| Secondary | **Auto painting** (use this exact name only if the picker offers it) | New: paint work. If the picker has no painting category, list paint work as a service instead. Avoid "Auto body shop" unless Tony does collision repair. |

That comes to 9 of the 10 allowed. Set the primary category and all secondary ones in one sitting.

**Categories to avoid:**

- **"Mobile mechanic"**: Google has no such category (Google's Business Profile community forum has confirmed this repeatedly), and Tony is a repair workshop, not a mobile mechanic. Don't use "mobile" anywhere on the profile.
- **"Mechanic"**: generic, and it adds little on top of "Auto repair shop".
- **"Auto machine shop"**: only if the tool list shows that machining (boring, honing, decking, valve work) is done **in-house**. Tolerance measurement alone is not a machine shop.
- **"Auto body shop"**: implies collision repair. Use it only if Tony does that work.

Walnut blasting has no category of its own. It goes under **Services** (1.4).


### 1.3 Service area vs. showing the Bayshore Ranch address

Google distinguishes three setups:

| Setup | What customers see | Google's condition |
| --- | --- | --- |
| **A. Service-area business (address hidden)** – *owner's decision; see the flag below* | A shaded service area; no pin or street address | The business serves customers at their location and does not receive customers at its address. |
| B. Hybrid (address shown + service area) | A map pin at the workshop plus the service area | Customers are served at the address, the address is staffed during the stated hours, and there is permanent signage with the business name. Home-based businesses that only travel to customers must hide the address. |
| C. Storefront only | Pin and address | Customers come to you, and there is no service area. Fits the workshop model, but loses the 12-town service area. |

**Trade-offs of showing the Bayshore Ranch address (option B):**

| Upside | Downside / risk |
| --- | --- |
| A map pin can help the profile show up in map results for searches near the workshop, and it makes the workshop look real and permanent. | **The hours conflict.** The profile says Open 24 hours. With a public address, Google and customers read that as "staffed at the workshop 24/7". That is not true and is a common reason for suspension. The address hours would need to change to real drop-off hours. |
| Customers can drop off vehicles for workshop jobs without a phone call to get directions. | **Drop-ins.** People will show up unannounced, including at night, which is a problem for security and for the people living nearby. |
| It matches a future site address (NAP consistency) once the website shows it. | **Privacy / zoning.** If Bayshore Ranch is residential or shared land, showing it publishes where Tony lives or works, and a public-facing repair business there may break zoning, HOA or lease rules. |
| | **Re-verification.** Changing the address or visibility usually triggers another round of verification, and the profile is only just getting through the first one. |
| | **Ranking radius.** A shown address anchors local ranking to that point. Bayshore is on the north-east side of the area, so Cape Coral and South Fort Myers searches may rank the pin lower than a clean service-area profile does. |

**Decision (owner, Oct 1): option A, address hidden.** The profile stays a service-area business with the 12 towns, and the workshop is named only as based at Bayshore Ranch. This fits a mobile repair shop and needs no re-verification. *(On Sept 28 the decision briefly moved to option B; that is reversed.)*

**Not doing (Oct 1):** showing the address on Google. The street address has been taken off the website again.

**When to revisit option B:** only if **all** of these hold: (1) the workshop is a lawful place to receive customers (zoning, lease, HOA), (2) someone is there during fixed, published drop-off hours, (3) the owner accepts people arriving without an appointment, and (4) there is signage at the entrance. Then show the address with **real** drop-off hours, and cover 24/7 phone and Bay One availability in the description and in posts rather than in the hours field.

**Service areas to enter (option A, owner-confirmed):** Fort Myers, Cape Coral, Lehigh Acres, North Fort Myers, Tice, Estero, Bonita Springs, Alva, Buckingham, Fort Myers Beach, Sanibel, Pine Island (12 of the 20 allowed). The site's `areaServed` currently lists only the first five, so it needs the other seven (see 3.4). Keep the list to places customers actually come from. Google allows up to 20 service areas, and the whole area should be within about 2 hours' drive of the base. (Google describes a service area as where the business serves customers. For a shop customers visit, the towns tell Google where customers come from; if the profile moves to option B, keep them there.)

### 1.4 Services list

Enter services under each category. Pick the ones Google predefines where they match; add **custom services** for the rest. Leave **price blank** on every service. Each service description is a draft and stays factual; nothing is published until Tony approves it.

**High-ticket / workshop work (list first):**

| Service | Draft service description (no prices) | Evidence needed |
| --- | --- | --- |
| Engine rebuild | "Engine teardown, inspection and reassembly in Tony's workshop, including tolerance and timing checks. We explain rebuild vs. replacement before work starts." | Confirmed; photos of engine assembly |
| Engine replacement | "Replacement engine sourcing and installation, with the engine removed and installed in Tony's workshop. We review options with you first." | Confirmed; engine hoist/stand in the tool list |
| Engine timing repair | "Timing chain and belt service with timing verification in the workshop." | Timing tools in the tool list |
| Transmission rebuild / replacement | "Transmission diagnosis, rebuild or replacement in Tony's workshop." | Confirmed; transmission jack in the list |
| No-start diagnosis and repair | "Car won't start? Book a time and tow it in. Tony finds out why in the workshop: battery, starter, fuel, ignition, security or wiring faults." | Priority job; mirrors `no-start-diagnosis-fort-myers` |
| Walnut blasting (intake carbon cleaning) | "Walnut shell blasting to remove carbon build-up from intake valves, common on direct-injection engines." | Walnut blaster in the list; before/after photos |
| Diesel repair | "Diesel diagnostics and repair in Tony's workshop." | Confirmed; platforms to be listed if Tony wants |
| Hot rod and restoration | "Engine, drivetrain and mechanical work on hot rods and restoration projects." | Real project photos with the owner's permission |
| Race car modifications | Only if current. It mirrors `race-car-modifications-fort-myers`. | Tony confirms |

**Paint and detailing (new):**

| Service | Draft service description | Evidence needed |
| --- | --- | --- |
| Paint work | "Automotive paint work. Ask about your vehicle and the area to be painted." | Photos of finished work; scope (spot repair, panels, full resprays?) |
| Paint correction and buffing | "Machine polishing to remove swirls, scratches and oxidation from the paint." | Before/after photos |
| Detailing | "Interior and exterior detailing." | Tony to say which packages he offers (no prices on Google) |

**Everyday repairs (all in the workshop):** diagnostics / check engine light, no-start diagnosis, brake repair, battery replacement, alternator and starter, A/C repair, electrical repair, cooling system, fuel system, suspension and steering, exhaust, module programming, oil change, pre-purchase inspection. These mirror the site's service pages, so each service matches a page that already exists.

Do not add a service the site doesn't back up or Tony doesn't want to do.

### 1.5 Business description (draft, 750-character limit)

> Perfect Timing Auto Repair is a mobile repair shop serving Fort Myers, Cape Coral, Lehigh Acres and nearby Southwest Florida. Tony is mobile equipped and has a fully equipped workshop at Bayshore Ranch for the bigger jobs: engine and transmission rebuilds and replacements, engine assembly with tolerance and timing checks, walnut blasting to clean carbon from intake valves, diesel repair, hot rods and restoration. He also handles no-start problems, diagnostics, A/C, electrical and brakes, plus paint work, buffing, paint correction and detailing. Call Tony to coordinate drop-off or pick-up. Available 24 hours: after normal business hours our AI assistant answers, and Tony takes emergencies when he can.

About 710 characters, under the 750 limit (owner's Oct 1 positioning). It has no URL, no price, no promotional language and no phone number (the phone has its own field). All the services named are owner-confirmed.

### 1.6 Other profile fields

- **Phone:** (239) 397-2048 (primary). Keep it identical to the site.
- **Website:** `https://fixingfortmyers.com/`. Add UTM tags (`?utm_source=google&utm_medium=organic&utm_campaign=gbp`) only if someone will actually read the analytics.
- **Booking / appointment link:** remove the old Shopmonkey link (pending). Replace it with `https://fixingfortmyers.com/#contact` only if Tony wants web requests from Google. Otherwise leave the field empty.
- **Hours:** keep **Open 24 hours** (owner's decision) only while the profile is a service-area business (option A) and only while the site's 24/7 disclosure is true ("Outside 8 a.m.–8 p.m. Eastern, Tony is assisted by Bay One AI. After-hours repairs depend on the job, location and availability; Tony confirms all appointments."). If Tony can't actually answer or return calls overnight, switch to real hours. Google treats hours that aren't true as misleading. If the address is ever shown, the hours must become real drop-off hours (flagged at the top).
- **Opening date:** only if the owner gives a verified date.
- **Social links:** the existing Facebook page (`facebook.com/profile.php?id=61574375434643`).

### 1.7 Attributes

Set **only** those the owner confirms. The ones likely to apply:

| Attribute | Default until confirmed |
| --- | --- |
| Onsite services (serves customers at their location) | **Yes, for emergencies** Tony can manage (owner, Oct 1). Confirm with Tony before turning it on. |
| Online appointments / requests | Yes, if the website request path is kept as the booking link |
| Payments: credit cards, debit cards, NFC/mobile pay, cash, checks | Ask. Set only the methods Tony accepts. |
| Self-identified attributes (veteran-owned, family-owned, Black-owned, women-owned, Latino-owned, etc.) | **Only** if the owner chooses to self-identify |
| Language(s) spoken | Ask (e.g. Spanish) |
| Accessibility (wheelchair-accessible entrance, parking, restroom) | Customers now visit to drop off, so ask Tony and set only what is true |
| Warranty-type or certification attributes, if offered | **Leave blank** until Tony supplies written confirmation |

### 1.8 Photo shot list for Google

Upload these as soon as they are available, spread over several weeks rather than all at once. The same photos feed the website (Part 3). Details of how to shoot them are in the Part 2 checklist.

| # | Photo | GBP slot |
| --- | --- | --- |
| 1 | Logo (square, from `assets/pt-logo-new@2x.png`) | Logo |
| 2 | Tony working on a customer's vehicle in the workshop bay, a real job | Cover (first choice) |
| 3 | Wide shot of the workshop interior: lift, benches, tool storage | Cover (alternative) / Interior |
| 4 | Engine on a stand mid-assembly | Work |
| 5 | Measuring tools on an engine part (micrometer, bore gauge, Plastigage) | Work |
| 6 | Timing set-up: timing tools installed, marks aligned | Work |
| 7 | Transmission on a jack or bench | Work |
| 8 | Walnut blasting: the machine, then the intake valves **before** and **after** | Work (strong post material) |
| 9 | Diagnostic scan tool with live data (VIN and plate redacted) | Work |
| 10 | Drop-off area where customers park or a tow truck unloads, with no street signs or numbers | Exterior |
| 11 | Workshop exterior **without** street signs, house numbers or landmarks (under option A) | Exterior |
| 12 | Tony portrait: plain background, good light | Team |
| 13–20 | Real completed jobs, one per high-ticket service, with owner permission | Work |

Rules: real photos only. **No stock images, no AI-generated images** and no illustrations passed off as real (the current `perfect-timing-mobile-workshop.webp` is an illustration and must not go on the profile). Blur plates, VINs, faces of customers and anything that reveals the workshop address. **Strip GPS/EXIF location data** before upload if the address stays hidden.

### 1.9 Posts cadence

- **One post per week** for the first 8 weeks, then **every 1–2 weeks**. Use the "Update" type (Offers only for a real, owner-approved offer; Events only for real events). Update posts drop out of prominence after about a week, so a steady flow matters more than any single post.
- Each post: one real photo, 80–200 words, one call to action ("Call" or "Learn more" linking to the matching service page).
- **Priority:** at least every other post is about **engines, transmissions or no-start problems**, the jobs Tony wants most.
- **Rotation (8-week starter):**
  1. Meet the workshop: wide shot with a caption naming what it's used for.
  2. Walnut blasting before and after on a real job, and why carbon builds up on direct-injection engines.
  3. Engine assembly in progress: what tolerance checks are and why they matter. Link `engine-rebuild-vs-replacement-fort-myers`.
  4. Diagnostics in the bay: what Tony checks first when a car comes in with a warning light. Link `auto-diagnostics-fort-myers`.
  5. Transmission job: from diagnosis to rebuild in the workshop. Link `transmission-repair-fort-myers`.
  6. Symptom guide: engine knocking (link `engine-knocking-noise-fort-myers`) or blue smoke (link `blue-smoke-burning-oil-fort-myers`).
  7. No-start: what Tony checks when a car is towed in that won't crank or won't fire, and how to book the tow-in. Link `no-start-diagnosis-fort-myers` or `repair-guide-car-wont-start`.
  8. Paint correction before and after, or a diesel or hot rod project, with the owner's permission. Then continue with the Florida heat: A/C and cooling check. Link `ac-repair-fort-myers` or `repair-guide-car-overheating`.
- Describe real work only. No invented outcomes, no "saved $X", no customer quotes without permission.

### 1.10 Q&A seed list

**Google has retired Business Profile Q&A.** It stopped taking new questions from late 2025 (industry reports put the API shutdown at November 3, 2025), and existing Q&A is frozen and being phased out. In its place, an AI "Ask" feature in Maps answers visitors' questions from the profile fields, reviews, photos and website content. The owner can't seed it directly, so these questions and answers go where that feature reads them: the **description** (1.5), the **service descriptions** (1.4), **posts** (1.9) and the website's **FAQ sections** (where answers 1, 3, 5 and 6 should be added, on the workshop page in 3.1 and the relevant service pages). If a Q&A box does still appear on the profile, post these there too.

1. **How do I get my car to you?** Call Tony at (239) 397-2048 to coordinate drop-off or pick-up. Perfect Timing is a mobile repair shop with a fully equipped workshop for the bigger jobs.
2. **Is it really 24 hours?** Yes. After normal business hours our AI assistant, Bay One, answers. If it's an emergency and Tony can manage it, he takes it.
3. **Can I drop my car off at the workshop?** Yes. The workshop is based at Bayshore Ranch. Call Tony to coordinate the drop-off; the details come when you book.
4. **Do you rebuild engines or replace them?** Both, depending on the engine and what the teardown shows. Tony explains rebuild vs. replacement before work starts.
5. **What is walnut blasting?** Walnut blasting cleans carbon build-up off intake valves using crushed walnut shells. It is common on direct-injection engines, which can build up carbon on the valves.
6. **Do you work on transmissions?** Yes, rebuilds and replacements, diagnosed and done in the workshop.
7. **Do you work on diesels?** Yes. Tell us the year, make, model and engine, and what it's doing.
8. **Do you work on hot rods and classic cars?** Yes. Hot rods and restoration projects are done in the workshop.
8a. **Do you do paint or detailing?** Yes: paint work, buffing, paint correction and detailing. Send photos of the vehicle and the area of concern.
8b. **My car won't start. What should I do?** Call Tony any hour and say what happens when you turn the key (clicks, cranks, or nothing). He'll coordinate a pick-up or drop-off, or take it as an emergency if he can.
9. **Where do your customers come from?** Fort Myers, Cape Coral, Lehigh Acres, North Fort Myers, Tice, Estero, Bonita Springs, Alva, Buckingham, Fort Myers Beach, Sanibel and Pine Island.
10. **What should I send when I contact you?** Your vehicle year, make and model, the symptoms and whether it starts or drives, so we know if it needs a tow.
11. **Are you available after hours?** Available 24/7. Outside 8 a.m.–8 p.m. Eastern, Tony is assisted by Bay One AI. After-hours repairs depend on the job, location and availability; Tony confirms all appointments.

(Answers 10–11 match wording that is already live on the site. Answer 9 adds the seven newly confirmed towns.)

### 1.11 Review-request process

**What Google allows:** asking every customer for an honest review, without incentives and without steering the rating or the content. **What it prohibits:** pressuring customers to review on the spot; fake reviews; reviews written by Tony, family or staff; paying or offering discounts or freebies for reviews; **review gating** (asking only happy customers, or screening first); and batch-asking people who were never customers.

**Process:**

1. **Copy the review link** from the profile (Read reviews → Get more reviews) once it is public. Google also generates a QR code for it (desktop browser only). Put the QR code on a card at the workshop and on invoices.
2. **Ask every customer** when the job is complete and the car is confirmed working. Ask in person, then send a text the same day:
   > "Thanks for choosing Perfect Timing. If you have a minute, an honest Google review helps other drivers find us: [link]. – Tony"
   Send it to **every** customer, whatever their mood. No "if you were happy" wording.
3. **Log it:** date, job type, link sent (Y/N). Don't record or chase the rating.
4. **One reminder at most**, 5–7 days later, only if the customer hasn't reviewed. Then stop.
5. **Reply to every review within 2 business days.** Thank positive reviewers and mention the service type naturally ("glad the walnut blasting sorted the rough idle"). For a negative review: stay calm and factual, offer to talk by phone, and share no customer details. Never argue.
6. **Never:** post reviews yourself, have family or friends review, swap reviews with other businesses, buy reviews, offer anything in return, or ask a reviewer to change a rating. Only flag a review for removal if it genuinely breaks Google's policies (spam, off-topic, conflict of interest).
7. **Website:** once real Google reviews exist, the site's testimonials section can link to the profile. Quote a review on the site only with the reviewer's permission.

---

## Part 2 – What to ask the owner for

### 2.1 Workshop photo and scan checklist

**General instructions (send to Tony as-is):**

- **Device:** a recent phone is fine. Use the main (1×) lens. Wide-angle (0.5×) only for the full-room shots. Clean the lens.
- **Orientation:** shoot **landscape** by default. Also shoot **portrait** for items marked (P) (for phone screens and Google posts).
- **Resolution:** full resolution, original files. No filters, no beauty mode, no heavy HDR. Don't send screenshots or WhatsApp-compressed copies. Use AirDrop, Google Drive or email "actual size".
- **Light:** daytime with the bay doors open plus the shop lights on. Avoid a bright doorway directly behind the subject. For close-ups, add a work light from the side (about 45°) so the shot shows metal texture without glare.
- **Clean-up:** a tidy bench reads as professional. Remove drinks, trash and personal items. Cover or move anything with the street address, house numbers, customer names, plates or VINs, or turn it away from the camera.
- **People:** Tony in shots is great. Other people only with their permission. Customers never, unless they sign a written permission.
- **Location data:** turn off location tagging in the camera, or we'll strip it before publishing.
- **Scan / walkthrough (optional but useful):** one slow 60–90 second landscape video walking the workshop from the door, all the way round, panning slowly at chest height. If Tony has a 3D-scan app (e.g. Polycam or a LiDAR iPhone), a room scan helps us plan the layout, but it is **not** for publication unless approved.

**Shot list:**

| # | Shot | Angle / framing | What it must show |
| --- | --- | --- | --- |
| W1 | Workshop wide, from the entrance | Standing in the doorway, wide lens, camera at chest height, level | The whole space: lift(s), benches, tool storage, floor |
| W2 | Workshop wide, reverse angle | From the back wall towards the door | Scale; bay doors; vehicle space |
| W3 | Lift with a vehicle raised | 3/4 view from the front corner | The lift working (proves undercar capability) |
| W4 | Engine on a stand, mid-assembly (P) | 3/4 view at engine height | Real assembly work; clean parts |
| W5 | Precision measuring close-up (P) | Tight, side-lit | Micrometer / bore gauge / dial indicator / Plastigage on a real part |
| W6 | Torque work | Hands and torque wrench or angle gauge on fasteners | Assembly to spec |
| W7 | Timing | Timing tools installed, marks visible | Timing-check capability |
| W8 | Transmission | On a transmission jack or bench | Transmission capability |
| W9 | Walnut blaster: the machine | Full machine in the workshop | The actual equipment |
| W10 | Intake valves **before** blasting (P) | Straight into the port, lit | Carbon build-up |
| W11 | Same valves **after** blasting (P) | **Same angle and light as W10** | The clean result (a true pair) |
| W12 | Diagnostic station | Scan tool or laptop showing live data (VIN/plate hidden) | Diagnostic capability |
| W13 | Tool storage | Toolboxes open, specialty tool drawers | Breadth of tooling, not clutter |
| W14 | Fabrication / welding area (if any) | Welder, bench vise, press | Fabrication capability |
| W15 | Shop press / bearing work (if any) | Press in use | Heavy-component capability |
| W16 | Engine hoist / cherry picker (if any) | Engine being lifted or hoist ready | Engine R&R capability |
| W17 | Diesel or hot rod project (if any, with owner permission) | 3/4 view of the vehicle in the bay | Specialty work |
| W18 | Drop-off area (P) | Outside the bay doors, **no** street numbers, signs or landmarks | Where customers park or a tow truck unloads |
| W19 | Tony portrait | Waist up, in the workshop, looking at the camera, soft light | The face of the business |
| W20 | Tony working (candid) | Mid-task, not posing | Authenticity |
| W21 | Workshop exterior | Wide, **no** street numbers, signs or landmarks | That it's a real building (use only if the address stays hidden) |
| V1 | Walkthrough video | As described above | Layout; reference only |

**Minimum set to go live:** W1, W3, W4, W5, W9–W11, W12, W18, W19. The rest can follow.

### 2.2 Tool and equipment list template

Send Tony this template (a spreadsheet or a filled-in copy of this table works). **Only list what Tony owns or has reliable, regular access to.** The "Access" column matters: we publish capabilities, not a borrowed-tool inventory.

Columns, the same for every group:

| Item | Make / model (optional) | Qty | Access (Own / Shared / Rent) | Location (Workshop / Elsewhere) | What it lets Tony do (plain words) | OK to name the brand publicly? (Y/N) | Photo # |
| --- | --- | --- | --- | --- | --- | --- | --- |

Groups (fill in the rows that apply; delete the rest):

1. **Lifts and vehicle handling:** two-post / four-post / scissor lift (capacity), floor jacks, jack stands, transmission jack, engine hoist, engine stands, wheel dollies.
2. **Engine: assembly and measurement:** outside micrometers, bore gauge, dial indicator and magnetic base, telescoping and small-hole gauges, feeler gauges, straightedge, Plastigage, torque wrenches (range), torque-angle gauge, ring compressor, valve spring compressor, cylinder hone, engine-specific timing kits (list platforms), compression tester, leak-down tester, borescope.
3. **Engine: machining (only if in-house):** boring bar, hone machine, valve/seat grinder, surfacing (decking) equipment, crank grinder. Otherwise note which machine shop Tony uses (internal only).
4. **Transmission and drivetrain:** transmission jack, transmission-specific tooling, fluid exchange / fill equipment, clutch alignment tools, axle/CV tools, differential setup tools (backlash and preload).
5. **Diagnostics and electrical:** scan tool(s) (with bidirectional / programming ability), J2534 or pass-through device, oscilloscope, multimeter, pressure/vacuum transducers, smoke machine, fuel pressure gauges, battery/charging tester, power supply for programming, circuit testers.
6. **Diesel (if applicable):** diesel scan capability, injector testing/removal tools, compression adapters, glow-plug tools.
7. **Cleaning and blasting:** walnut blaster (media type), media blast cabinet, parts washer, ultrasonic cleaner, induction/intake cleaning tools.
8. **Fabrication and metalwork:** welder(s) (MIG/TIG/stick), plasma cutter, grinder, bench vise, hydraulic press, drill press, tube bender, heat tools.
9. **A/C and cooling:** A/C recovery/recharge machine (refrigerant types), leak detector, vacuum pump, cooling system pressure tester.
10. **Brakes, suspension and steering:** brake lathe (if any), bleeder, ball-joint press, spring compressor, alignment equipment (if any).
11. **Air and power:** shop compressor, air tools, impacts, lighting.
12. **Safety and environment:** fire suppression, fluid disposal/recycling arrangement, spill kit. (Internal. It supports claims about proper disposal if Tony wants them.)

Plus four short questions for Tony:

- Which **three jobs** do you most want more of? (That decides the order of categories, services and posts.)
- Engine: **rebuild**, **replace**, or both? In-house machining, or sent out?
- Transmission: **repair/rebuild** in-house, or **remove and replace**?
- Diesel and hot rod/restoration: **regular work** or occasional?

---

## Part 3 – Showcasing the workshop on the website

Nothing below happens until the photos and tool list arrive and Tony approves the wording.

### 3.1 New page: `/workshop`

**New file:** `workshop.html` (served as `https://fixingfortmyers.com/workshop`, like the other extensionless URLs). Build it from an existing service-page template (e.g. `engine-rebuild-vs-replacement-fort-myers.html`) so it carries the nav, footer, 24/7 disclosure, Bay One loader and versioned assets that `tools/verify.mjs` and `tools/version-assets.mjs` check.

**Draft structure:**

1. **Hero:** H1 "Tony's Workshop" (draft). Sub-line: "A fully equipped repair workshop. Book a time, bring or tow the car in, and the work is done here." Hero image: W1.
2. **How a workshop job works:** three steps, 1) book: send the vehicle, the symptoms and whether it starts or drives, 2) drop off or tow in at the booked time, and Tony diagnoses it in the bay, 3) the plan and quote before work starts. Reuse the live home-page FAQ wording ("Perfect Timing is a fully equipped repair shop… Call or text (239) 397-2048 to book a drop-off time").
3. **Capabilities**, one block per tool-list group that Tony fills in: Engine assembly & measurement → Transmission → Diagnostics → Cleaning & walnut blasting → Fabrication → Lifts. Each block: a photo, 2–3 sentences in plain words about **what the equipment lets Tony do for the customer**, and a link to the matching service page. Name brands only where column "OK to name the brand" = Y.
4. **Walnut blasting before and after:** the W10/W11 pair side by side, with a factual caption.
5. **Gallery:** 6–10 remaining shots, lazy-loaded, with descriptive `alt` text.
6. **Visiting the workshop:** "Tony's workshop is based at Bayshore Ranch. Drop-off is by appointment: call or text (239) 397-2048 to book a time, and the drop-off details come with your booking." **No street address, map or pin** while the owner's option A decision stands (flagged at the top).
7. **CTA:** the existing contact pattern, `/?service=engine#contact`.
8. **Schema:** `WebPage` with `about` → `https://fixingfortmyers.com/#business`, `primaryImageOfPage` → W1. No `address` added.

### 3.2 Replace the driveway and van images

| Current asset | Where it is used | Replace with |
| --- | --- | --- |
| `assets/tony-mobile-diagnostics.webp` / `-small.webp` | Home hero `<img>` (`index.html`); hero background in `style.css`, `service-pages.css`, `site-updates.css`; `<link rel="preload">` in 30+ pages; inline background in `auto-repair-cape-coral.html` | A **real** photo: W1 (workshop wide) or W20 (Tony working), in 1536w and 720w WebP versions |
| `assets/tony-mobile-engine-repair.webp` | `index.html` About section; `careers.html` hero | W4 (engine on a stand) or W20 |
| `assets/perfect-timing-mobile-workshop.webp` (illustration) | `index.html` workshop section, captioned "Shop service by appointment. Illustrative workshop setup." | W1 (the real workshop). Change the caption to a factual one, e.g. "Tony's workshop, where engine and transmission work is done." |

**Approach:** add **new, descriptively named** files (e.g. `assets/workshop-wide.webp`, `assets/workshop-engine-assembly.webp`, `assets/tony-at-work.webp`, each with a `-small` 720w version) rather than overwriting the old files under names that would no longer describe the content. Then update the references. Delete the old files only after nothing refers to them (check with `grep -rn "tony-mobile-\|perfect-timing-mobile-workshop" --include=*.html --include=*.css .`). Keep each hero image around or under 200 KB and keep the `width`/`height` attributes to avoid layout shift. Strip EXIF location data.

### 3.3 Link to the workshop from the engine and transmission pages (and related pages)

In each of these pages, turn the existing sentence "Bigger jobs are done in Tony's fully equipped workshop." into a link to `/workshop`, and add a "Tony's Workshop" `service-mini-link` to the Related Services row:

- `engine-repair-fort-myers.html`
- `transmission-repair-fort-myers.html`
- `engine-rebuild-vs-replacement-fort-myers.html`
- `engine-knocking-noise-fort-myers.html`
- `blue-smoke-burning-oil-fort-myers.html`
- `diesel-repair-fort-myers.html`
- `hot-rod-restoration-fort-myers.html`
- `race-car-modifications-fort-myers.html`

On `engine-repair-fort-myers.html` and `transmission-repair-fort-myers.html`, also add one real workshop photo (W4 and W8 respectively) inside the page body, captioned factually.

### 3.4 Full list of files that would change

| File | Change |
| --- | --- |
| `workshop.html` | **New** workshop page (3.1) |
| `assets/workshop-*.webp`, `assets/tony-at-work*.webp` (names final once photos are chosen) | **New** optimized images |
| `index.html` + every page's `AutoRepair` schema | Add Estero, Bonita Springs, Alva, Buckingham, Fort Myers Beach, Sanibel and Pine Island to `areaServed`; update the "Service Area" section to match |
| `index.html` | Hero image, About image and workshop-section image swapped; workshop-section caption rewritten; "Tony's workshop" link in the "Shop repair questions" FAQ and the footer "Company" column; optionally add `image` array entries in the `AutoRepair` schema |
| `style.css`, `service-pages.css`, `site-updates.css` | Hero background URLs → the new hero image |
| All pages with `<link rel="preload" … tony-mobile-diagnostics…>` (about 30 service and city pages) | Preload URLs → the new hero image |
| `auto-repair-cape-coral.html` | Inline hero background URL |
| `careers.html` | Hero image |
| The 8 engine/transmission-family pages in 3.3 | Workshop link + Related link (+ one in-body photo on engine and transmission) |
| `about-perfect-timing.html`, `fort-myers-mechanic.html` | A short "Tony's workshop" paragraph and link |
| `sitemap.xml` | Add `https://fixingfortmyers.com/workshop` |
| `_website-intake/public-chat.mjs` | Optional: mention the `/workshop` page in Bay One's shop profile so the chat can point people to it |
| `assets/tony-mobile-*.webp`, `assets/perfect-timing-mobile-workshop.webp` | Deleted once no references remain |

**Checks before merge:** `npm test` (`tools/verify.mjs`: local links, the footer disclosure, JSON-LD); `node tools/version-assets.mjs --check` (asset versions); `node tools/audit-accessibility.mjs` for the new page; and a phone-width look at the home page and `/workshop`. After publishing: request indexing for `/workshop` in Search Console and add the same photos to the Google profile.

### 3.5a Paint and detailing on the website

The site has no page for paint, buffing, paint correction or detailing. Google categories work better when the website backs them up, so add a page `paint-correction-detailing-fort-myers.html` (built from the service-page template, and added to `sitemap.xml`, the home services grid and the footer). Before and after photos of real work are the most important content. Until that page exists, set the Google categories anyway; they just carry less weight.

### 3.5 What stays out of the site

- The street address (under option A), prices, warranties, certifications and brand endorsements, until Tony confirms them.
- Any photo showing customer identity, plates, VINs or the workshop's location.
- The 3D scan / walkthrough video, unless Tony approves publishing it.

---

## Staged on this branch (September 28, 2026)

Part 3 is now **built on top of the workshop wording on `main` (PRs #12–#18), with placeholder images**. Every photo slot shows a dark "PHOTO Wx (placeholder)" image. When the real photos arrive, save each one as WebP at **1536×1024** (landscape, 3:2) **under the same filename**, and remove the location data. No HTML changes are needed.

| Shot | File | Used on |
| --- | --- | --- |
| W20 Tony working in the bay | `assets/tony-at-work.webp` (+ `-small.webp`, 720×480) | **Hero on every page**, home page, Workshop gallery |
| W1 workshop wide | `assets/workshop-wide.webp` (+ `-small.webp`) | Workshop hero and gallery, home page workshop section |
| W3 lift | `assets/workshop-lift.webp` | Workshop gallery |
| W4 engine assembly | `assets/workshop-engine-assembly.webp` | Workshop, home About section, Careers hero |
| W5 measuring | `assets/workshop-measuring.webp` | Workshop |
| W7 timing | `assets/workshop-timing.webp` | Workshop gallery |
| W8 transmission | `assets/workshop-transmission.webp` | Workshop |
| W9 walnut blaster | `assets/workshop-walnut-blaster.webp` | Workshop |
| W10 / W11 valves before and after | `assets/workshop-valves-before.webp`, `assets/workshop-valves-after.webp` | Workshop before/after |
| W12 diagnostics | `assets/workshop-diagnostics.webp` | Workshop |
| W13 tool storage | `assets/workshop-tool-storage.webp` | Workshop gallery |
| W14 fabrication | `assets/workshop-fabrication.webp` | Workshop gallery |
| W17 project vehicle | `assets/workshop-project.webp` | Workshop |
| W19 Tony portrait | `assets/tony-workshop-portrait.webp` | Workshop |
| P1 / P2 paint before and after | `assets/paint-correction-before.webp`, `assets/paint-correction-after.webp` | Paint page, Workshop |
| P3 paint work | `assets/paint-work.webp` | Paint page |
| P4 detailed interior | `assets/detailing-interior.webp` | Paint page |

W18 (drop-off area) is for Google only for now. **Address hidden again (Oct 1).** The street address that went on the site with PR #11 has been removed from every footer, the `AutoRepair` schema, the Workshop page and Bay One's profile. Don't enter it on Google.

**What was built:** `workshop.html`, `paint-correction-detailing-fort-myers.html`, the image swaps in 3.2, the workshop links in 3.3 (every visible "Tony's fully equipped workshop" now links to `/workshop`), footer links on every page, all 12 towns in `areaServed`, Sanibel and Pine Island on the home service area, the sitemap, the About page, Bay One's service list, and the asset version bumped to `20260928-workshop`. Neither page describes Tony as mobile. Drop-off is by appointment, and the workshop is named only as "based at Bayshore Ranch".

**Do not merge while any placeholder is still in place.** The hero on every page currently shows the W20 placeholder. The old images (`tony-mobile-*.webp`, `perfect-timing-mobile-workshop.webp`) are no longer referenced and can be deleted once the real photos are in.

## Listings elsewhere that disagree (found September 28, 2026)

A public web search shows other directories with details that conflict with the site and the Google profile. Inconsistent name, address and phone details across directories confuse customers and weaken local rankings.

| Listing | What it shows | Fix |
| --- | --- | --- |
| [BBB](https://www.bbb.org/us/fl/fort-myers/profile/mobile-auto-repair/perfect-timing-auto-repair-llc-0653-90459208) | Phone **(239) 271-4854**; category "Mobile Auto Repair"; Fort Myers 33905 | Change the phone to (239) 397-2048 if 271-4854 is no longer the business line, and the category to "Auto Repair" (the business is not mobile) |
| [Yahoo Local](https://local.yahoo.com/info-235950242-perfect-timing-auto-repair-fort-myers/) | Phone **(239) 271-4854** | Same (Yahoo pulls from Yext/data partners) |
| [Yelp](https://www.yelp.com/biz/perfect-timing-auto-repair-fort-myers) | Couldn't be read (blocked); search snippets show it active with photos | Owner to check phone and service-area settings in Yelp for Business |
| [fortmyersdirections.com](https://www.fortmyersdirections.com/s/perfect-timing-auto-repair-llc--13037-second-street-fort-myers-fl-33905) | A **street address (13037 Second St)** | Ask for removal or correction if that address shouldn't be public |
| [Facebook page 100084118269910](https://www.facebook.com/100084118269910) | Titled **"Mobile Mechanic"**; a different page from the one the site links (`61574375434643`) | Owner decided to leave both pages as they are. That decision is flagged at the top: the title contradicts the workshop model. If the owner changes it, rename the page to "Perfect Timing Auto Repair" or retire it in favor of the linked page |
| [Nextdoor](https://nextdoor.com/pages/perfect-timing-auto-repair-llc/) | Business page exists | Check the phone and description |

A search summary also described Tony as a "certified mechanic". Don't repeat that anywhere until a certification is confirmed in writing.

## Sources and confidence

Checked September 28, 2026. Confirm the live category names, character limits and post behavior inside the Business Profile editor before relying on them. The editor reflects the current rules.

| Topic | Source | Confidence |
| --- | --- | --- |
| Name rules (no keywords/taglines; legal suffix only if used in the real world); hybrid/service-area rules; signage; home-based must hide the address; 20 areas / ~2 hours' drive; no prices or promotions in the description | [Guidelines for representing your business](https://support.google.com/business/answer/3038177?hl=en), [Service-area businesses](https://support.google.com/business/answer/9157481?hl=en) | Google primary |
| Review gating and incentives prohibited; asking for genuine reviews allowed | [Prohibited and restricted content](https://support.google.com/business/answer/2622994?hl=en) | Google primary |
| Review link and QR code | [Ask for reviews](https://support.google.com/business/answer/16816815?hl=en) | Google primary |
| Name changes may need re-verification; don't edit name/address/category while a verification code is pending | [Edit your Business Profile](https://support.google.com/business/answer/3039617?hl=en) | Google primary |
| "Mobile mechanic" is not a category | Google Business Profile community forum threads | High (forum, not a policy page) |
| Specific auto categories exist; 10-category maximum; 750-character description limit | Third-party category exports and SEO references | High, not Google-published. Check in the editor. |
| Q&A retired (late 2025) and replaced by AI answers | Industry coverage (e.g. [Accrisoft, Jan 2026](https://www.accrisoft.com/blog/2026/01/28/main/google-removes-business-profile-q-a-what-it-means-and-what-to-do-now/)) | High, date third-party |
| Post types and ~7-day prominence of Update posts | Third-party guides | Medium |

## Items needed from the owner

**Decisions**

1. ~~Address~~: **hidden** (Oct 1). Bayshore Ranch named in text only.
2. ~~Verified~~: yes. **Still open:** check in the profile editor that the Shopmonkey booking link is gone, and remove it if not.
3. ~~Business name~~: keep as is.
4. ~~24/7 hours~~: keep. Bay One after normal hours; Tony takes emergencies when he can.
5. ~~Service towns~~: all 12 confirmed.
6. ~~Top jobs~~: engines, transmissions and no-start.
6a. ~~Business phone~~: **(239) 397-2048** (Beside). **To do:** change BBB and Yahoo Local from 271-4854 (Tony's personal phone) to 397-2048. ~~Facebook~~: ignore.

**Scope confirmations** (yes/no, with details)

7. ~~Engine~~: rebuilds and replacements. (Still open: is machining done in-house or sent out? This only affects the "Auto machine shop" category.)
8. ~~Transmission~~: rebuilds and replacements.
9. ~~Diesel~~: yes.
10. ~~Hot rod and restoration~~: yes. (Race car modifications: still unconfirmed.)
11. ~~Categories~~: all of them, plus detailing and paint. **New:** photos of paint, correction and detailing work, and which detailing services Tony offers.

**Profile details**

12. Payment methods accepted.
13. Languages spoken.
14. Any self-identified attributes the owner wants shown (e.g. veteran-owned, family-owned). Only if they choose to.
15. Any warranty, certification or affiliation to mention, with written proof. Otherwise these stay off everything.
16. The opening date, if they want it shown.

**Material**

17. Workshop photos per the 2.1 checklist (minimum set: W1, W3, W4, W5, W9–W11, W12, W18, W19) as original files, with location tagging off.
18. The optional walkthrough video / 3D scan (V1), for planning.
19. The filled-in tool and equipment list (2.2), including the "Access" and "OK to name brand" columns.
20. Photos of completed jobs with the vehicle owners' permission (for posts and the gallery), especially a walnut-blasting before/after pair and an engine or transmission job.
21. Approval of the rewritten draft description (1.5), the service descriptions (1.4), the Q&A answers (1.10) and the review-request text (1.11).
