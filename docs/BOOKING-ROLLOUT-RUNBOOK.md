# Booking rollout runbook — 24/7 penciled in → call Tony → verbally confirmed
**Owner decision 2026-10-17:** this rollout is **AI-vendor agnostic**. Any coding agent (Claude, Codex, Gemini, Copilot or another) or a human developer can execute it from this file alone. No step may depend on one AI vendor's chat, connector, memory or quota. Replaces `CODEX-BOOKING-ROLLOUT-HANDOFF.md` and `CODEX-FINAL-EXECUTE.md` (kept as pointers).

The customer journey is locked in [BOOKING-CONTRACT-V1.md](BOOKING-CONTRACT-V1.md). Evidence goes in [BOOKING-RELEASE-STATUS.md](BOOKING-RELEASE-STATUS.md) and [issue #67](https://github.com/Palle017/fixingfortmyers-site/issues/67). This runbook only says *how* to ship it.

## Rules for whoever executes this
- Do not redesign the journey, add a second form or scheduler, invent hours, auto-confirm, take payments or send customer messages.
- Ask the owner only for things that need the owner's own hands: a Google sign-in or consent screen, installing a production secret, or approving one synthetic live calendar write. Keep working on everything else.
- Claim only what you read back yourself. Mocked tests are not proof of a calendar write. Separate implemented, tested, deployed and verified live.
- Never put credentials, private backend source or customer data in this public repo, a chat prompt, browser JavaScript or email.
- Never POST to the live lead or media endpoints in checks (it creates a real lead and alerts Tony). `GET /healthz` is fine.
- Sync with `origin/main` before every change; ChatGPT, Codex, Claude, Raj and the owner all push here. One PR per change; `npm ci && npm test` and `node tools/audit-accessibility.mjs` must pass (discard their `docs/evidence/*` rewrites); confirm pages load live after merge.

## Where everything is (as of 2026-10-17)
| Part | Location | State |
| --- | --- | --- |
| Website (picker, acknowledgement, VIN, call-Tony, status line) | this repo, `index.html`, `request-a-repair.html`, `site.js` | **Live**, 242 tests |
| Cloud Intake calendar writer, D1 queue, signed status, confirm API | P15G2 `C:\Users\LP15\PerfectTiming-Pipeline\cloud-intake-customer-status-20261016`, commit `ccbfa1b` (ancestors `86e1a13`, `837872a`, `13ec4fb`) | Staged locally, **no git remote**, not deployed |
| Owner Dashboard "Tony verbally confirmed by phone" | P15G2 `C:\Users\LP15\PerfectTiming-Pipeline\owner-verbal-confirm-20261016`, commit `48986dc` | Staged locally, based on older source `c5943eb`, not deployed |
| D1 migrations | `drizzle/0002_medical_blindfold.sql`, then `drizzle/0003_puzzling_carmella_unuscione.sql` (additive) | Not applied |
| Google Calendar | existing secondary **Perfect Timing Shop** calendar | Owner can see it; no server access yet |

## Steps, in order
**1. Back up the staged source.** The two staged worktrees exist only on P15G2. Push each to a **private** git remote the owner controls (not this repo), after checking they contain no secrets or customer data.

**2. Read-only production inventory.** Record the live Cloud Intake and Owner Dashboard revisions, how each is deployed, applied D1 migrations, and a safe D1 backup or export. Check `GET /healthz` and current `main`.

**3. Google access (owner signs in once).** In an owner-controlled Google Cloud project: enable the Google Calendar API, create a service account `perfect-timing-calendar` with no project roles, and create one JSON key. In Google Calendar → Settings → Perfect Timing Shop → Share with specific people, add the service account email with **Make changes to events**. Store the key only as the backend's private secret `GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON` and the calendar's ID as `SHOP_CALENDAR_ID`. Standard Google service-account auth works from any host; nothing here depends on an AI vendor's connector.

**4. Deploy Cloud Intake with writes OFF.** Apply migrations 0002 then 0003 (preserve 0000/0001, customer rows, R2 media). Keep `SHOP_CALENDAR_WRITES_ENABLED` off. Deploy the staged source to the existing endpoint. Check health, an ordinary synthetic webform through a non-production or owner-approved path, media, retries and the Owner Dashboard handoff. Schedule the authenticated `POST /private/drain` recovery runner.

**5. One controlled tentative event (owner approves the test).** Turn `SHOP_CALENDAR_WRITES_ENABLED=true`. Submit one synthetic request for a future 2:17 AM. Verify one saved lead and exactly one private, transparent, tentative event under the same lead ID, with no phone, VIN, address or symptoms in the event. Re-submit and simulate a lost reply: still one event. Check DST, overlap (warning only), failure (status stays "pending") and retry. Rollback = writer off; never delete leads or migrations.

**6. Owner Dashboard confirm action.** Merge only the staged confirm components into the **current deployed** Owner Dashboard source (keep newer notes, stages, SEO, Beside, Zoho work). Configure `CLOUD_INTAKE_PRIVATE_TOKEN` and a 32+ character `APPOINTMENT_CONFIRM_TOKEN` on both servers. The action requires a signed-in owner attesting Tony actually spoke with the customer; a failed Google update returns pending, never a fake confirmation. Only then set `OWNER_CALENDAR_BOOKED_STAGE_GUARD=true`.

**7. Release proof.** Website ≥242 tests, Cloud ≥40 tests + build, Owner ≥94 tests + typecheck + build, plus the live synthetic receipts. Record commits, deployment IDs, migrations, the test event and its readback, the recovery runner and the rollback switch in `BOOKING-RELEASE-STATUS.md` and issue #67.

## Remaining single-vendor lock-in (read-only inventory on P15G2, 2026-10-17)
The backend code is standard Cloudflare Workers + D1 + R2 and works with any agent. The **hosting** is not neutral yet:
- Both private services are hosted on OpenAI's ChatGPT Sites (`*.prudhvi-pallempati.chatgpt.site`, project ids in each worktree's `.openai/hosting.json`) and can only be deployed through that platform's workflow. No wrangler or other deploy path exists on P15G2.
- Hostnames are hardcoded in Cloud Intake `src/worker.mjs:210`, `scripts/create-runtime-config.mjs:9`, and Owner Dashboard `app/api/appointments/route.ts:7`, `lib/appointment-stage-guard.ts:4`, `app/api/metrics/route.ts:4`.
- Private calls use the `OAI-Sites-Authorization` header (Cloud Intake `src/worker.mjs:219`; also `_website-intake/dashboard-sync/sync_dashboard.py` here).
- Owner Dashboard sign-in uses ChatGPT accounts (`lib/owner-access.ts:2-4`, `getChatGPTUser()` + `ALLOWED_EMAILS`); its build uses the Sites Vite plugin (`vite.config.ts:3,5`).
- Secrets live in the Sites secret store; the deployed source exists only in the two local worktrees and the Sites copy.

To finish going vendor-neutral: move both services to an owner-controlled Cloudflare account (deploy with `wrangler`), replace the ChatGPT login and the `OAI-Sites-Authorization` header with Cloudflare Access or an owner login, export Cloud Intake data through its bearer-protected `/private/leads` endpoint before cutover, and point `contact-config.js` at the new endpoint only after a read-back check. This is an owner decision; until it is made, steps 1-7 above run on the current hosting.

## Kickoff prompt (paste into any coding agent)
> Read `docs/BOOKING-ROLLOUT-RUNBOOK.md` and `docs/BOOKING-CONTRACT-V1.md` in Palle017/fixingfortmyers-site. Execute the runbook's next unfinished step exactly as written. Do not redesign the booking journey, deploy stale Owner Dashboard source, delete customer data, or claim a calendar write from mocked tests. Ask me only for a Google sign-in, a production secret, or approval of the one synthetic live calendar write. Record evidence in `docs/BOOKING-RELEASE-STATUS.md`.
