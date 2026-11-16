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

from beside_capacity import disk_headroom

ROOT = Path(__file__).resolve().parent
ALLOWED_ORIGINS = {'https://dashboard.fixingfortmyers.com', 'https://perfect-timing-owner-desk.prudhvi-pallempati.chatgpt.site'}
CAPTURE_UNIT = 'beside-capture.service'
# The capture timer is 12 minutes. Re-fetch the full inquiry baseline at most that often.
BASELINE_INTERVAL = timedelta(minutes=12)
BASELINE_STAMP_NAME = 'uia-heartbeat-baseline.json'


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


def baseline_stamp_path(settings):
    return Path(settings['private_archive_root']).expanduser() / 'refresh' / BASELINE_STAMP_NAME


def queue_status(payload):
    """Queue status from a worker JSON body, or None if it is missing or unusable."""
    if not isinstance(payload, dict):
        return None
    state = payload.get('state')
    if not isinstance(state, dict):
        return None
    status = state.get('status')
    return status if isinstance(status, str) and status else None


def baseline_is_fresh(settings, now):
    try:
        stamp = load(baseline_stamp_path(settings))
        fetched = datetime.fromisoformat(str(stamp['fetched_at']).replace('Z', '+00:00'))
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return False
    if fetched.tzinfo is None:
        return False
    age = now - fetched
    return timedelta(0) <= age < BASELINE_INTERVAL


def record_baseline_fetch(settings, now):
    path = baseline_stamp_path(settings)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {'fetched_at': now.isoformat(timespec='milliseconds').replace('+00:00', 'Z')}
    data = (json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode()
    tmp = path.with_name(path.name + '.tmp')
    with open(tmp, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(tmp, path)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


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
    if settings.get('persistent_archive'):
        # A full disk can stop the runner from rewriting its status, so check capacity here too rather than
        # trusting a ready status written before the disk filled.
        try:
            capacity_ok, free, required = disk_headroom(settings)
        except OSError:
            capacity_ok, free, required = False, None, None
        if not capacity_ok:
            return {**report, 'ok': False, 'heartbeat_sent': False, 'error': 'ingestion_capacity_unavailable',
                    'disk_free_bytes': free, 'disk_required_bytes': required,
                    'capture_started': False, 'capture_running': running}
    if not source_recently_verified(settings, now):
        # Recovery belongs to the existing 12-minute capture timer. Starting a
        # browser here turns one failed source check into a launch every minute.
        # Remain honestly unready, without creating a second recovery schedule.
        return {**report, 'ok': False, 'heartbeat_sent': False, 'error': 'source_unverified',
                'capture_started': False, 'capture_running': running,
                'recovery_deferred': 'scheduled_capture'}
    try:
        worker = worker or make_worker(settings)
        heartbeat = worker('heartbeat'); report['heartbeat_sent'] = True
        # Queue status comes from the cheap heartbeat reply. The baseline call
        # returns every Owner Desk inquiry (up to 1000 rows) and is reserved for
        # a missing status or at most once per 12 minutes.
        state = queue_status(heartbeat)
        need_baseline = state is None or not baseline_is_fresh(settings, now)
        report['baseline_fetched'] = False
        if need_baseline:
            baseline = worker('baseline')
            report['baseline_fetched'] = True
            try:
                record_baseline_fetch(settings, now)
            except OSError:
                pass
            # Prefer a status from baseline when the heartbeat had none; otherwise
            # keep the heartbeat status so a queued job is not lost.
            baseline_state = queue_status(baseline)
            if state is None:
                state = baseline_state
    except Exception as exc:
        return {**report, 'ok': False, 'heartbeat_sent': report.get('heartbeat_sent', False),
                'baseline_fetched': report.get('baseline_fetched', False),
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
