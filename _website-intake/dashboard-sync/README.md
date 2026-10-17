# Owner Dashboard reconciliation and Beside refresh

Operational code and synthetic tests. `_website-intake` is excluded from the public GitHub Pages build. Credentials, customer records, browser captures, databases, private settings, leases and receipts must remain outside Git.

## Activated October 17, 2026

The installed Windows runner was updated and its source-descriptor readback was independently verified. Existing ACLs were preserved: granted in-place file writes were used after Windows refused atomic file replacement. Private rollback copies were retained before changes. The earlier installation-blocked status is superseded.

Two additional operational defects were corrected:

- Python microsecond timestamps did not exactly match the hosted JavaScript millisecond timestamps. The reconciler now emits millisecond UTC timestamps while keeping exact readback validation.
- The hosted dashboard expires worker readiness after two minutes, but the old task ran every five. The existing `Perfect Timing Owner Desk Sync` task now checks every minute, retaining its logon trigger, three-minute execution limit and IgnoreNew policy. No duplicate task or new server was created.

## What each component does

`sync_dashboard.py` retains the legacy local imports. `beside_source_authority: browser_refresh` prevents the old local snapshot from overwriting real Beside source coverage with zero/not-connected. Website cloud authority and the existing Zoho authority setting are preserved.

`reconcile_dashboard.py` pages through authoritative cloud records and the authenticated dashboard, checks stable IDs/source fields against saved scan proof, distinguishes linked recordings from separate requests, and verifies source-status updates. It does not replay inquiries or qualify a fresh source scan merely because saved records match. It defers source-descriptor writes while a scan is queued or running.

`capture_beside.ps1` reads the owner's signed-in Chrome using Windows UI Automation. It verifies the configured account/mailbox, the All-conversations filter, observed conversation links and the selected thread URL. It excludes message editors and never sends, edits or deletes messages. Opening an unread thread may mark it read. Browser credentials and private app storage are not accessed. If the Beside tab is not selected, the existing observed tab can be selected; a missing tab can be opened in the existing Chrome session.

`beside_uia.py` normalizes explicitly scoped rendered captures. Only a native phone-number header supplies a phone number automatically; numbers in an AI recap are not promoted into verified contact facts. Activity times use visible clock/day separators with a documented America/New_York assumption, not invented receipt times. Missing or ambiguous dates are held rather than fabricated.

`beside_refresh_runner.py` polls the existing private refresh queue after verifying actual source access. It runs a fresh capture only for an explicit Owner Dashboard **Refresh Beside** request. It reuses the installed private archive, reviewed import planner, source-only sender and independent readback verifier from `source_checkout/scripts/beside-import`. Those dependencies and their private settings remain part of the existing installation.

New automatic projections are unqualified review items. Previously reviewed classifications and known contact facts are preserved, and possible duplicate-phone matches are held for explicit reconciliation. Customer messages, payments, repair authorization, owner notes and owner stages are never sent or changed by a refresh.

`run_sync.py` executes this optional worker when `beside_refresh_enabled: true` is set in the existing private configuration. It preserves the existing lead sync and SEO collector, stays within the task time budget, and reconciles again after a verified import. Scan readiness/failure is reported separately from saved-record delivery.

## Coverage and failure behavior

This is request-driven, bounded browser acquisition, **not an always-on complete Beside account export**. Each run examines the currently rendered recent list and reads up to the configured maximum of 25 changed threads while its time budget permits. Uninspected, held and archive-only records are explicitly reported. Older paged messages, other mailbox tabs, recording audio and transcripts are not silently claimed as captured.

The computer must be awake with an interactive signed-in Windows/Chrome session and accessible Beside account. Failed source access does not generate a fake readiness heartbeat. Browser/UI changes, sign-in needs, held records or incomplete coverage remain visible in private receipts and dashboard status.

Every import uses stable source IDs, private pre-write journaling, exact acknowledgement counts and an independent before/after comparison. An uncertain write is not blindly retried. Queue completion requires a fresh, job-bound capture and verified readback; original raw captures and SQLite history are retained. Completed scan checkpoints advance only for inspected and verified records.

## Verification

```sh
python3 -m unittest discover -s _website-intake/dashboard-sync -p 'test_*.py' -v
```

At activation, 59 synthetic Python tests and 242 website tests passed. A real dashboard-triggered run then executed through the installed scheduled task, archived fresh source observations, imported/reconciled cards, and completed with a successful independent readback. Customer content and exact operational receipts remain in the owner's private directories rather than this repository.

## Deployment and recovery

A push to `main` preserves source; it does not itself install Windows files or redeploy the hosted Owner Dashboard. Installed modules are `sync_dashboard.py`, `reconcile_dashboard.py`, `run_sync.py`, `beside_uia.py`, `beside_refresh_runner.py` and `capture_beside.ps1`. Preserve the existing `collect_seo` module and private credentials/settings. Set only the relevant authority/enable flags in the existing private config, and keep the existing task repetition at one minute so the two-minute readiness contract is satisfied.

Before updating, back up the installed modules, private config and exported task definition. Verify files against the intended Git revision and run synthetic tests. After activation, execute the existing task once, inspect `last-run.json`, `dashboard-reconciliation-status.json` and `refresh/uia-worker-status.json`, then verify the dashboard's actual saved records and last-success receipt. For rollback, restore the recorded module/config/task backups; do not clear databases, delete raw history or remove owner decisions.

## Lead follow-up (`lead_followup.py`)

Runs at the end of each Owner Desk Sync run, after the Beside refresh, so a newly scanned call is pushed the same minute. It reads the same authenticated dashboard baseline as the reconciliation and pushes operator alerts to Tony and Raj only, until someone touches a new lead in Owner Desk (any stage change or note sets `owner_updated_at`).

- Ladder, measured from the lead's received time, at any hour (owner decision 2026-10-17: no quiet hours): 0 min push to Tony, 15 min second push, 30 min urgent push, 60 min push to Raj. A lead that arrives late gets one push per person, not a burst.
- Priority only changes the title: EMERGENCY (stranded or no-start), BIG JOB (overheating, coolant, knock, transmission, head gasket, no-start), or New lead.
- If the Beside scan worker is offline for 15 minutes, both get one "Beside calls are not reaching Owner Desk" push per outage.
- At 8 AM Eastern, one "Open leads this morning" push, only when something is open.
- Pushes never include customer names, numbers or email addresses. No customer is ever contacted, and no lead or stage is written.
- Leads received before `start_at` never escalate, so the existing review backlog doesn't flood anyone; it is counted in the morning push instead.

Off until the private `config.json` has:

```json
"followup": {"enabled": true, "start_at": "<ISO time to start from>", "dashboard_url": "<Owner Desk URL>",
             "tony_push_url": "https://<push service>/<Tony's private topic>", "raj_push_url": "https://<push service>/<Raj's private topic>"}
```

State (`followup-state.json`) and a counts-only receipt (`followup-status.json`) stay in the private folder. Synthetic tests: `python3 -m unittest discover -s _website-intake/dashboard-sync -p 'test_*.py'`.
