# Perfect Timing booking rollout — evidence and remaining gates
**Snapshot time:** 2026-10-16, pending new work in this release. Append dated evidence; do not replace past receipts.

| Component | State | Evidence / action |
| --- | --- | --- |
| 24/7 customer time picker & acknowledgment | LIVE | Public PR #71 merged `dd4259bc`; website tests 238 pass |
| Single repair intake and Owner Dashboard lead handoff | EXISTING | Cloud Intake saved receipt; live end-to-end inventory needs recheck |
| Google secondary shop calendar | OWNER ACCESS CONFIRMED | Connected "Perfect Timing Shop", separate from primary; no credentials delegated to website |
| Automatic private tentative Google event | STAGED LOCALLY ONLY | Backend worktree `C:\Users\LP15\PerfectTiming-Pipeline\cloud-intake-calendar-20261016`, commit `13ec4fb`, 34 synthetic tests/build; no backend remote |
| Durable D1 queue & retry | STAGED, NOT MIGRATED | Additive `0002_medical_blindfold.sql`, requires private production migration before enabling flag |
| Google API service account/editor role | NOT VERIFIED/NOT INSTALLED | Need owner Google Cloud grant, Calendar API enable, server secret |
| Live test calendar write/readback | NOT EXECUTED | Requires credentials, migration, deployment, synthetic event approval |
| Owner Dashboard verbal confirmation action | NOT BUILT | Needs authenticated, audited event promotion tied to same lead |
| Bay One schedule actions | NOT WIRED IN PUBLISHED CHAT | Existing website assistant is customer intake only; no current calendar write tools |
| E2E recovery/monitoring | NOT PROVEN | Need private scheduled drain and provider/Owner Dashboard evidence |

## Safe incremental changes prepared in this release
- Canonical `BOOKING-CONTRACT-V1.md` freezes the customer experience and acceptance tests; root `AGENTS.md` directs future Codex work to this plan.
- `CODEX-BOOKING-ROLLOUT-HANDOFF.md` gives the exact phased work sequence and private production safety boundaries.
- Older fixed-hour/hosted-scheduler proposals clearly marked superseded; existing oil-promotion and parts/quote rules preserved.
- **Optional VIN** added inside the existing collapsed repair details, passed to the same private lead as *customer-entered/unverified*; no new booking backend, analytics leakage or VIN verification claim.
- Receipt primary action now says **Call Tony to confirm** when the customer requested a date/time; generic calls remain valid for ordinary repair inquiries.
- Local Node website test suite: **239/239 passed**. GitHub PR, main-branch merge and production readback are still pending at this snapshot.

## Immediate unblocker
Provision the **dedicated Google Calendar service account** with minimal event-edit permission **on Perfect Timing Shop only**, and arrange its JSON private secret in the existing Cloud Intake Site runtime. The user can approve the Google account grant in the provider UI. ChatGPT connector permissions do not automatically transfer to the website service.

## Rollout completion condition
No "calendar integrated" or "penciled in" claims until one authorized synthetic lead creates one verified tentative event, the real retry/outage path works, and Tony's real phone confirmation can be recorded as an explicit Owner Dashboard action. Keep details, provider emails and credentials private.


