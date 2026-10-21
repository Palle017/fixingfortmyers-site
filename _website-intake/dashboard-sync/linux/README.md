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

Note: the Owner Dashboard treats the worker as offline when no heartbeat arrives for two minutes,
and the Windows task runs every minute for that reason. At 12 minutes the dashboard will show the
Linux worker as offline between runs, and a queued "Refresh Beside" waits up to 12 minutes.

Do not run the Windows and Linux workers against the same queue at the same time.

## Rollback

`systemctl --user disable --now beside-capture.timer`, or set `beside_linux_capture_enabled` to
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
