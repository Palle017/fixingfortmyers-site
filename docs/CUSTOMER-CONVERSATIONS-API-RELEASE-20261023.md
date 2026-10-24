# Durable website conversation API: private review gate

Prepared, default-off source only. This public PR contains the browser contract and this private release record. It does not deploy a backend, apply a migration or enable a portal. Private Cloud Intake source is excluded under `AGENTS.md`.

## Reviewed candidate

| Item | Exact evidence |
| --- | --- |
| Existing Cloud Intake Site | `appgprj_6ac0bd5aa77481918cc6a603a3251492`, v9 |
| Baseline | `a0fecdfba5a91be05f5f8cc343ce836de6ea3f2a` |
| Private candidate | `fc3b57f666667d724169be1750c9b0fdf37bc68d` |
| Private archive | `Cloud-Conversations-V2-fc3b57f.zip` |
| Archive SHA-256 | `493f738b703c4e353831fc72dae543aeda33d997f349285c3cd91e09ffb17b00` |
| Full patch SHA-256 | `d5391edd7fd7981f9961fbe18564017f3de4ef9eb6f7a15e5c7b18c1c8c16892` |

The archive is delivered through the authorized private review handoff, never as a public attachment. It contains the baseline-specific patch, test/build logs and setup instructions. Reconcile newer private source before applying it.

## Behavior and preservation

The existing Cloud Intake gains gated conversation routes in a separate module. One atomic D1 batch saves one existing webform lead, supplied guide/customer transcript pairs, the operation receipt, hashed guest access and existing handoff/alert work. The original intake normalization, receipt hashes, media, consent and source mapping remain unchanged; the worker edit is one import and one route dispatch. No source-priority, Beside importer or Owner Desk schema edit is included.

The explicit **V2 sparse-request contract** requires only name and callback phone, matching the existing short form. Optional symptoms, vehicle, starts/drivable and general location can be omitted, marked `unknown`, or deferred as `later` typed states. These states persist separately in `repair.fieldStates`; they add no invented customer statements or profile text. A minimum request saves four message rows. Missing details remain an ordinary lead, never an automatic spam label. Version 1 and frozen V1 pending-operation bodies remain compatible. The V2 package supersedes the earlier `7bbef70` review package, which is retained separately.

Messages and the normalized repair snapshot are separate. Follow-ups append messages and do not overwrite source/profile fields, owner notes, stages, classifications, Junk or quotes. Initial handoff still uses the same website root UUID and existing retry path. Durable retry and idempotent receiver effects do not imply exactly-once network delivery.

An operation ID plus its content/actor hash binds retries to the same receipt. Atomic constraints and transaction guards cover concurrent duplicates, rollback, late expiry and revocation. A private return link authorizes only its conversation and expires after 90 days unless revoked earlier; it is not a verified account or permanent-history promise. No name/email matching or historical import occurs. Follow-ups are plain text, limited to 4,000 characters; reads paginate in batches of 100, with a 1,000-message conversation cap. There is no automatic deletion policy in this patch.

Private staff routes require the new, **unconfigured** `CONVERSATION_OWNER_SERVICE_TOKEN`, scoped to conversation data/actions only. The existing broad `PRIVATE_API_TOKEN` is not accepted on these new routes and its old behavior is preserved. The paired Owner setting and exact approval scope are in [the implementation contract](CUSTOMER-CONVERSATIONS.md). No credential or grant was created.

## Verification and remaining gates

- Private exact-head `npm test`: **67/67 passed**, including 35 existing intake tests, 22 original conversation checks and 10 V2 sparse-request checks.
- Private `npm run build` and `git diff --check`: passed. Generated migration SQL, Drizzle journal and snapshot align; a subsequent schema generation reports no changes.
- Real SQLite tests include separate-thread/connection duplicate create/reply races, rollback, process reopen and lost acknowledgment, A/B isolation, forged identity, expired/revoked return access and receipt replay, late revoke/expiry, service-token isolation, XSS stored as data, missing fields, CORS and streaming rate/size limits.
- Independent guarded review reran all 32 conversation tests; no remaining blocking finding. Actual public V2 helpers also passed against the private Worker and transactional SQLite: name/phone-only persistence, typed unknown/later, no fabricated messages, stable replay receipt and changed-state conflict, with zero external requests. Synthetic tests are not hosted D1, dispatch authentication or recovery-scheduler proof.
- The initial public protocol head passed Linux CI (351 website tests and 264 dashboard-sync checks). Final V2 exact-head checks are recorded in the PR. Native Windows full-suite attempts hit unchanged EPERM/CRLF/native-handle issues; Linux PR CI is the release gate. Structural accessibility audit: zero violations.

A preliminary V2 test accidentally attempted the existing Owner Desk sync endpoint with invalid synthetic credentials and received HTTP 401; there was no accepted write or real customer data. The fixture was corrected, and the final V2 test file has a hard outbound-network guard with zero-attempt assertions. Exact incident evidence is retained in the private `NETWORK-ISOLATION.md`. No live target was retried.

Before any activation: review the private patch, reconcile the current deployed revision and **live applied** migration journal, take an approved private backup, provision the separately approved environment-specific conversation token, deploy to an isolated synthetic staging service with the flag off, then verify the actual authorized end-to-end transport and recovery path. The additive migration filename is source sequence evidence only; it is not permission to apply against a live journal. No backend migration, deployment, customer send or public PR merge occurred in this task.

Rollback disables `CUSTOMER_CONVERSATIONS_ENABLED`, removes/rotates the dedicated token and retains all leads, conversation tables, messages and existing intake credentials. Owner Desk integration and the disabled customer UI are separate dependent PRs.
