# Durable website conversation API: private review gate

Prepared, default-off source only. This public PR contains the browser contract and this private release record. It does not deploy a backend, apply a migration or enable a portal. Private Cloud Intake source is excluded under `AGENTS.md`.

## Reviewed candidate

| Item | Exact evidence |
| --- | --- |
| Existing Cloud Intake Site | `appgprj_6ac0bd5aa77481918cc6a603a3251492`, v9 |
| Baseline | `a0fecdfba5a91be05f5f8cc343ce836de6ea3f2a` |
| Private candidate | `7bbef704bd8e8dc25b80a955051f31c014a0135f` |
| Private archive | `Cloud-Conversations-Review-2026-10-23.zip` |
| Archive SHA-256 | `43bd76a8a93e9964986593070440b53af53cb8b2d97ab529b35539d635061f3d` |
| Patch SHA-256 | `de7d51719f82a2ea13bef2b422f8806ed07b83c68bd8f5487986e9d763cff3bb` |

The archive is delivered through the authorized private review handoff, never as a public attachment. It contains the baseline-specific patch, test/build logs and setup instructions. Reconcile newer private source before applying it.

## Behavior and preservation

The existing Cloud Intake gains gated conversation routes in a separate module. One atomic D1 batch saves one existing webform lead, fourteen guide/customer transcript messages, the operation receipt, hashed guest access and existing handoff/alert work. The original intake normalization, receipt hashes, media, consent and source mapping remain unchanged; the worker edit is one import and one route dispatch. No source-priority, Beside importer or Owner Desk schema edit is included.

Messages and the normalized repair snapshot are separate. Follow-ups append messages and do not overwrite source/profile fields, owner notes, stages, classifications, Junk or quotes. Initial handoff still uses the same website root UUID and existing retry path. Durable retry and idempotent receiver effects do not imply exactly-once network delivery.

An operation ID plus its content/actor hash binds retries to the same receipt. Atomic constraints and transaction guards cover concurrent duplicates, rollback, late expiry and revocation. A private return link authorizes only its conversation and expires after 90 days unless revoked earlier; it is not a verified account or permanent-history promise. No name/email matching or historical import occurs. Follow-ups are plain text, limited to 4,000 characters; reads paginate in batches of 100, with a 1,000-message conversation cap. There is no automatic deletion policy in this patch.

Private staff routes require the new, **unconfigured** `CONVERSATION_OWNER_SERVICE_TOKEN`, scoped to conversation data/actions only. The existing broad `PRIVATE_API_TOKEN` is not accepted on these new routes and its old behavior is preserved. The paired Owner setting and exact approval scope are in [the implementation contract](CUSTOMER-CONVERSATIONS.md). No credential or grant was created.

## Verification and remaining gates

- Private exact-head `npm test`: **57/57 passed**, including 35 existing intake tests and 22 new conversation checks.
- Private `npm run build` and `git diff --check`: passed. Generated migration SQL, Drizzle journal and snapshot align; a subsequent schema generation reports no changes.
- Real SQLite tests include separate-thread/connection duplicate create/reply races, rollback, process reopen and lost acknowledgment, A/B isolation, forged identity, expired/revoked return access and receipt replay, late revoke/expiry, service-token isolation, XSS stored as data, missing fields, CORS and streaming rate/size limits.
- Independent review reran all 22 new tests; no remaining blocking finding. Synthetic tests are not hosted D1, dispatch authentication or recovery-scheduler proof.
- Public protocol focus: four tests passed. The existing full Windows suite was attempted and stalled on legacy test handles; a bounded run produced 339 passes and 13 unchanged failures (seven temporary-directory EPERM cleanup hooks, five CRLF CSS assertions and one native Node handle assertion). Linux PR CI is the release verification gate. Structural accessibility audit: zero violations.

Before any activation: review the private patch, reconcile the current deployed revision and **live applied** migration journal, take an approved private backup, provision the separately approved environment-specific conversation token, deploy to an isolated synthetic staging service with the flag off, then verify the actual authorized end-to-end transport and recovery path. The additive migration filename is source sequence evidence only; it is not permission to apply against a live journal. No backend migration, deployment, customer send or public PR merge occurred in this task.

Rollback disables `CUSTOMER_CONVERSATIONS_ENABLED`, removes/rotates the dedicated token and retains all leads, conversation tables, messages and existing intake credentials. Owner Desk integration and the disabled customer UI are separate dependent PRs.
