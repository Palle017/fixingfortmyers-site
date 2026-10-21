"""Lightweight, browser-free Beside worker heartbeat for the Linux VM (every minute).

Keeps the Owner Dashboard's two-minute worker readiness alive between the 12-minute
Chromium captures, and starts the capture service immediately when a "Refresh Beside"
job is queued.

Honesty rule (same as the Windows runner): readiness is only reported while a real signed-in
capture has recently succeeded. If the last capture status in refresh/uia-worker-status.json
is not ok/worker_ready, or is older than beside_heartbeat_max_age_minutes (default 15),
no heartbeat is sent. Never claims jobs, never reads Beside, never sends customer messages.

Off by default: does nothing unless beside_linux_capture_enabled is true.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib import request
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
ALLOWED_ORIGINS = {'https://dashboard.fixingfortmyers.com', 'https://perfect-timing-owner-desk.prudhvi-pallempati.chatgpt.site'}
CAPTURE_UNIT = 'beside-capture.service'


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def canonical(value):
    # Same canonical JSON as beside_archive.canonical (sorted keys, compact, UTF-8).
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def lock_path(settings):
    return Path(settings['private_archive_root']).expanduser() / 'refresh' / 'capture.lock'


def capture_lock(settings):
    """Non-blocking exclusive lock shared by the capture service and this heartbeat.
    Returns an open file holding the lock, or None if a capture is already running."""
    path = lock_path(settings); path.parent.mkdir(parents=True, exist_ok=True)
    handle = open(path, 'a+')
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close(); return None
    return handle


def capture_running(settings):
    handle = capture_lock(settings)
    if handle is None:
        return True
    handle.close()
    return False


def source_recently_verified(settings, now):
    status_path = Path(settings['private_archive_root']).expanduser() / 'refresh' / 'uia-worker-status.json'
    try:
        status = load(status_path)
        checked = datetime.fromisoformat(status['checked_at'].replace('Z', '+00:00'))
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return False
    if checked.tzinfo is None or status.get('ok') is not True or status.get('worker_ready') is not True:
        return False
    max_age = timedelta(minutes=float(settings.get('beside_heartbeat_max_age_minutes', 15)))
    return timedelta(0) <= now - checked <= max_age


def make_worker(settings, opener=None):
    config = load(settings['private_sync_config']); parsed = urlsplit(config['url'])
    origin = parsed.scheme + '://' + parsed.netloc
    if origin not in ALLOWED_ORIGINS or parsed.path not in ('', '/', '/api/sync') or parsed.query or parsed.fragment:
        raise ValueError('SOURCE_IDENTITY_MISMATCH')
    for key in ('service_token', 'sync_token'):
        if not isinstance(config.get(key), str) or len(config[key]) < 16 or any(c.isspace() for c in config[key]):
            raise ValueError('LOCAL_STORAGE_UNAVAILABLE')
    opener = opener or request.build_opener(request.ProxyHandler({}), NoRedirect())

    def worker(action, **extra):
        if action not in ('heartbeat', 'baseline'):
            raise ValueError('action_not_allowed')  # never claims, progresses or completes jobs
        req = request.Request(origin + '/api/beside-refresh/worker', data=canonical({'action': action, **extra}).encode(), headers={
            'Content-Type': 'application/json', 'Accept': 'application/json',
            'OAI-Sites-Authorization': 'Bearer ' + config['service_token'], 'x-owner-sync-token': config['sync_token']})
        with opener.open(req, timeout=10) as response:
            raw = response.read(4_000_001)
            if response.status != 200 or len(raw) > 4_000_000:
                raise ValueError('BASELINE_UNAVAILABLE')
            value = json.loads(raw)
            if value.get('ok') is not True:
                raise ValueError('BASELINE_UNAVAILABLE')
            return value
    return worker


def start_capture():
    subprocess.run(['systemctl', '--user', 'start', '--no-block', CAPTURE_UNIT], check=True, timeout=10, capture_output=True)


def run(settings_path, *, now=None, worker=None, starter=start_capture):
    now = now or datetime.now(timezone.utc)
    report = {'checked_at': now.isoformat(timespec='milliseconds').replace('+00:00', 'Z'), 'customer_messages_sent': False}
    settings = load(settings_path)
    if settings.get('beside_linux_capture_enabled') is not True:
        return {**report, 'ok': True, 'enabled': False}
    report['enabled'] = True
    running = capture_running(settings)
    if not source_recently_verified(settings, now):
        # No fake readiness. Still kick a capture so the source can be re-proved.
        if not running:
            starter(); report['capture_started'] = 'source_unverified'
        return {**report, 'ok': False, 'heartbeat_sent': False, 'error': 'source_unverified', 'capture_running': running}
    try:
        worker = worker or make_worker(settings)
        worker('heartbeat'); report['heartbeat_sent'] = True
        state = (worker('baseline').get('state') or {}).get('status')
    except Exception as exc:
        return {**report, 'ok': False, 'heartbeat_sent': report.get('heartbeat_sent', False),
                'error': str(exc) if isinstance(exc, ValueError) else type(exc).__name__}
    report['queue_status'] = state
    if state == 'queued':
        if running:
            report['capture_started'] = False; report['capture_running'] = True
        else:
            starter(); report['capture_started'] = 'queued_refresh'
    return {**report, 'ok': True}


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    settings_path = os.environ.get('BESIDE_REFRESH_SETTINGS')
    if len(argv) == 2 and argv[0] in ('-SettingsPath', '--settings-path'):
        settings_path = argv[1]
    if not settings_path:
        print('settings path required', file=sys.stderr); return 1
    try:
        result = run(settings_path)
    except Exception as exc:
        print(type(exc).__name__, file=sys.stderr); return 1
    print(json.dumps(result, separators=(',', ':')))
    return 0 if result.get('ok') else 1


if __name__ == '__main__':
    raise SystemExit(main())
