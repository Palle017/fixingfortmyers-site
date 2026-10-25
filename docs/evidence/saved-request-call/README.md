# Saved-request handoff verification

Base: main e28f3b5de984f4031582f992653bd0a0695d81fc. Checked October 25, 2026, Node 24.18.1.

The saved receipt leads with Call the shop, explains AI-first intake and Tony's verbal confirmation, and no longer asks for a duplicate text to supply an already saved number. A failed save still leads with text recovery. Calendar status remains dependent on existing provider proof.

## Checks

- 439/444 tests pass across 42 test files on Windows. The five failures are the unchanged service-ad CSS CRLF/LF comparisons, reproduced separately on the base service-ad files. The pre-existing Windows cleanup-hanging vm101-staging test was excluded; full Linux CI remains required.
- Structure check: 57 HTML pages, 120 JSON-LD blocks, 2,775 local links.
- CSS builder completes. The receipt stylesheet is loaded directly; unrelated regenerated bundle/link changes were discarded. Its source URL and the two entry-page script URLs have new cache keys.
- Disposable headless Edge at 390 x 844 tested both / and /request-a-repair. Each used name and phone only, received one mocked rejection, then one mocked saved receipt. Assertions covered recovery, primary DOM order/classes, computed primary-action sizing, AI disclosure, receipt truthfulness, heading focus, Tab reaching the call action, and no horizontal overflow or page errors.
- Every browser request was intercepted. Receiver responses were synthetic; external resources were aborted. Zero external requests completed, no real lead or message was sent, and no call link was activated.
- Existing tests retain receipt deduplication, optional fields, media, idempotency, consent, calendar proof and analytics checks.

Screenshots show synthetic receipts only:
- [Homepage dialog](home-receipt-mobile.png)
- [Dedicated request page](dedicated-receipt-mobile.png)

These checks establish local behavior, not production deployment, answered calls, notification delivery, calendar availability or conversion lift. Independent reviewer approval and merge remain pending.