## Deployment verification update — 2026-10-16 (after PR #74)
- **Public source:** [PR #74](https://github.com/Palle017/fixingfortmyers-site/pull/74) passed GitHub Actions and was squash-merged to `main` at commit `3faf642138ce37b36ef2886e73af95442d5fee16`. The canonical booking spec, AGENTS.md and Codex handoff are in main.
- **Live website:** Independent cache-busted HTTP 200 checks of `https://fixingfortmyers.com/` and `/site.js` verified the optional VIN field and conditional “Call Tony to confirm (239) 397-2048” receipt action. The 24/7 picker and verbal-confirmation acknowledgement remain live. Local 239/239 tests and GitHub CI passed. VIN is customer-entered/unverified and stays in private lead details, not analytics.
- **Local backup for Codex:** `C:\Users\LP15\Codex\PerfectTiming-Booking-Plan-20261016\` contains the locked specification, complete Codex handoff and status file. The Bay One email draft is saved separately there.
- **Still NOT live:** Automatically placing tentative Google Calendar events, the private backend migration/credential/deployment, and the owner-only action that records Tony's actual phone confirmation. An ordinary webform receipt is not evidence of calendar placement or verbal confirmation.
- **Next engineering gate:** enable dedicated server-side Google Calendar access on the **existing** Perfect Timing Shop calendar and deploy/read back one approved synthetic tentative event from the existing Cloud Intake with idempotent recovery, without changing the agreed customer workflow.


## Freeze point — completed under regular ChatGPT tools, Codex NOT invoked (October 16, 2026)

**Frozen execution handoff:** [CODEX-FINAL-EXECUTE.md](CODEX-FINAL-EXECUTE.md). The owner-approved user journey in [BOOKING-CONTRACT-V1.md](BOOKING-CONTRACT-V1.md) is unchanged. The launch/rollback instructions, exact source worktrees, accepted tests and provider prerequisites are now durable in public project docs and on P15G2.

| Component | Last verified state | Tests / proof |
| --- | --- | --- |
| Website's 24/7 picker, single intake, VIN, phone-confirm disclaimer | **LIVE** | PRs #71/#74, no design change |
| Customer signed “penciled in vs pending” status line | **LIVE UI; BACKEND STILL OFF** | PR #77 merged `18c388a1284aaac26b0b5981245b26da787a0dd6`; 242/242 website tests and GitHub CI passed; cache-busted live HTML/JS readback succeeded |
| Private cloud intake Google writer, durable D1 queue, signed customer status, owner verbal-confirm event sync | **STAGED LOCAL, NOT DEPLOYED** | `C:\Users\LP15\PerfectTiming-Pipeline\cloud-intake-customer-status-20261016`; latest commit `ccbfa1b`; **40/40 tests + build passed** with mocked Google. No remote; no Site secrets or calendar writes deployed |
| Private Owner Dashboard verbal-confirm UI/API + status guard | **STAGED LOCAL, NOT DEPLOYED** | `C:\Users\LP15\PerfectTiming-Pipeline\owner-verbal-confirm-20261016`, latest `48986dc`; **94/94 tests + TypeScript + build passed**. Based on older owner source; MUST reconcile against actual deployed source, not overwrite |
| Existing shop Google Calendar | **OWNER VISIBLE ONLY** | Secondary Perfect Timing Shop Calendar confirmed; dedicated server-side event-editor grant not yet installed |
| Private Site migrations, secure deployment, recovery scheduler, authorized live Google synthetic E2E | **NOT DONE** | Additive `0002_medical_blindfold.sql` and `0003_puzzling_carmella_unuscione.sql` prepared. Do not enable writers/guard until real provider proof |

**Critical blocker:** Dedicated service-account event-edit access on the existing secondary shop calendar and private Site secret installation. This requires real provider/account permission; connected ChatGPT Calendar access is **not** the server OAuth credential. Only after that should Codex deploy migrations with writer OFF, test existing lead intake, activate one owner-approved synthetic tentative booking, verify Google event ID/Owner Dashboard sync/retry, and deploy the reconciled owner-only phone-confirmation action.

**Frozen local entrypoint:** `C:\Users\LP15\Codex\PerfectTiming-Booking-Plan-20261016\CODEX-FINAL-EXECUTE.md`; Codex CLI is installed on P15G2 but was **NOT executed** in preparation. Once connected and deployed, update this status with actual provider receipts/IDs. Do not claim calendar writes or confirmed appointments now.


## Correction — 2026-10-17 (read-only check of P15G2 session logs and the connected Gmail)
- **The Bay One email was sent.** The draft mentioned above went out on 2026-10-17 at 01:09 UTC from the connected Gmail to fixingfortmyers@gmail.com. No reply as of 05:00 UTC.
- **Codex was used on 2026-10-16**, so "Codex NOT invoked" above is true only of the booking code. Three Codex desktop sessions ran that day (01:24, 02:10 and 09:58 EDT) on the Owner Desk Google profile review and Cloud Intake health, before the booking work began. The booking commits (`808e863` through `ccbfa1b`, and `48986dc`) came from the ChatGPT chat, not Codex.
