# Owner Dashboard reconciliation and sync

Operational Python source, retained in the website repository for recovery. The entire `_website-intake` tree is excluded from the public GitHub Pages output by `_config.yml`. This directory contains code and synthetic tests only.

## What this fixes

The legacy laptop sync was overwriting the Beside source descriptor with zero records / not connected even though imported records existed. `beside_source_authority: browser_refresh` delegates that descriptor to the actual scan/reconciliation workflow, retaining the existing historical-record import. The existing `zoho_adapter` and website `cloud` authority options are preserved.

`reconcile_dashboard.py` reads Cloud Intake and the authenticated Owner Dashboard baseline, follows cloud pagination, and compares stable IDs and source fields. It checks the last completed Beside job against the hash-verified saved readback. It refuses truncated baselines and duplicate identities. Linked voice events do not become extra repair requests. UTC timestamp spellings and offsets are normalized before comparison.

The checker writes only source-status metadata and a local receipt. It does not insert/replay inquiries, scrape Beside, send a worker heartbeat, change owner notes/stages, or send customer messages. A discrepancy is flagged for targeted recovery, not silently retried. Existing Cloud Intake recovery handles pending deliveries separately. A successful saved-record comparison is never presented as proof of a fresh Beside scan.

`run_sync.py` adds reconciliation to the existing runner within its current time budget. The legacy sync receipt is explicitly labeled as a local snapshot rather than the authoritative count of all dashboard records. No new task or new architecture is required.

## Verification

Run the synthetic tests from the repository root:

```sh
python3 -m unittest discover -s _website-intake/dashboard-sync -p 'test_*.py' -v
```

The tests do not call production services. Actual configured paths and endpoint allowlists match the existing owner-operated installation. All credentials, databases, scan captures, configuration and receipts remain outside Git. Do not run `run_sync.py` from a repository checkout as a deployment substitute.

## Deployment boundary and handoff

Pushing these files to `main` does not install the Windows runner or deploy the separately hosted Owner Dashboard. The earlier installation attempt stopped with access denied while replacing the installed sync module; full runtime activation was not confirmed. That one-off installer and its private backup/configuration are deliberately not committed.

An authorized operator should back up and replace the three installed modules (`sync_dashboard.py`, `reconcile_dashboard.py`, `run_sync.py`), preserve the existing SEO collector and credentials, set only `beside_source_authority` to `browser_refresh` in the existing private sync configuration, and execute the existing task once. Confirm its local reconciliation receipt and independently read back the dashboard source descriptor. Do not clear source databases, bypass access permissions, create duplicate scheduled tasks, or label the Beside worker online without real acquisition capability.

The prior authenticated record audit matched 11 website requests (one explicitly marked owner test), 19 newer Beside cards and 63 historical cards, with no missing IDs or source-field regressions. Those are saved-record counts, not a claim that all future Beside calls/texts are being captured. The scan worker was offline at that audit. Fresh Beside acquisition remains a separate activation dependency.

## Lead follow-up (`lead_followup.py`)

Runs at the end of each Owner Desk Sync run. It reads the same authenticated dashboard baseline as the reconciliation and pushes operator alerts to Tony and Raj only, until someone touches a new lead in Owner Desk (any stage change or note sets `owner_updated_at`).

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
