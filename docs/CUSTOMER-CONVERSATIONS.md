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

The opt-in conversation guide asks one missing field at a time: symptoms, name, callback number, vehicle, starts, drivable and current vehicle location. Answers remain an unsent tab draft until explicit review and Send. Then one Cloud Intake transaction saves one existing lead, every guide/customer message, scoped return access, an idempotent operation receipt and pending Owner Desk handoff. Only a durable receipt permits “saved.” There is no paid model, inferred customer identity, appointment request or SMS permission in this slice.

Append-only messages are distinct from the normalized repair snapshot. Later messages do not silently overwrite reviewed profile fields or staff notes. Message roles and immutable actor IDs are separate from display labels. The lead retains its immutable `website:<root UUID>` Owner Desk identity. Names, email addresses and phone numbers cannot link Beside, Zoho or older website history.

## HTTP contract for the existing Cloud Intake

All routes are default-off behind `CUSTOMER_CONVERSATIONS_ENABLED=true`. Missing feature or runtime setup fails closed. HTTPS origin allowlists, streaming body limits and per-resource authorization apply on the server. Responses use `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`. No customer content or capability appears in logs or analytics.

| Route | Purpose and authorization |
| --- | --- |
| `POST /conversations` | `{conversationId, operationId, accessToken, intake, answers:[{field,answer}]}`; UUID operation identity and a random 32-byte capability generated before sending. Server validates all fields and derives guide messages; no supplied owner role/identity is trusted. |
| `GET /conversations/{id}?after={sequence}` | Bearer capability for that exact resource; returns customer-visible messages only. |
| `POST /conversations/{id}/messages` | `{operationId,body}` with the same scoped bearer authorization. |
| `GET /conversations/{id}/operations/{operationId}` | Authorized receipt reconciliation after an uncertain reply or reload. |
| `GET /private/conversations/by-lead/{rootId}` | Existing private service authorization; exact website source mapping for Owner Desk. |
| `POST /private/conversations/{id}/messages` | Existing private service authorization plus server-resolved staff actor; `{operationId,body,actorId,displayName}`. |
| `POST /private/conversations/{id}/revoke` | Private service authorization and audited staff actor revoke guest access. |

Reads return `{ok,conversation:{id,leadId,expiresAt,repair},messages,cursor}`. Messages expose `{id,sequence,role,body,createdAt,operationId}`. A successful write additionally returns `receipt:{operationId,messageId,sequence}`. An operation ID is scoped to its conversation and content: identical replay returns the saved receipt; changed content returns 409. Authorization, expiry and revocation are checked before receipt replay. A lost response leaves the client pending; retry uses its persisted original operation ID.

Return links use fragment parameters `#conversation=...&access=...`, never query parameters. Possession grants access to **one** conversation until revoked/expired; it does not verify a person. The customer page loads no analytics or third-party assets, strips the fragment before network activity, omits cookies and referrers, and renders plain text. It keeps credentials and uncertain operations only in tab session storage; explicit private-link saving is the cross-device guest path. Closing a tab can discard an unsent draft. Shared-browser access remains sensitive. Retention and recovery policies must be explicit before rollout; a finite link lifetime is not permanent account history.

## Identity and rollout gates

Google sign-in currently has an empty client ID and browser-decoded **prefill scaffolding**. It is not authentication. This slice does not configure OAuth, install secrets, change account security or request grants. A later account-history feature requires server signature/issuer/audience/expiry verification, a verified stable provider subject, a secure session and per-resource authorization; claiming one guest conversation must require both its capability and the verified session. Never discover/link historical records by name or supplied email. See [Google's server verification guide](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

The release sequence is private durable API/storage review, Owner Desk proxy/panel review, then customer UI review. Owner Desk and UI both depend on the API contract. Reconcile exact current private source and the live migration journal, back up through the approved private process, provision approved service transport only with specific authorization, and test synthetic staging before any activation. No public PR merges, Site deployment, migration or customer messages are performed by this task. Keep the existing short form active throughout. Chat cannot confirm a visit or authorize repairs; [the booking contract](BOOKING-CONTRACT-V1.md) remains authoritative.

Handoff/outbox retries provide durable recovery and idempotent receiver effects. They do not guarantee exactly-once network delivery. Acceptance must cover customer A/B isolation, expired/revoked access, forged identity, concurrent/replayed submissions, lost acknowledgments, XSS, rate/size limits, missing fields and preserved intake/Owner Desk workflow. Record private test evidence separately from hosted integration and browser evidence.
