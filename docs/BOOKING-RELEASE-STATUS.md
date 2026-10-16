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
