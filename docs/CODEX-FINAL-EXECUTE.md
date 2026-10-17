# CODEX EXECUTION HANDOFF — FROZEN
**Perfect Timing Auto Repair • prepared 2026-10-16**
**Only remaining work:** owner/provider Google account access, private Sites deployment, live Owner Dashboard source reconciliation, real integration proof and final release. Do not redesign.

## Locked customer contract
Customer selects ANY future date/time, **24/7**; provides name, callback number, year/make/model, optional VIN, symptoms, whether car drives, vehicle location and optional photos/video; explicitly acknowledges that appointment is **penciled in but NOT confirmed until Tony verbally confirms by phone**. Existing Cloud Intake saves ONE lead; backend creates ONE verified private tentative event on the EXISTING **Perfect Timing Shop** secondary Google Calendar. If provider cannot confirm entry, show "request saved; calendar placement pending". Customer calls **Tony at (239) 397-2048**. ONLY Tony's actual verbal phone confirmation, recorded by an authenticated Owner Dashboard action, makes it official. Conflicts warn Tony, never block a customer request. Do not add a competing scheduler, form, prices, payments or invented shop hours.

## Verified source and test ledger
**PUBLIC WEBSITE: already live.**
- Repo `Palle017/fixingfortmyers-site`, PR #77 merge `18c388a1284aaac26b0b5981245b26da787a0dd6` (check latest main before editing).
- `index.html`, `request-a-repair.html`, `site.js`: existing 24/7 picker/checkbox/optional VIN/call-Tony CTA and signed customer-status readback. Website says "penciled in" ONLY if signed backend receipt confirms a Google event; on failure status is pending.
- Website `npm test`: **242/242** passed locally and GitHub CI; independent live HTTP200 checks confirmed receipt-status markup/JavaScript after merge.
**PRIVATE CLOUD INTAKE: STAGED, NOT DEPLOYED.**
- Worktree `C:\Users\LP15\PerfectTiming-Pipeline\cloud-intake-customer-status-20261016`
- Branch `feat/customer-verified-pencil-status-20261016`, latest commit `ccbfa1b`, ancestor commits `86e1a13`, `837872a`, `13ec4fb`.
- `npm test` **40/40** and `npm run build` passed using synthetic D1 and mocked Google. NO Git remote. Site project ID `appgprj_6ac0bd5aa77481918cc6a603a3251492`.
- Additive migrations `drizzle/0002_medical_blindfold.sql` (appointment queue) followed by `drizzle/0003_puzzling_carmella_unuscione.sql` (phone-confirm audit).
- `src/shop-calendar.mjs`: OAuth/freebusy + idempotent tentative Google event; `src/confirm-calendar.mjs`: owner-verbal-confirm protected provider update; `src/appointment-status.mjs`: short-lived signed customer status receipt. `src/worker.mjs`: durable queue, retries and private APIs. Exact user-entered data remains in private lead, not Google event details.
- `GET /hooks/calendar/status/<leadId>` requires `X-Appointment-Status-Token` header tied to lead/expiry; only status flags, no PII.
- `POST /private/calendar/confirm/<leadId>` requires BOTH private Cloud Intake bearer + independent `X-Appointment-Confirm-Token`, actual Tony verbal attestation, and authenticated owner identity from Owner Dashboard. Atomic D1 record, provider If-Match ETag PATCH/readback, retry if uncertain.
**PRIVATE OWNER DASHBOARD: STAGED, NOT DEPLOYED.**
- `C:\Users\LP15\PerfectTiming-Pipeline\owner-verbal-confirm-20261016`
- Branch `feat/owner-tony-verbally-confirmed-20261016`, commit `48986dc`, project ID `appgprj_6abc24ce151881919044d4d19d7bf303`.
- `node --test tests/*.test.mjs` **94/94**, `tsc --noEmit` and `npm run build` passed. Contains `app/tony-phone-confirmation.tsx`, `app/api/appointments/route.ts`, `lib/appointment-stage-guard.ts` and small owner UI/lead API edits.
- **WARNING:** this worktree is based on earlier `owner-gbp-20261013` commit `c5943eb`. Deployed Owner Desk may have more recent Beside/GBP/SEO changes. Codex MUST reconcile these additions against actual CURRENT deployed Owner Desk source; NEVER directly deploy the older full checkout.

## Exact Codex execution order
**1. Read-only production inventory.** Read `docs/BOOKING-CONTRACT-V1.md`, this file and each staged private worktree. Identify actual live Cloud Intake and Owner Desk Sites revisions, current D1 migrations and a safe database backup. Verify Cloud Intake public `/healthz`, authenticated Owner Desk inbox, sync coverage, and current `main`. Do not reset the user's dirty `C:\Users\LP15\fixingfortmyers-site` checkout or overwrite running agents.

