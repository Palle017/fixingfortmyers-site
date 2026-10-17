# Beside conversation identity guard — October 17, 2026

Scope: prevent neighboring/stale conversation text being attached to a requested ID. No Bay One, booking, Google, customer-message, or owner-status changes.

## Acceptance evidence
- First commit: 16 independent synthetic cases; before the fix, 13 invalid cases were incorrectly accepted and three valid cases passed.
- After the fix: all 75 dashboard-sync tests pass, including those same 16 cases.
- PowerShell parses successfully; stdin matching, wrong-contact and Unicode fixtures behave correctly.
- A read-only native probe passed the guard for all five known exceptions. That probe imported no records.
- The pre-existing VM101 abrupt-process tests stalled on Windows. The local test process was stopped, not marked successful. Other website tests were run separately. Full unmodified Linux GitHub CI is required before merging; no unrelated test was removed or changed.

## Guard and release boundary
The capture loop requires three distinct raw observations with the requested native link, a matching unambiguous contact header, URL bracketing and stable pane content. Ambiguous names, stale content, loading placeholders and missing evidence are refused. It waits for evidence, not a presumed fixed page-load delay. The pure normalizer revalidates every saved observation. Existing captures without identity evidence are not eligible for new imports. Rejected conversations do not advance the existing worker checkpoint.

A GitHub merge does not update the installed Windows worker. Back up and hash-check the tested beside_uia.py, capture_beside.ps1 and beside_refresh_runner.py; install while no scan is active and record independent readback. Preserve schedules, credentials and unrelated modules.

Incorrect cards require reviewed source-only corrections using fresh native evidence. Preserve stable IDs, received-at/history identity, owner notes/statuses and prior raw versions. A stored-ID match alone is not full lead reconciliation. No live customer evidence belongs in this public repository.
