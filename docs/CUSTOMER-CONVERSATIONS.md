# Customer conversations: additive implementation contract

Prepared source only. No portal, migration, credentials, production messages or historical import is activated by this PR.

The public website remains static. Extend the **existing Cloud Intake** for durable website messages and the **existing Owner Desk** for staff replies. Do not deploy the reference Node inbox, reuse Raj Industries' database, or create another inbox. Existing Beside source identities, manual classifications, Junk, owner notes/stages, quotes, consent, receipts, media and booking work remain independent.

## Verified starting points (October 23, 2026)

- Public website: `48011e61e5554f35b4470be6a49b576f471962f1`; open PR #152 owns Beside capture changes. Staging deployment is separately owned.
- Cloud Intake: Sites v9, exact source `a0fecdfba5a91be05f5f8cc343ce836de6ea3f2a`, recovered from the existing local source checkout. Existing D1 lead/handoff/alert batching and retry receipts are the integration boundary.
- Owner Desk: Sites v30, exact source `34f572b8fc5426c6fd1bae2dae45a75f626593b3`, recovered from the existing local source checkout. Its allowlisted, server-resolved Sites user is staff authentication. It is not customer authentication.
- [Raj PR #1](https://github.com/Palle017/rajindustries-site/pull/1), head `a6b4d95`: reuse deterministic questions, separate messages/brief, hashed return capability, atomic operation records and durable acknowledgments. Its independent inbox, incomplete account identity and missing dedicated revocation API are not the target architecture.

Private backend source must remain outside this public repository. Backend and Owner Desk PRs therefore track versioned **private review patches**, following the existing Owner Desk release process. Public browser contract and synthetic tests contain no runtime credentials or customer records.

## First vertical slice

The opt-in conversation guide asks one missing field at a time. **Only a name and callback number are required**, matching the ordinary short form's contact minimum. A first name is sufficient. Those fields help Tony find the request and know who to call back; optional omissions are not a spam classification. A short problem, vehicle, starts/drivable status and general vehicle location can all be added later. No exact location or login is required, and the ordinary repair request form remains prominently available while the guide is enabled.

Version 2 records optional choices as typed states: `provided` with the actual customer answer, `unknown` without an answer, or `later` without an answer. Missing optional fields default to `later`. The customer can explicitly choose Not sure or I'll add this later, then skip remaining optional details and review. The browser never manufactures customer statements such as "unknown" for skipped fields. Provided yes/no vehicle-status answers are separate from an unknown state. Only provided answers contribute canonical guide/customer pairs to the durable transcript; the name-and-phone minimum therefore saves four message rows, not fourteen fictional answers.

Answers remain an unsent tab draft until explicit review and Send. Then one Cloud Intake transaction saves one existing lead, typed field states, the supplied guide/customer pairs, scoped return access, an idempotent operation receipt and pending Owner Desk handoff. Guide prompts and answers represent structured form choices saved at that transaction's time; they are not claimed to be a previously saved live chat or pre-send message timestamps. Only a durable receipt permits "saved." There is no paid model, inferred customer identity, appointment request or SMS permission in this slice.

Append-only messages are distinct from the normalized initial repair snapshot and its `fieldStates`. Customers can add optional details later as messages. Those messages do not silently overwrite the initial snapshot, its states or staff notes; the customer page labels the snapshot **Details in the initial request**. Message roles and immutable actor IDs are separate from display labels. The lead retains its immutable `website:<root UUID>` Owner Desk identity. Names, email addresses and phone numbers cannot link Beside, Zoho or older website history.

## HTTP contract for the existing Cloud Intake

All routes are default-off behind `CUSTOMER_CONVERSATIONS_ENABLED=true`. Missing feature or runtime setup fails closed. HTTPS origin allowlists, streaming body limits and per-resource authorization apply on the server. Responses use `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`. No customer content or capability appears in logs or analytics.

| Route | Purpose and authorization |
| --- | --- |
| `POST /conversations` | Version 2: `{schemaVersion:2,conversationId,operationId,accessToken,intake,answers}`. Answers are a canonical-order subsequence of `{field,state:'provided',answer}` or `{field,state:'unknown'\|'later'}`. Name and phone must be provided; missing optional fields mean later. UUID operation identity and a random 32-byte capability are generated before sending. The server validates fields and derives messages; no supplied owner role/identity is trusted. |
| `GET /conversations/{id}?after={sequence}` | Bearer capability for that exact resource; returns customer-visible messages only. |
| `POST /conversations/{id}/messages` | `{operationId,body}` with the same scoped bearer authorization. |
| `GET /conversations/{id}/operations/{operationId}` | Authorized receipt reconciliation after an uncertain reply or reload. |
| `GET /private/conversations/by-lead/{rootId}` | Prepared conversation-only service authorization; exact website source mapping for Owner Desk. |
| `POST /private/conversations/{id}/messages` | Conversation-only service authorization plus server-resolved staff actor; `{operationId,body,actorId,displayName}`. |
| `POST /private/conversations/{id}/revoke` | Conversation-only service authorization and audited staff actor revoke guest access. |

Reads return `{ok,conversation:{id,leadId,expiresAt,repair},messages,cursor}`. Messages expose `{id,sequence,role,body,createdAt,operationId}`. A successful write additionally returns `receipt:{operationId,messageId,sequence}`. An operation ID is scoped to its conversation and content: identical replay returns the saved receipt; changed content returns 409. Authorization, expiry and revocation are checked before receipt replay. A lost response leaves the client pending; retry uses its persisted original operation ID.

Version 2 `intake` contains `{name,phone,source:'form',smsConsent:false}` plus only provided optional text/status fields. Provided location appends `Car location (customer description): ...` to provided symptoms, joined by one newline, or becomes the only details line if symptoms were deferred. Unknown/later choices add no text or status value. `repair.fieldStates` records all seven field states separately from the existing normalized lead fields. Existing lead normalization remains compatible; nullable vehicle/profile semantics would require another explicit versioned private contract change. Version 1 requests without `schemaVersion` and already-pending version 1 bodies retain their original validation/hash and replay behavior; the browser migrates editable drafts without rewriting frozen pending operations.

Return links use fragment parameters `#conversation=...&access=...`, never query parameters. Possession grants access to **one** conversation until revoked/expired; it does not verify a person. The customer page loads no analytics or third-party assets, strips the fragment before API requests, omits cookies and referrers, and renders plain text. It keeps credentials and uncertain operations only in tab session storage; explicit private-link saving is the cross-device guest path. Closing a tab can discard an unsent draft. Shared-browser access remains sensitive. Retention and recovery policies must be explicit before rollout; a finite link lifetime is not permanent account history.

### Prepared service authorization; approval still required

The existing Cloud Intake Site is public at its dispatch boundary; its private routes enforce application tokens. Owner Desk is a custom-audience Site and additionally enforces its existing staff allowlist. Neither audience is changed. No Sites bypass credential is needed for the Cloud's current public dispatch.

Proposed setup is a **new** conversation-only random service credential, stored as Cloud Intake `CONVERSATION_OWNER_SERVICE_TOKEN` and Owner Desk `CLOUD_INTAKE_CONVERSATION_TOKEN`. This is prepared code, not a request to retrieve or bind the broader existing private token. It permits server-to-server reads of customer-visible website conversation messages/repair snapshots and operation receipts, audited staff replies and guest-access revocation. Those snapshots include customer-entered names and callback numbers. It cannot export raw leads, read media, drain queues, access metrics, modify sync priorities or access Raj Industries. It is a credential for the existing staff service, not a customer login or permission to send messages during setup.

Owner Desk also requires server-only `CLOUD_INTAKE_CONVERSATION_ORIGIN`: a canonical HTTPS origin in the existing Sites tenant. There is no production fallback or browser-selected destination; unsafe origins and redirects are refused. Actual staging service IDs and origin remain unselected/unapproved. Existing production project IDs above are inventory, not an action-time staging setup approval.

Initial activation should target an approved synthetic staging configuration only, with both conversation feature flags off until tests and setup are reviewed. The token persists in the two runtime secret stores until rotated/removed; it is never placed in browser configuration, source, logs or fixtures. Specific approval must cover generation and installation into the named services/environment before that action occurs. Rollback disables both conversation flags and removes/rotates the dedicated credential; existing intake tokens, service audiences, records, consent, notes and message history remain intact. No credential has been generated, displayed or installed by this implementation task.

## Identity and rollout gates

Google sign-in currently has an empty client ID and browser-decoded **prefill scaffolding**. It is not authentication. This slice does not configure OAuth, install secrets, change account security or request grants. A later account-history feature requires server signature/issuer/audience/expiry verification, a verified stable provider subject, a secure session and per-resource authorization; claiming one guest conversation must require both its capability and the verified session. Never discover/link historical records by name or supplied email. See [Google's server verification guide](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

The release sequence is private durable API/storage review, Owner Desk proxy/panel review, then customer UI review. Owner Desk and UI both depend on the API contract. Reconcile exact current private source and the live migration journal, back up through the approved private process, provision approved service transport only with specific authorization, and test synthetic staging before any activation. No public PR merges, Site deployment, migration or customer messages are performed by this task. Keep the existing short form active throughout. Chat cannot confirm a visit or authorize repairs; [the booking contract](BOOKING-CONTRACT-V1.md) remains authoritative.

Handoff/outbox retries provide durable recovery and idempotent receiver effects. They do not guarantee exactly-once network delivery. Acceptance must cover customer A/B isolation, expired/revoked access, forged identity, concurrent/replayed submissions, lost acknowledgments, XSS, rate/size limits, missing fields and preserved intake/Owner Desk workflow. Record private test evidence separately from hosted integration and browser evidence.
