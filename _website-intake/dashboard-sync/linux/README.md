# Beside capture on Linux (bayone-ubuntu)

Linux port of `capture_beside.ps1`. `capture_beside_linux.py` reads the signed-in Beside web app
with Playwright Chromium on a persistent profile (`~/.config/beside-chrome`) under Xvfb and writes
the **same** `beside-uia-inventory/v1` / `beside-uia-thread/v1` files, validated by the **same**
`beside_uia.py` checks (target link unique, header matches, three stable observations). So
`beside_refresh_runner.py`, the archive/plan/apply/readback steps, and the #95–#101 options
(scheduled scans, failure alerts, keep-alive, per-message times, extraction, skip-failed-threads,
intake POST) run unchanged on top of it.

**Off by default.** Nothing runs until both flags are set in the private settings file, and the
timer is not enabled until you enable it. The Windows task keeps using `capture_beside.ps1`
(default `beside_capture_backend` is Windows).

Read-only: no sends, edits, deletions, cookie or credential reads. Opening an unread thread may mark
it read (same as Windows).

## Target

Ubuntu 24.04, 2 vCPU, ~1 GB free RAM, no swap, Python 3.12, user `beside`. The service is capped with
`MemoryMax=1G` (`MemoryHigh=900M`), one Chromium at a time, low-memory Chromium flags.

## Setup (as the `beside` user, no sudo needed)

Already on bayone-ubuntu: user `beside` (uid 1002), venv `/home/beside/venv`, Playwright 1.64.0
with Chromium build 1248 in `~/.cache/ms-playwright`, Xvfb (`xvfb-run -a`). No swap, so the 1 GB
cap is hard: one Chromium, one tab, `--disable-dev-shm-usage` and other low-memory flags.

```sh
git clone https://github.com/Palle017/fixingfortmyers-site ~/fixingfortmyers-site
~/venv/bin/pip install -r ~/fixingfortmyers-site/_website-intake/dashboard-sync/linux/requirements.txt  # playwright==1.64.0
mkdir -p -m 700 ~/beside-private/refresh/runs
```

User timers only run while `beside` has a session unless lingering is on. Enabling it needs an
admin once: `sudo loginctl enable-linger beside` (ask whoever has sudo on the VM).

Private, never in Git (chmod 600):

- `~/beside-private/refresh/settings.json` – copy the Windows refresh settings and change paths to
  Linux paths. Linux keys:

  ```json
  {
    "beside_linux_capture_enabled": true,
    "beside_capture_backend": "linux",
    "private_archive_root": "/home/beside/beside-private",
    "runs_directory": "/home/beside/beside-private/refresh/runs",
    "source_checkout": "/home/beside/beside-source",
    "beside_linux_profile_dir": "~/.config/beside-chrome",
    "beside_linux_headless": false,
    "beside_alerts_config": "/home/beside/beside-private/sync-config.json"
  }
  ```
  plus the existing keys (`expected_account_heading`, `expected_mailbox_title`, `mailbox_id`,
  `persistent_archive`, `private_sync_config`, and any #95–#101 flags such as
  `beside_keepalive_enabled`, `beside_parse_details`, `beside_extract_fields`,
  `beside_skip_failed_threads`, `beside_intake_post_enabled`, `beside_auto_scan_minutes`).
- `source_checkout/scripts/beside-import/` – the private import tools from the shop PC
  (`beside_archive.py`, `refresh_worker.py`, `apply_reviewed_plan.py`, …). Copy them from the
  restricted folder; do **not** commit them here.
- The dashboard sync config (`url`, `service_token`, `sync_token`) at the path in
  `private_sync_config`.

## Sign in once (`--login`)

Needs a visible screen. Either run it in a desktop session on the VM, or over SSH with X forwarding:

```sh
ssh -X beside@bayone-ubuntu
cd ~/fixingfortmyers-site/_website-intake/dashboard-sync
~/venv/bin/python capture_beside_linux.py --login -SettingsPath ~/beside-private/refresh/settings.json
```

(Without X forwarding: `xvfb-run` + `x11vnc -display :99` and connect with a VNC viewer.)
Sign in to Beside, open Chats, then close the window. The session stays in `~/.config/beside-chrome`.

## Manual check

```sh
xvfb-run -a ~/venv/bin/python capture_beside_linux.py -Mode inventory \
  -OutputPath ~/beside-private/refresh/runs/manual-inventory.json -SettingsPath ~/beside-private/refresh/settings.json
```

Prints `{"ok":true,"mode":"inventory","conversations_read":N,...}`. Errors print one line with no
customer content (e.g. `Chats view did not become ready (signed out? run --login)`).

