"""Pure scheduling decisions for optional automatic Beside scans. No network or UI actions.

Off unless the private refresh settings set beside_auto_scan_minutes to a positive number.
Shop hours are America/New_York, e.g. {"mon": ["08:00", "17:30"], "sat": ["09:00", "13:00"]};
a missing day means closed. Without beside_shop_hours (unset/null), scans are allowed at any hour.

'attention' queue state: the dashboard parks a job there when it needs a human check (for
example a claimed job that never completed, or an import whose delivery is uncertain).
attention_scan_allowed() decides when a new scan may be requested anyway; see its docstring.
"""
from __future__ import annotations
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

EASTERN = ZoneInfo('America/New_York')
DAYS = ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')


def _clock(value):
    return time.fromisoformat(value) if isinstance(value, str) else None


def in_shop_hours(now, hours):
    if not isinstance(hours, dict):
        return False
    local = now.astimezone(EASTERN)
    span = hours.get(DAYS[local.weekday()])
    if not isinstance(span, (list, tuple)) or len(span) != 2:
        return False
    try:
        start, end = _clock(span[0]), _clock(span[1])
    except ValueError:
        return False
    return bool(start and end and start <= local.time().replace(tzinfo=None) < end)


def newest_unseen(inventory, checkpoint):
    """True when the top (newest) visible conversation is new or its preview changed."""
    records = (inventory or {}).get('records') or []
    if not records:
        return False
    top = records[0]
    prior = ((checkpoint or {}).get('records') or {}).get(top.get('conversation_id'))
    return prior is None or prior.get('label') != top.get('label')


def auto_scan_reason(now, settings, state, inventory=None, checkpoint=None):
    """Return 'newest_unseen', 'interval' or None. state holds last_requested_at (ISO)."""
    minutes = settings.get('beside_auto_scan_minutes')
    if not isinstance(minutes, (int, float)) or isinstance(minutes, bool) or minutes <= 0:
        return None
    hours = settings.get('beside_shop_hours')
    if hours is not None and not in_shop_hours(now, hours):
        return None
    last = (state or {}).get('last_requested_at')
    try:
        last_at = datetime.fromisoformat(last.replace('Z', '+00:00')) if isinstance(last, str) else None
    except ValueError:
        last_at = None
    # Never request more than once per minute, even when the newest item stays unseen.
    if last_at and now - last_at < timedelta(minutes=1):
        return None
    if settings.get('beside_auto_scan_on_new', True) and inventory is not None and newest_unseen(inventory, checkpoint):
        return 'newest_unseen'
    if last_at is None or now - last_at >= timedelta(minutes=minutes):
        return 'interval'
    return None


REQUESTABLE = ('idle', 'complete', 'failed', None)


def attention_scan_allowed(now, state, tracker, evidence, stale_minutes=60):
    """May a new scan be requested while the queue is in 'attention'?

    Safest rule: only when ALL of these hold
      * the same attention job has been observed for at least stale_minutes (default 60), and
      * this worker has the job's local run folder (lease.json with that jobId), and
      * that run never attempted an import (no apply-journal.json): it failed while reading or
        checking, so nothing was written to Owner Desk and a fresh scan cannot duplicate or
        overwrite anything.
    An attention job with an attempted (possibly uncertain) import, or one this worker cannot
    find locally, stays blocked until a person checks readback and resolves it. Nothing here
    resolves or clears the attention state itself.
    Returns (allowed, reason)."""
    if (state or {}).get('status') != 'attention':
        return False, 'not_attention'
    job = (state or {}).get('jobId')
    since = (tracker or {}).get('attention_since') if (tracker or {}).get('attention_job') == job else None
    try:
        since_at = datetime.fromisoformat(since.replace('Z', '+00:00')) if isinstance(since, str) else None
    except ValueError:
        since_at = None
    if since_at is None or now - since_at < timedelta(minutes=stale_minutes):
        return False, 'attention_recent'
    if not (evidence or {}).get('found'):
        return False, 'attention_job_not_local'
    if (evidence or {}).get('import_attempted'):
        return False, 'attention_import_needs_review'
    return True, 'attention_stale_no_import'
