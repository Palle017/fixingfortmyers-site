# Site agent instructions — Perfect Timing Auto Repair

These instructions apply to every AI coding agent and human developer equally. The work is AI-vendor agnostic (owner decision 2026-10-17): no step may depend on one vendor's chat, connector, memory or quota, and any agent may pick up the runbook.

This is a **PUBLIC static GitHub Pages repository**, not the secret-bearing Cloud Intake or Owner Dashboard deployment. Preserve all live intake endpoints, customer receipts, email/SMS consent, idempotent retries, other active business projects, and existing LIQUI MOLY offer.

## Booking scope is locked by the owner
Read `docs/BOOKING-CONTRACT-V1.md` before any calendar, booking, request form, Bay One, Owner Dashboard or customer-scheduling change. The 24/7 **penciled in → call Tony → verbally confirmed** workflow is approved; do not replace it with a fixed-hours scheduler, Calendly, Square, Google Appointment Schedule, duplicate form, automatic quote/charge, or AI-led approval.

Read `docs/BOOKING-ROLLOUT-RUNBOOK.md` for execution order and `docs/BOOKING-RELEASE-STATUS.md` for actual completed/pending evidence.

## Technical guardrails
- The static site must not contain Google Calendar OAuth tokens, service account JSON, private operator secrets, customer records or Site backend source.
- Use a clean isolated git worktree. The user's old Windows checkout has unrelated uncommitted work; do not reset it or overwrite other branches.
- Build/test on Node 24: `npm ci`; `npm test`. The CSS builder `npm run build:styles` can rewrite unrelated HTML/bundles; stage only the needed and existing output assets, verify all referenced asset paths exist before PR and again in GitHub Actions.
- New backend writes require the real Google authorization and exact Site/D1 deployment; mocked tests do not establish production function. Preserve lead before tentative event, no confirmed appointment unless Tony actually verbally confirmed.
- Do not send real customer messages, invoices, call providers, create calendar events, switch paid tiers, or mutate production D1 without an owner-approved specific test/deploy process.
- Record exact receipts/commits/remaining gates; never claim a background job succeeded without independent readback. Preserve existing customer data.
