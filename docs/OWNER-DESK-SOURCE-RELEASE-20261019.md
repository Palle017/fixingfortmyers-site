# Owner Desk source indicator — release review

Status: **prepared, awaiting Raj review; not deployed**. This PR is the public release-tracking gate for a private Owner Desk change. Merging this document does not install or deploy the dashboard. Private app source, customer records and investigation evidence are not copied to this public repository.

The deployed app already has basic source badges, but its detail drawer defaults an unrecognized source to Zoho. The prepared change uses one conservative source mapper across cards and details, labels unknown metadata as **Unknown origin**, and shows stable record identifiers with the latest sync-save time.

## Display contract

| Saved metadata | Label |
| --- | --- |
| Website importer | Website submission |
| Beside with an exact native call ID | Beside call |
| Beside with an exact native conversation ID | Beside conversation |
| Beside without a proven call/conversation subtype | Beside record |
| Historical Beside recap | Beside history |
| Zoho importer | Zoho record |
| Missing or unrecognized source | Unknown origin |

A Beside conversation can contain calls or texts. Historical recaps and Zoho importer identities do not prove an original contact channel. Website intake does not prove Google, advertising or referral acquisition. Free-text concern, URLs, notes, status and source-health card names cannot override attribution.

The **Lead source and receipt** section exposes Owner Desk ID, source record ID and **Last saved by sync**. That timestamp is the latest accepted import, not an initial-arrival receipt. Missing fields remain **Not recorded**.

## Reviewed private candidate

- Existing Site: `appgprj_6abc24ce151881919044d4d19d7bf303`.
- Production baseline: version 21, source `5bab94cd563cf6140c5bdb1daa43264867a47a93`.
- Prepared candidate: `33645c7b08215018d6e7f9f4d78e2f364cb68775` (local commit; not pushed to Site main).
- Private review package delivered to Raj: `OwnerDesk-Source-Review-2026-10-19.zip`.
- Package SHA-256: `2cdc28ae6e3e7238085c66f2ffe71f7e62dc537a76fdf78dec82e024fa4ac8f8`.
- Patch SHA-256: `6af8ce8144e02aa7c61a4db77f32012b350a1709158f57f4432d620dc61e61af`.

The package contains the reviewable patch, feature verification map, synthetic test log, private investigation result and exact-source rollout instructions. The patch touches source display components, their pure mapper, scoped CSS and synthetic tests/documentation only. There are no migrations, new importers, API contracts, source writes, junk-folder changes, notifications, authentication changes or booking changes.

## Validation

- Owner Desk full synthetic suite: **199/199 passed**, using `node --loader ./tests/tsx-loader.mjs --test tests/*.test.mjs`.
- Source/inbox/SQLite receiver focus: **22/22 passed**.
- TypeScript and existing Sites production build: passed.
- Public website suite at base main: **200/200 passed**, plus 55-page structure validation.
- Independent source review: no blocking correctness or preservation findings.
- Authenticated production UI: blocked by sign-in in this session. Read-only authenticated service evidence is distinct from browser verification.
- Managed preview: reported running but connection was refused; stopped after the failed verification. No interactive browser result is claimed.

Synthetic lifecycle tests verify labels and stable source IDs through duplicate/newer/stale synchronization and owner edits, preserving notes, assigned stages, historical identity, owner timestamps and activity. Existing persistence and synchronization SQL are unchanged.

## Release gate and rollout

Raj's October 18 process requires one small PR, green verify CI and his review before release. Keep this change separate from junk-folder and notification work. This PR deliberately remains unmerged pending that review.

After review and merge:
1. Recover the latest private Site source and compare it to the recorded baseline. Reconcile this scoped patch onto newer source if needed; never reset or overwrite other work.
2. Verify the private package/patch hashes against this merged record. Check the patch applies cleanly. Preserve Site identity, audience, D1, credentials and binding configuration.
3. Run the recorded tests, typecheck and existing Sites build. Use the established Sites source helper to push the reviewed exact source and package it, then save and deploy its matching version to the existing Site. A public website push alone does not deploy this app.
4. Independently read back deployment status and version. Inspect an authenticated inquiry card and its Details & notes receipt, verifying label and stable IDs, keyboard close/focus and narrow-screen wrapping.
5. Compare private before/after record snapshots, allowing legitimate concurrent updates, and verify source facts, notes, stages and activity remain intact. Do not create customer messages or mutate production data for a display test.
6. Append actual deployed commit/version and verification receipts here only after they exist.

Rollback: restore the previous confirmed Site version with unchanged D1. Do not remove customer records, receipts, raw conversation history or owner overlays.