**2. One owner Google grant.** Owner-controlled Google Cloud project: enable Google Calendar API; create dedicated service account; in Google Calendar settings share the **existing Perfect Timing Shop** secondary calendar with the service account using **Make changes to events**. ChatGPT's own connected Calendar permission cannot serve the website. Enter JSON key as Sites private secret `GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON`; set private `SHOP_CALENDAR_ID` from actual secondary calendar. Never paste tokens/private keys in GitHub, ChatGPT, Codex prompts, browser JS or email. Owner must perform actual account consent/grant when required.

**3. Cloud deployment with writes OFF.** Apply additive D1 migrations **0002, then 0003**, preserving 0000/0001, customer records, R2 and backup. Keep `SHOP_CALENDAR_WRITES_ENABLED` OFF. Deploy complete private Cloud Intake staged source to EXISTING Sites project; test old webform, voice/media, retry/idempotency, Owner Dashboard handoff, ordinary signed receipt and health. Configure an authenticated scheduled `POST /private/drain` runner for outbox and provider recovery without reactivating unrelated Beside tasks.

**4. Controlled Google tentative event.** After owner-approved synthetic test and real Google credentials, turn `SHOP_CALENDAR_WRITES_ENABLED=true`. Submit a **synthetic future 2:17 AM** repair request; verify one saved lead + ONE private, transparent, tentative Google event with same lead ID, no phone/VIN/address/symptom PII; return "penciled in" ONLY on provider readback, otherwise pending. Test lost reply, replay/duplicate, off-hours/weekends, overlapping requests (warning only), DST gap/fallback clarification, scoped signed token, failure and retry.

**5. Owner Dashboard latest-source reconciliation.** Take only staged Owner components/API into current deployed Owner source (preserve newer owner notes/stages/SEO/Beside/Zoho). In private Owner Desk Sites secrets configure `CLOUD_INTAKE_PRIVATE_TOKEN` equal to authorized Cloud Intake private bearer; configure independent 32+ char `APPOINTMENT_CONFIRM_TOKEN` identically on Owner Desk and Cloud Intake private servers. The UI must show accurate penciled/pending status and require authenticated owner to attest Tony ACTUALLY spoke and confirmed. Failed Google update produces HTTP 202 pending, never fake confirmation; provider readback upgrades SAME event. ONLY after working set `OWNER_CALENDAR_BOOKED_STAGE_GUARD=true` to prevent generic "Booked" changes from bypassing Tony.

**6. Full release proof and rollback.** Run website at least **242 tests**, Cloud at least **40 tests + build**, Owner at least **94 tests + typecheck + build**, current-source tests, and actual authorized synthetic E2E receipts. Confirm Tony can read private vehicle/symptoms/VIN-unverified/location/photos in Owner Dashboard and open the matching lead from Google event reference without leaking PII. Record exact commits, Sites deployment IDs, applied migrations, test event and provider readback, recovery runner, rollback and defects in `docs/BOOKING-RELEASE-STATUS.md` and GitHub [issue #67](https://github.com/Palle017/fixingfortmyers-site/issues/67). Roll back by disabling Calendar writer and Owner stage guard; don't delete D1 rows, customer leads, migrations or unrelated source.

## Mandatory stop/go rules
- Coding and testing are authorized. Ask owner only for the exact missing provider grant, production secret installation, account login or risky live synthetic write. Continue other safe tasks without reopening business decisions.
- Never claim real calendar write from mocked tests; no credential leakage, no public backend/private source in GitHub Pages, no user PII in Google Calendar event.
- No event is official until Tony actually verbally confirms by phone. A marker is **not** service duration or mechanic capacity.
- Do not enable automatic texting, customer contact, payments, O'Reilly ordering, new Bay One permissions or alter 50%-off **oil-change labor** offer as part of this.
- If a precondition fails, leave current intake online, writer flag off and existing leads untouched.

## One Codex kickoff action
On P15G2 open PowerShell:
`Set-Location 'C:\Users\LP15\Codex\PerfectTiming-Booking-Plan-20261016'`
`codex`

Then paste:
"Read CODEX-FINAL-EXECUTE.md, START-CODEX-HERE.md, and public docs/BOOKING-CONTRACT-V1.md. Execute the already-coded private Cloud Intake and Owner Dashboard 24/7 penciled-in → Tony phone-confirmation rollout exactly as locked. Start with production read-only inventory and the minimal dedicated Google Calendar service-account grant. Do not redesign, deploy stale Owner Desk source, delete customer data, or claim calendar success from mocked tests. Work autonomously on safe stages; ask me only for actual provider or production credentials/authorization."

**FREEZE:** Everything in this ledger is prepared with ordinary ChatGPT tools; no Codex quota was used. Remaining work is connected-account grants, current production source/deployment and real end-to-end verification.
