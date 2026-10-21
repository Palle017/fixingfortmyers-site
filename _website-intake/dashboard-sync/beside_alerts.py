"""Optional operator alerts for Beside scan failures, through the lead_followup push path.

Off unless the private sync config has beside_alerts.enabled = true AND followup push URLs
(followup.enabled, tony_push_url, raj_push_url). Pushes carry codes only, no customer data.
One push per failure episode; a successful scan re-arms it.
"""
from __future__ import annotations
from datetime import datetime, time, timedelta, timezone
import json
from pathlib import Path
from zoneinfo import ZoneInfo

import lead_followup

EASTERN = ZoneInfo('America/New_York')
DAYS = ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')
DEFAULT_HOURS = {d: ['08:00', '17:00'] for d in DAYS[:5]}
SOURCE_CODES = (
    ('Beside window unavailable', 'beside_window_unavailable', 'Beside is not open in Chrome on the shop PC.'),
    ('account/mailbox unavailable', 'beside_signed_out', 'Beside looks signed out or on the wrong account. Sign in on the shop PC.'),
    ('Visible inventory absent', 'beside_inventory_unavailable', 'The Beside chat list could not be read.'),
    ('Observed Chats navigation unavailable', 'beside_inventory_unavailable', 'The Beside chat list could not be read.'),
    ('identity or stable content could not be verified', 'beside_validation_failed', 'Beside threads repeatedly failed validation; the page layout may have changed.'),
)


def classify(report):
    """Map a runner report to an alert code, or None for success/unknown-but-benign."""
    if not isinstance(report, dict) or report.get('enabled') is False:
        return None
    if report.get('ok'):
        return None
    source = str(report.get('source_read_failure') or '')
    for needle, code, _ in SOURCE_CODES:
        if needle in source:
            return code
    error = str(report.get('error') or 'worker_failed')
    if error == 'CAPTURE_INCOMPLETE':
        return 'beside_validation_failed'
    return 'beside_scan_' + error.lower()


def business_hours_between(start, end, hours):
    """Business hours (float) between two aware datetimes, America/New_York shop hours."""
    total, day = 0.0, start.astimezone(EASTERN).date()
    last = end.astimezone(EASTERN).date()
    while day <= last:
        span = hours.get(DAYS[day.weekday()]) if isinstance(hours, dict) else None
        if isinstance(span, (list, tuple)) and len(span) == 2:
            open_at = datetime.combine(day, time.fromisoformat(span[0]), EASTERN)
            close_at = datetime.combine(day, time.fromisoformat(span[1]), EASTERN)
            lo, hi = max(open_at, start), min(close_at, end)
            if hi > lo:
                total += (hi - lo).total_seconds() / 3600
        day += timedelta(days=1)
    return total


def message(code, detail):
    return {'title': 'Perfect Timing: Beside scan needs attention', 'priority': 'high', 'tags': 'warning',
            'body': f'{detail} (code {code}). No customer data in this alert.', 'click': ''}


def plan(report, state, now, settings):
    """Pure: returns (alerts [(code, message)], new_state)."""
    state = dict(state or {})
    repeat = int(settings.get('validation_failures_before_alert', 3))
    quiet_hours = settings.get('zero_new_business_hours')
    hours = settings.get('shop_hours') or DEFAULT_HOURS
    alerts = []
    code = classify(report)
    if report and report.get('ok'):
        state.pop('active', None); state['validation_failures'] = 0
        counts = report.get('counts') or {}
        if report.get('fresh_scan_performed') and (counts.get('newCards') or counts.get('conversationsChanged')):
            state['last_new_at'] = now.isoformat()
        if report.get('fresh_scan_performed'):
            state['last_scan_at'] = now.isoformat()
    elif code:
        if code == 'beside_validation_failed':
            state['validation_failures'] = state.get('validation_failures', 0) + 1
            if state['validation_failures'] < repeat:
                code = None
        if code and state.get('active') != code:
            detail = next((d for _, c, d in SOURCE_CODES if c == code), 'The Beside scan worker failed.')
            alerts.append((code, message(code, detail))); state['active'] = code
    if isinstance(quiet_hours, (int, float)) and quiet_hours > 0 and state.get('last_new_at'):
        since = datetime.fromisoformat(state['last_new_at'])
        if business_hours_between(since, now, hours) >= quiet_hours:
            if state.get('quiet_alerted_for') != state['last_new_at']:
                alerts.append(('beside_zero_new', message('beside_zero_new',
                    f'No new Beside conversations for {quiet_hours:g}+ business hours; check that scans and the phone line are working.')))
                state['quiet_alerted_for'] = state['last_new_at']
    elif not state.get('last_new_at') and report and report.get('fresh_scan_performed'):
        state['last_new_at'] = now.isoformat()
    return alerts, state


def run(config, report, private_dir, now=None, post=lead_followup.send_push):
    now = now or datetime.now(timezone.utc)
    settings = (config or {}).get('beside_alerts') or {}
    if settings.get('enabled') is not True:
        return {'enabled': False, 'ok': True}
    try:
        push = lead_followup.read_settings(config)
    except lead_followup.FollowupError as exc:
        return {'enabled': True, 'ok': False, 'error': str(exc)}
    if push is None:
        return {'enabled': True, 'ok': False, 'error': 'followup_push_not_configured'}
    path = Path(private_dir) / 'beside-alert-state.json'
    state = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
    alerts, state = plan(report, state, now, settings)
    sent = failed = 0
    for code, msg in alerts:
        for who in settings.get('recipients', ['raj']):
            if post(push['urls'][who], msg):
                sent += 1
            else:
                failed += 1
    lead_followup.atomic_json(path, state)
    return {'enabled': True, 'ok': failed == 0, 'alerts': [c for c, _ in alerts], 'pushes_sent': sent, 'pushes_failed': failed}
