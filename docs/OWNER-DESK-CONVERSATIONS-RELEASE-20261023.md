# Owner Desk conversation panel: private review gate

Prepared source only; feature disabled. This public PR tracks a private review package under the existing Owner Desk release process. No private app source, customer data or credentials are copied here. Depends on the [durable conversation API PR #163](https://github.com/Palle017/fixingfortmyers-site/pull/163).

| Item | Exact evidence |
| --- | --- |
| Existing Owner Desk Site | `appgprj_6abc24ce151881919044d4d19d7bf303`, v30 |
| Baseline | `34f572b8fc5426c6fd1bae2dae45a75f626593b3` |
| Private candidate | `477ca6ef5707fc3e752dee6803ce30b319de251d` |
| Private ZIP | `OwnerDesk-Conversations-477ca6e.zip` |
| ZIP SHA-256 | `17e94e9decfabfce53eaafae593767643a1f247bff83d58644ffab259182a07a` |
| Patch SHA-256 | `b92ac0d5c37b5dae39efa40654a4b1d06dc71c8822afd772ee5dea4308bd4621` |

The authorized private package contains twelve **new** files: a server proxy, component and styles, retry/response helpers, an isolated environment declaration, synthetic tests and setup/wiring documentation. Cloud Intake owns all conversation messages. This patch adds no Owner Desk storage, migration or independent inbox, and changes no sync receiver, source-priority schema, importer allowlist, Beside worker, card ordering, notes, stages, Junk, classifications, parts or quotes.

The proxy uses existing server-resolved Sites staff identity and the current allowlist, enforces same-origin writes, looks up the selected inquiry and requires its immutable `source=website` plus UUID `source_id`. Browser-supplied actors, Cloud targets and replacement source IDs are rejected. Private staff notes are never forwarded. Messages render as escaped text, with actor IDs distinct from display labels. Pending reply operations survive reload and reconcile their original receipt; inquiry/actor switching isolates late responses and tab state. Paginated reads preserve concurrent customer replies instead of advancing the cursor to the send acknowledgment.

## Shared wiring remains held

The package's `proposed-wiring.patch` passes `git apply --check` but is **not applied, included in the candidate commit, or integration-tested**. It proposes only:

- `app/page.tsx`: pass the existing authenticated staff ID and server feature flag to Owner Desk.
- `app/owner-desk.tsx`: import the isolated panel and insert it after `InquiryConcernDetail`, before `PartsWorkspace`, for the selected website inquiry.

Those shared edits await coordination with the concurrent dashboard work. No priority/freshness adapter is changed by this package. Apply reviewed concurrent work first, then reconcile the small wiring patch against that exact result and rerun full tests/typecheck/build. Until that happens the panel is not mounted, even in a configured environment.

## Exact-head verification and setup

Private commit `477ca6e`: **261/261 tests passed**, including 19 new focused conversation checks; strict TypeScript, existing Sites production build and `git diff --check` passed. Tests cover authorization, source targeting, forged actors/fields, no note/token exposure, XSS escaping, uncertainty/reload recovery, A/B view isolation and more than 100 messages. Independent review reran all 19 focused checks with no remaining blocking finding. No authenticated hosted browser or real inter-service transport is claimed.

Both service feature flags default off. Proposed **new** conversation-only authorization is Cloud Intake `CONVERSATION_OWNER_SERVICE_TOKEN` paired with Owner Desk `CLOUD_INTAKE_CONVERSATION_TOKEN`. It permits customer-visible website conversation/repair reads, receipts, audited owner replies and guest-access revocation, including customer-entered names and callback numbers. It cannot export raw leads, fetch media, drain queues, read metrics or act on Beside, quotes, owner notes or accounts. No existing broad token is retrieved or repurposed. No credential or grant was generated/configured.

The private `CUSTOMER-CONVERSATIONS-SETUP.md` packet names the exact existing services, environment-specific approval, secret-store persistence, separate staging/production credentials and rotation/revocation process. First obtain specific approval to generate/install the credential in an approved isolated synthetic staging environment. Production provisioning or activation requires separate approval. No new account, OAuth credential, Sites audience change or persistent access is created by this PR.

Remaining gates: shared-file coordination and final integrated checks; reviewed Cloud API/migration against the actual live journal; specifically approved scoped token setup; synthetic staging transport and authenticated desktop/mobile proof. No deployment, migration, source push to Sites, customer reply, historical import or public PR merge occurred. Rollback disables flags and removes/rotates the dedicated token while retaining all existing intake, owner data and messages.
