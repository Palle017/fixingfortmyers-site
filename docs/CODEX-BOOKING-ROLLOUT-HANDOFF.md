# Codex implementation handoff — Perfect Timing 24/7 pencil-in to Tony-confirmed calendar
**Date:** October 16, 2026
**Status:** Prepared for immediate Codex execution; do not reinterpret the workflow.

## READ FIRST
1. `docs/BOOKING-CONTRACT-V1.md` in repo `Palle017/fixingfortmyers-site`. Treat as locked. If another doc or older GitHub issue conflicts, this file wins.
2. `docs/SHOP-24X7-PENCIL-BOOKING-POLICY.md` (previous local approval) and current `docs/BOOKING-RELEASE-STATUS.md`.
3. Private worktree `C:\Users\LP15\PerfectTiming-Pipeline\cloud-intake-calendar-20261016`, branch `feat/shop-calendar-conflicts-20261016`, commit `13ec4fb`; read `SHOP-CALENDAR-INTEGRATION.md` and run `npm test` (previously 34/34) plus `npm run build`. The private source has no git remote: **DO NOT push backend source or credentials into public GitHub**.
4. Existing website `C:\Users\LP15\fixingfortmyers-site` may be on a dirty unrelated worktree. Do not modify it; use a NEW isolated worktree based on up-to-date `origin/main`. Check other active branch/PR changes before editing.
5. Existing Owner Dashboard source location is likely `C:\Users\LP15\fixingfortmyers-site\owner-dashboard` (untracked in a historical worktree); find its correct deployed Sites project and **preserve customer records and operator state**. Never overwrite from a stale checkout.

## End-to-end behavior (DO NOT CHANGE)
Customer picks ANY local date/time 24/7 → enters vehicle/problem/contact/location/media → explicitly accepts friendly penciled-in/phone-confirmation acknowledgement → lead saved once → private tentative calendar event created once, promptly → visible "penciled in" only after Google write verified → direct Call Tony CTA at (239) 397-2048 → Tony speaks with customer → Tony-only Owner Dashboard confirm action upgrades SAME calendar event. Conflicts warn Tony, not reject customer requests.

## Execution order (shortest safe path)
**P0: Verify the environment and protect live data.** Check git worktrees/status, current GitHub Pages main/live, Cloud Intake Site ID/deploy source, Owner Dashboard Site and D1 migration history; record current runtime revision, export schema-only backup or safe D1 backup as allowed. Don't touch customer data or unrelated sessions. Check if the current Site deployment has a private cron/recovery runner.

**P1: Finish secure calendar credentials and migration.** Read-only inspect the owner-controlled secondary "Perfect Timing Shop" calendar; identify its calendar ID and the allowed Google Cloud project. The owner must complete the actual account consent/service account share if required. Enable Calendar API and share minimum necessary event-edit access with dedicated service identity. Install `GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON` as a **Sites secret**, `SHOP_CALENDAR_ID` in private config; never paste them into GitHub or browser. Apply *additive* D1 migration `drizzle/0002_medical_blindfold.sql` BEFORE enabling `SHOP_CALENDAR_WRITES_ENABLED=true`. Keep the flag OFF initially. If missing access, stop only that stage and provide the exact one action the owner must take—continue code/tests in parallel.

**P2: Deploy staged backend without disrupting intake.** Validate `src/payload.mjs`, `src/shop-calendar.mjs`, `src/worker.mjs` and queue table against current production code. Run all 34+ backend tests and build. Deploy via the *existing private Sites workflow*; verify health, normal synthetic webform response, Owner Dashboard handoff and media with the writer disabled. Set up authenticated recurring `/private/drain` recovery (do not unpause unrelated Beside scrapers).

**P3: Controlled tentative event test and activation.** Enable writer only after secrets and migration are verified. With explicit approval for a synthetic calendar event, submit controlled test date/time (e.g. 02:17), verify one Google event with status tentative/private/transparent, same lead ID and readable dashboard link, and no duplicate after retry/reload. Verify provider loss/readback recovery, DST gap/overlap needing a call, blocked but requested overlapping appointments (warn only), failure truthful status, and private details absent. If an event write cannot be confirmed, keep accepted lead and calendar queue pending, never tell customer event was created. Rollback = disable writer, do not delete leads/migration.

**P4: Customer-visible verified pencil-in state and Tony confirmation.** Existing frontend receipt currently reports lead saved only. Add a safe server status check keyed by a short-lived signed request token (not public lead enumeration), so it can show "PENCILED IN" only after provider readback; otherwise "request received; pencil-in pending — call Tony". Build an authenticated Owner Dashboard action labeled `Tony verbally confirmed by phone` with operator identity, timestamp, comment, real confirmed time/location/duration. First check provider event, then update same event safely with reconciliation on uncertain response; persist state/audit exactly once. No AI/chat/SMS/tel-click event auto-confirms.

**P5: Bay One assists within actual tools.** Determine whether the deployed Bay One instance can already collect vehicle year/make/model, VIN, symptoms, drivable/stranded status, location, media and desired date/time. Use its existing handoff to pre-fill/review the same form and preserve the same lead; enable no new auth/tools without real user-approved provider access. Bay One never claims it booked, called, confirmed or accessed calendar if it didn't. It should tell the customer clearly "penciled in pending Tony's verbal phone confirmation" only if backend status independently supports that.

**P6: Release evidence and recovery.** Run website `npm ci`, `npm test`, accessibility/mobile checks plus backend tests, deployed synthetic end-to-end test; make minimal PRs to main for public changes, and commit private backend via an owner-approved private process. Preserve rollback path, Cloudflare/D1 artifacts, original Owner Desk notes, message consent, live promotions, SEO and actual email/social integrations. Update `docs/BOOKING-RELEASE-STATUS.md` and GitHub issue #67 with per-component proofs, exact commits and blockers. Do not claim complete until all acceptance criteria in BOOKING-CONTRACT-V1 pass.

## Known constraints, stop/continue decisions
- No service-account write credentials have been proven installed. Connected ChatGPT Google Calendar access is not permission to run the server. The private backend branch is NOT deployed.
- The website already runs at fixingfortmyers.com with 24/7 time picker/acknowledgement; it does not prove tentative Calendar placement. No new Google Appointment Schedule, Square, Calendly, or competing form.
- Google Calendar secondary "Perfect Timing Shop" is owner-readable. That is not business-hours inventory.
- Backend staged event has nominal 15-minute marker, not a reserved repair bay/time estimate.
- If technical Google account action is required, request that exact step without treating Tony's business authority as a prerequisite to basic development. Owner has explicitly authorized proceeding with coding, tests and safe incremental public releases.
- Never claim any actual calendar event was created by mocked tests.
- Bay One public website assistant currently declares no booking tool. Investigate what its other actual accounts can do before promising execution.
- P15G2 machine instructions `C:\Users\LP15\AGENTS.md` apply: write Python/Node scripts to files (no inline PowerShell snippets); append-only task log `C:\Users\LP15\Codex\TASKS.md`.

## Operator report expected from Codex
Give 1) Live now, 2) Implemented but not deployed, 3) Exactly one next owner authorization action if blocked, 4) Tests and exact push/deploy receipts, 5) Next *single* engineering milestone. Do not replace working parts merely for architectural elegance.

**Reminder:** This is work to execute, not a brainstorm or a request for an AI to oversee Raj.
