# Owner Desk Junk folder — prepared release

Status: prepared and locally tested; private application is not deployed.
Lead Mechanic reviews and merges this PR. Public main alone does not deploy or
install the private Owner Desk or desktop synchronization modules.

Tony requested a junk folder for leads on October 17. Current private source and
a read-only authenticated October 21 baseline confirm the feature is absent:
Owner Desk v23, source `e2e9f8d547142fda5f09ff3f9ee54cbb613c77d9`, 118 unique
inquiry IDs, no folder field. PR #91 was source-display work only.

The prepared private change adds Inbox, Junk and All inquiries; manual Move to
Junk and Restore; separate owner folder metadata; versioned conflict handling
and audit; preserved source updates; searchable Junk and restored old records.
Folder moves retain customer identities, messages, attachment references,
source attribution, recorded status, notes, assignments and existing history.
There is no automatic spam classifier, deletion, purge or new intake service.

This public PR includes only follow-up worker compatibility, synthetic tests and
release evidence. Junk is excluded from escalation, counters and older-review
digests. Restore keeps the existing sent-reminder ledger rather than resetting it.
Private application source and customer data remain outside this public repo.

## Private review package

- Filename: `OwnerDesk-Junk-Review-2026-10-21.zip` (51,385 bytes).
- Archive SHA-256: `703990377131d92eba1afdd73208fb3719570b5cab3e5d00c51e83b558f6034d`.
- Private patch SHA-256: `5d10b4e94b3162419ae1b59d4692db22addbbaa0c54c91656d2ee3d6df28c0c6`.
- Private candidate: `495f25b136844f34d687bf2ac33564158832add3`.
- Review contents: private patch, schema migration, synthetic tests, exact baseline,
  test logs and `INQUIRY-FOLDERS.md` with operator behavior and rollout/rollback.

Access the package through the authorized private review handoff, not a public
source attachment. Reconcile newer private source before applying this patch.

## Verification

- Private: 216 Node tests, 45 importer Python tests, TypeScript and production build passed.
- Independent review: 26 focused tests passed; identified restoration and stale-refresh
  issues were corrected; no remaining blocking code finding.
- Public: 311 website tests and 160 sync Python tests passed (2 Python skips).
- Browser: managed preview reported running, but browser returned
  `ERR_CONNECTION_REFUSED`; live desktop/mobile interaction remains unverified.
- Production: no application deployment, migration, module install or customer writes.

## Authorized rollout order

1. Review/merge this PR and the private package. Install the exact reviewed public
   follow-up module through the existing synchronization installation workflow.
2. Preserve current sync/task/timer ownership, authority settings and credentials.
   Install the matching private importer owner-invariant checks at its configured
   source checkout. This release does not decide or perform the Beside VM cutover.
3. Capture private before-data and backup. Apply/reconcile the private patch,
   rerun its checks and package/push the exact reviewed private source through Sites.
4. Deploy to the existing Owner Desk with its existing audience and bindings.
   Sites applies the additive migration before Worker upload; reconcile uncertain
   migration state before retrying a failed release.
5. Under an owner-approved synthetic test, verify move, reload, newer source update,
   search, restore and reload; inspect actor/time and preserved fields. Verify both
   authorized shop accounts and desktop/mobile controls. Record actual deployment
   receipts and installed module hashes before claiming live acceptance.

Retain folder/audit data on rollback. Old v23 ignores the folder overlay and would
show Junk among active cards, so prefer a forward fix that preserves filtering.
Never erase columns, source data or activity to simulate rollback.