## Scan now (manual full scan, no button press)

Runs the same full scan and Owner Desk import as a **Refresh Beside** job: it asks the queue for a
job (`request`, reason `manual:cli`), claims it, captures, imports, verifies readback and
completes. It holds `refresh/capture.lock`, so it never overlaps the timer or a `--service` run
(if one is running it exits with `capture_already_running`). It never sends customer messages.

```bash
cd ~/fixingfortmyers-site/_website-intake/dashboard-sync
BESIDE_REFRESH_SETTINGS=~/beside-private/refresh/settings.json \
  xvfb-run -a -s "-screen 0 1280x900x24" ~/venv/bin/python beside_refresh_runner.py --scan-now
```

Default budget is 600 s (`--budget-seconds N` to change). If the queue is busy or in
`attention` and the rule below does not allow a new job, it prints `SCAN_NOW_REFUSED` with
`queue_status` and `attention_rule`, and changes nothing.

### Auto-scan and the `attention` state

- `beside_auto_scan_minutes` (e.g. 15) turns auto-scan on. If `beside_shop_hours` is unset,
  scans are allowed at any hour; set it to limit them to shop hours.
- `attention` means the dashboard parked a job for a person to check (a claimed job that never
  completed, or an import whose result is uncertain). A new scan is requested in `attention`
  only when the same job has been in `attention` for `beside_attention_stale_minutes`
  (default 60, timed from when this worker first saw it), this worker has that job's run folder,
  and the run never attempted an import (no `apply-journal.json`). Anything else stays blocked.
  Nothing clears or resolves `attention` automatically.

## Timer (every 12 minutes)

```sh
mkdir -p ~/.config/systemd/user
cp linux/beside-capture.service linux/beside-capture.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now beside-capture.timer
systemctl --user list-timers beside-capture.timer
journalctl --user -u beside-capture.service -n 50
```

Each run: optional keep-alive check → `beside_refresh_runner.run()` (heartbeat, queued job,
capture, archive, plan, apply, readback) → optional `beside_alerts`. Status goes to
`refresh/uia-worker-status.json` like on Windows.

## Heartbeat (every minute, no browser)

The dashboard marks the worker offline after two minutes without a heartbeat, so a small
browser-free timer runs every minute (`beside_heartbeat_linux.py`, `MemoryMax=64M`):

- sends the same `heartbeat` to `/api/beside-refresh/worker` as the Windows task, **only if** the
  last capture status (`refresh/uia-worker-status.json`) is ok/worker_ready and at most
  `beside_heartbeat_max_age_minutes` old (default 15). Otherwise it sends nothing (no fake
  readiness) and starts a capture to re-prove sign-in;
- reads the queue state; if a "Refresh Beside" job is `queued`, starts `beside-capture.service`
  right away;
- never claims or completes jobs and never opens Beside.

Captures share a lock (`refresh/capture.lock`, `flock`): a capture started by the heartbeat and the
12-minute timer can never overlap. Same off switch: `beside_linux_capture_enabled`.

```sh
cp linux/beside-heartbeat.service linux/beside-heartbeat.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now beside-heartbeat.timer
```

Rollback: `systemctl --user disable --now beside-heartbeat.timer`.

Do not run the Windows and Linux workers against the same queue at the same time.

## Rollback

`systemctl --user disable --now beside-capture.timer beside-heartbeat.timer`, or set `beside_linux_capture_enabled` to
false. The Windows path is untouched.

## Still needs a live check (TODO-verify)

The geometry/identity rules are the Windows ones, applied to the DOM. Checked offline against a
synthetic sample (`linux/fixtures/beside_chats_sample.html`); not yet against the real Beside app:

- document title `Chats - … - Beside` on the Chats view;
- `Filter chats: All` exposed as an `aria-label` (UIA name on Windows);
- account heading / mailbox title visible as text or `aria-label`;
- sidebar links are `a[href*="/chats/prv_"]` (documented in `browser_readers.js`) and sit left of
  the thread pane, and the thread header (contact name) is the first text right of the sidebar;
- clock `h:mm AM` and day separators (`Today`, `Yesterday`, `Oct 3`) render as separate text, in the
  same order as the UIA tree.

## Tests

```sh
python3 -m unittest discover -s _website-intake/dashboard-sync -p 'test_*.py' -v
```

`test_capture_beside_linux.py` uses only the saved synthetic HTML. With Playwright installed it also
renders that file offline (all requests aborted or fulfilled locally) and runs a full
inventory + thread capture; without Playwright (CI) those two tests skip.
