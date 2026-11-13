# Inbox placement and manual Junk ownership

Prepared for review only. Do not merge, deploy, install worker changes or modify
saved inquiries from this package. Raj's October 30 instruction requires Lead
Mechanic to review the exact commit and full diff first; the parent task owns
the later deployment gate.

## Verified starting point

Public repository baseline: `59800a6f7a2d760b8306c9ec20df2a46f3a79c41`.
Owner Desk production remains version 32, source
`b7bc8f518447e4f4358b76dd124dbb627d87408f`. Its deployment succeeded; no newer
saved version was present when checked on October 30.

PR #127 added the manual Junk/Restore overlay and excluded Junk from follow-up
notifications. Its deployment record says all existing inquiries started in
Inbox and no automatic classifier was added. Current source confirms that
imports omit owner folder fields, the database defaults to Inbox, and only the
authenticated, same-origin folder command writes Junk. The card and detail
drawer invoke that command from explicit button clicks.

No automatic Junk writer was found to remove. This proposal makes the new-row
Inbox rule explicit in the private receiver and adds regression coverage. It
does not establish why a reported inquiry entered Junk. An audit action label
or actor alone cannot establish that a human clicked a button.

## Proposed change

The private receiver inserts a literal Inbox value for every accepted new
inquiry, regardless of source, source status, classification, message text or
supplied folder metadata. The conflict-update clause continues to exclude all
folder and owner fields. Repeated imports and sweeps cannot move existing cards
in either direction. Manual Junk/Restore retains its existing authorization,
origin, version-conflict and audit protections.

Private candidate: `7fe076ab99315db3ab315d9bb312102970598d6a`.
Full private diff SHA-256:
`6b4355d79722de921e038c53432dbe506b990531f2d70a0678f468d17dc18e49`.
Private application source stays outside this public repository and belongs
only in the established private Lead Mechanic review handoff.

This public PR adds synthetic producer/sweep contract tests and this release
record. It changes no public production code. Existing archive-only reviews,
exact verification-message exclusion, source validation, duplicate suppression,
Junk follow-up exclusions and security checks remain unchanged. Those filters
do not assign the Owner Desk Junk folder and are outside this change.

## Verification

- Private: 312 Node tests, 45 importer Python tests and 61 private-sync Python
  tests passed; TypeScript and production build passed.
- New receiver tests exercise 80 source/classification/text combinations,
  ignored folder claims, explicit Inbox insertion, unchanged existing Junk,
  and genuinely equal, stale and newer imports before and after manual restore.
- Mounted Owner Desk tests click the card and drawer controls through the real
  folder route backed by synthetic SQLite. Initial load and repeated reloads
  make no folder writes. Manual moves/restores persist; unauthorized writes
  and automatic retries of failed folder writes are rejected or absent.
- Public worker suite on Linux: 355 tests run, 353 passed, 2 existing skips.
  The four new tests cover source snapshots, export rejection, repeated sweeps
  and preservation of prior archive classifications without folder writes.
- Static staging build passed: 56 pages, 257 files. Staging tests: 11 passed.
  Accessibility audit: zero violations, including zero serious/critical ones.
- The local Windows full Node run was unsuccessful: the existing VM101
  subprocess tests stalled, and the staging test initially rejected the local
  dependency junction. The junction was moved outside the source root, and the
  staging suite/build then passed. Full Linux Node verification is delegated
  to this draft PR's existing CI; inspect its exact-head result before approval.

All test records are synthetic. No live inquiry, source classification, folder,
status, schedule, credential, account, provider or customer message was changed.
No database migration is included.

## Review and rollback

Review the public commit together with the full private diff above. Source-only
rollback is to revert this public tracking commit and private candidate
`7fe076ab99315db3ab315d9bb312102970598d6a` on their isolated branches. That is not
an instruction to revert production or change any data.

Retain Owner Desk version 32 as the production rollback reference. It has the
manual Junk folder, so rollback must never use a pre-Junk version or delete
folder columns, audit history, records or owner decisions. Source backups and
the exact saved version/deployment references are in the private review packet.
After any separately approved future deployment, rollback through the existing
Sites workflow to version 32 without a data migration. Do not restore or
reclassify existing Junk records as part of rollout or rollback.

Lead Mechanic review and deployment approval are pending. A public PR merge
alone would not install or deploy the private Owner Desk.
