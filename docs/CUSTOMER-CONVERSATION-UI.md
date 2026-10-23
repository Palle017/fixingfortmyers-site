# Customer conversation UI: prepared, inactive

This dependent PR adds an isolated customer page for the [conversation contract](CUSTOMER-CONVERSATIONS.md). It does not change the existing repair form, navigation, live endpoint, Google prefill, analytics, dashboard sync or staging workflows. The shipping configuration is `{enabled:false, endpoint:''}`. No production portal or customer communication is activated.

## Customer behavior

`customer-conversation.html` asks one missing structured question at a time. A resumed tab draft skips existing answers. Back and per-answer Edit support corrections without asking completed questions again. The review step explicitly says the draft has not been sent. Explicit Send submits one reviewed intake and its clarification answers to the existing Cloud Intake conversation API. There are no appointment or SMS-permission controls in this slice; the shop's existing booking and consent flows remain separate.

On a durable server receipt, the page shows saved messages and the initial repair snapshot. Later free-text replies are messages; they do not silently change that snapshot or any staff notes. A pending create or reply is saved in tab session storage before its network request. Lost acknowledgments retain the original operation ID and body through reload. Receipt reconciliation can prove a previous send saved without resending it. A matching receipt followed by a failed message refresh displays **saved, refresh unavailable**, with a usable Refresh control.

Opening the same private link preserves pending recovery. Opening a different conversation keeps the first resource's pending operation separately and never sends it to the second resource. A same-ID link with a different token fails closed without overwriting the original pending state. Per-resource session records can contain unsent customer text and scoped bearer access; they remain sensitive and are removed by the browser when its tab session ends. The page does not claim permanent account history or automatic cross-device identity.

Explicit Copy private return link puts the one-conversation capability in a URL fragment. The page removes that fragment before application fetches. It loads no third-party assets, standard website script or analytics; requests omit cookies and referrers, prohibit redirects and request no cache storage. Unavailable, expired or revoked access locks the view and reply controls. Messages and repair fields are rendered with text nodes. API reads drain up to ten 100-message pages, matching the backend's 1,000-message cap, and reply acknowledgment never replaces the older read cursor or skips an intervening shop reply.

## Verification

- Node 24 focused protocol and UI suite: **26 checks passed** before final commit; includes corrections/resume, missing fields, default-off/no network, stored XSS, customer resource switching, same-link uncertainty, wrong-token preservation, lost create/reply acknowledgments, mismatch receipts, acknowledged-write/read failure, pagination and a concurrent shop reply.
- Independent source review found two uncertainty bugs during development; the matching-link and acknowledged-write/read-failure regressions now pass. Re-review found no remaining blocking defect in the reviewed UI files.
- Real disposable Chrome at 390×844: the primary task drove seven answers, review, send, a synthetic shop reply, follow-up and reload with **15 real input actions and nine assertions**, with zero external requests. Screenshots showed no horizontal overflow. Evidence remains private in the task workspace under `browser-proof/`; no bearer links or screenshots are committed here.
- The bounded full synthetic test list encountered unchanged Windows VM101 cleanup `EPERM` failures and a Node native `UV_HANDLE_CLOSING` failure in the legacy inbox test. The new private page also exposed the generic analytics page-enumeration assumption; this PR explicitly checks that the private page loads no analytics and keeps all existing public-page assertions. Final exact-head check outcomes are recorded in the PR.

Mocked API and browser preview do not establish deployed Cloud Intake authorization, D1 migrations, Owner Desk staff access, credentials or live delivery. The private durable API release must precede this UI; the Owner Desk proxy/panel must be reviewed and configured through its authorized private process before activation. Cross-device verified-account history requires separate server verification and authorization work.

## Safe local preview

From this checkout, run `node tools/preview-customer-conversations.mjs --port=18947`, then open `http://127.0.0.1:18947/customer-conversation.html`. It binds loopback only, serves only this page's allowlisted files, visibly labels itself synthetic, uses memory-only mock data and sends no notifications or external requests. Stopping that owned process discards its synthetic records. It is a UI preview, not a deployable backend or integration proof.
