# Owner Desk receptionist preview — prepared release

Status: implemented and locally verified; private application is not deployed.
Lead Mechanic reviews and merges under `AGENTS.md`. Public main alone does not
publish Owner Desk or install the Linux Beside collector.

Generic Beside cards currently show the approved receptionist greeting as if it
were customer text. The private two-file change recognizes the exact opening,
acknowledgment and `Perfect Timing Reception` signature. Customer name/car replies
remain visible, sparse inquiries stay in review, and the original captured record
remains available in the detail drawer. Empty call previews say **Call captured;
review before following up.** They no longer demand repair details.

The receptionist scope remains name and car model so Tony can prepare before
calling or texting. Preferred contact time is optional. This change adds no issue
question, diagnosis, appointment, customer message or broader chat behavior.

## Private review handoff

| Item | Exact evidence |
| --- | --- |
| Existing Site | `appgprj_6abc24ce151881919044d4d19d7bf303`, Owner Desk v30 |
| Base source | `34f572b8fc5426c6fd1bae2dae45a75f626593b3` |
| Private candidate | `5213bb10a1e7d2029d631a93a276859dfeaf58af` |
| Private ZIP | `OwnerDesk-Reception-5213bb1.zip`, 18,818 bytes |
| ZIP SHA-256 | `cb68d3ae593a4e68bd6dc3976fa4fa22914ee5aa3bc9797fcb32a0da9fc3f726` |
| Patch SHA-256 | `449a86793b3e1c80f4abbd489effd79f3e2315bfbcac917b98722c45c768477e` |
| Incremental Git bundle SHA-256 | `560c5b5cba68ac31f2ec6a032b2a5afc23999f22e9bc7156309135edd9677a67` |

The packet is saved and hash-verified on P15G2 in the authorized private release
folder `PerfectTiming-Pipeline-private/owner-reception-20261025`. It contains the
patch, incremental Git bundle, test/build logs, manifest and rollout instructions.
Private application source and customer data must not be attached to this public
PR. The bundle retains the exact candidate commit and requires the base above.

Only `lib/inquiry-presentation.ts` and its synthetic test file change. The patch
does not touch the sync receiver/schema, card ordering, shared Owner Desk component,
notes, stages, Junk, source priority, parts, conversations or access settings.

## Verification

- All 245 private Node tests passed; zero failures.
- TypeScript `--noEmit`, Sites production build and `git diff --check` passed.
- Regression coverage renders name/car-only cards and the original-record drawer;
  verifies exact signature variants; and preserves near matches, customer
  additions, curated summaries, non-Beside records and input objects.
- No authenticated hosted browser, live intake, production data write or customer
  communication was used as a test.

## Incremental release order

1. **Collector recognition — [PR #171](https://github.com/Palle017/fixingfortmyers-site/pull/171).**
   Review/merge, then install its exact `beside_evidence.py` through the existing
   Linux collector workflow. Record the installed hash; keep current timer/worker
   ownership and credentials. This release does not perform or change the VM cutover.
2. **Owner Desk preview — this private packet.** Review the two-file patch and
   reconcile it onto the latest private source. Preserve concurrent review and
   conversation packages; do not deploy the old v30 tree over newer work. Rerun
   full tests, TypeScript and build after reconciliation. Package/push with the
   Sites source helper, save the exact commit/archive and deploy to the existing
   custom audience and bindings. No migration or new credential is needed.
3. **Acceptance receipt.** Verify the deployed version and installed collector
   hash separately. Check a name/car-only inquiry stays visible, receptionist copy
   is absent from its preview, and the original text remains reviewable. Use
   authorized read-only inspection or a separately approved synthetic fixture;
   never contact a real customer for testing. Record actual runtime evidence.

PR #168 already corrected the phone-scope documentation; #167 and #170 already
add/preserve sparse manual-review evidence in public source. Their private receiver,
panel and ordering integration is concurrent work, not bundled or claimed deployed
here. The website conversation work in #163–#165 remains a separate integration
release with its existing gates.

Rollback reverts these two private files and republishes through the same Sites
workflow, preserving all newer unrelated changes and saved records. Revert the
collector module separately if needed. Do not reset the whole app to v30.
