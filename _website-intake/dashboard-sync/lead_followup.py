"""Lead follow-up: nudge Tony, then Raj, until a new lead is touched in Owner Desk.

Runs inside the existing Owner Desk Sync task. Reads the dashboard baseline with the
existing private sync credentials and sends operator pushes (ntfy-style URLs) to Tony
and Raj only. It never contacts customers, never writes leads and never changes stages.
Pushes carry no customer name, number or email: push topics are not private.
Off until the private config has followup.enabled = true and both push URLs.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
from urllib import error, request

# Minutes after the lead was received (provider time), who is pushed, how loudly.
LADDER = ((0, 'tony', 'default'), (15, 'tony', 'high'), (30, 'tony', 'max'), (60, 'raj', 'high'))
# Stages a lead sits in before anyone has worked it. Anything else counts as touched.
OPEN_STAGES = {'current_review', 'call_info', 'needs_first_contact', 'new'}
OFFLINE_ALARM_MINUTES = 15
DIGEST_HOUR_ET = 8
KEEP_SENT_DAYS = 7

EMERGENCY = re.compile(r"\b(?:stranded|side of the road|broke(?:n)? down|need(?:s)? a tow|towing|stuck on|won.?t move)\b", re.I)
BIG_JOB = re.compile(r"\b(?:overheat\w*|running hot|temp(?:erature)? gauge|coolant|steam\w*|head gasket|white smoke|"
    r"knock\w*|engine (?:noise|swap|replace\w*|seiz\w*|rebuild)|rebuil\w*|timing (?:chain|belt)|misfir\w*|"
    r"transmission|tranny|slipping|won.?t shift|no.?start|won.?t start|doesn.?t start|cranks? but|"
    r"burning oil|blue smoke|hydro-?lock\w*)\b", re.I)
PHONE = re.compile(r"\+?\d[\d\s().-]{6,}\d")
EMAIL = re.compile(r"\S+@\S+")


class FollowupError(Exception):
    pass


def instant(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def eastern(now):
    """America/New_York without tzdata (absent on many Windows Pythons): US rules since 2007."""
    def nth_sunday(year, month, n):
        first = datetime(year, month, 1, tzinfo=timezone.utc)
        return first + timedelta(days=(6 - first.weekday()) % 7 + 7 * (n - 1))
    year = now.year
    dst_start = nth_sunday(year, 3, 2) + timedelta(hours=7)   # 2 AM EST = 07:00 UTC
    dst_end = nth_sunday(year, 11, 1) + timedelta(hours=6)    # 2 AM EDT = 06:00 UTC
    return now + timedelta(hours=-4 if dst_start <= now < dst_end else -5)


def priority(lead):
    text = ' '.join(str(lead.get(k) or '') for k in ('concern', 'vehicle'))
    if (lead.get('stranded') == 'yes' and lead.get('starts') == 'no') or EMERGENCY.search(text):
        return 'emergency'
    return 'big_job' if BIG_JOB.search(text) else 'normal'


def is_open(lead, start_at):
    received = instant(lead.get('received_at'))
    return (received is not None and received >= start_at and not lead.get('historical')
            and lead.get('source') != 'beside-history' and lead.get('classification') != 'spam'
            and lead.get('folder') != 'junk'
            and lead.get('stage') in OPEN_STAGES and not lead.get('owner_updated_at'))


def due_steps(lead, now, sent):
    """Ladder steps now due and unsent, one push per person: a late arrival never sends a burst.
    Returns [(step, keys)] where keys are every due step folded into that person's push."""
    elapsed = (now - instant(lead['received_at'])).total_seconds() / 60
    grouped = {}
    for minutes, who, level in LADDER:
        key = f"{lead['id']}:{minutes}"
        if elapsed >= minutes and key not in sent:
            _, keys = grouped.get(who, (None, []))
            grouped[who] = ((minutes, who, level), keys + [key])  # the later step wins for that person
    return list(grouped.values())


def scrub(value, limit):
    text = EMAIL.sub('[email]', PHONE.sub('[number]', str(value or ''))).replace('\n', ' ').strip()
    return text if len(text) <= limit else text[:limit - 1].rstrip() + '…'


def push_message(lead, step, kind, dashboard_url=''):
    minutes, who, level = step
    label = {'emergency': 'EMERGENCY', 'big_job': 'BIG JOB', 'normal': 'New lead'}[kind]
    vehicle = scrub(lead.get('vehicle') or 'vehicle not given', 60)
    if minutes == 0:
        title = f"{label}: {vehicle}"
    elif who == 'raj':
        title = f"{label} not contacted in {minutes} min: {vehicle}"
    else:
        title = f"Still not contacted ({minutes} min) - {label}: {vehicle}"
    source = 'Phone call (Beside)' if str(lead.get('source', '')).startswith('beside') else 'Website request'
    body = f"{source}. {scrub(lead.get('concern'), 220) or 'No description.'}\nOpen Owner Desk, call the customer, then update the card."
    return {'title': title.encode('ascii', 'replace').decode('ascii'), 'body': body,
            'priority': 'urgent' if level == 'max' or kind == 'emergency' else level,
            'click': dashboard_url, 'tags': 'rotating_light' if kind != 'normal' else 'wrench'}


def offline_alarm(worker_online, now, state):
    """One push per outage of the Beside scan worker; recovery re-arms it."""
    if worker_online:
        state.pop('offline_since', None)
        state.pop('offline_alarm_sent', None)
        return None
    since = instant(state.get('offline_since')) or now
    state['offline_since'] = since.isoformat()
    if state.get('offline_alarm_sent') or now - since < timedelta(minutes=OFFLINE_ALARM_MINUTES):
        return None
    state['offline_alarm_sent'] = now.isoformat()
    return {'title': 'Beside calls are not reaching Owner Desk',
            'body': f"The Beside scan has been offline for {int((now - since).total_seconds() // 60)} min. "
                    'Check the shop laptop is awake and Beside is signed in to Chrome.',
            'priority': 'high', 'click': '', 'tags': 'warning'}


def digest(open_new, older_review, now, state):
    local = eastern(now)
    day = local.date().isoformat()
    if local.hour < DIGEST_HOUR_ET or state.get('digest_day') == day or open_new + older_review == 0:
        return None
    state['digest_day'] = day
    parts = [f"{open_new} lead(s) not yet contacted"] if open_new else []
    if older_review:
        parts.append(f"{older_review} older card(s) still in review")
    return {'title': 'Open leads this morning', 'body': '; '.join(parts) + '. Open Owner Desk to work them.',
            'priority': 'default', 'click': '', 'tags': 'clipboard'}


def counters(leads, start_at, now):
    """First touch = the first owner change on the card (stage or note), measured from receipt."""
    recent = [l for l in leads if instant(l.get('received_at')) and instant(l['received_at']) >= start_at
              and not l.get('historical') and l.get('source') != 'beside-history' and l.get('classification') != 'spam'
              and l.get('folder') != 'junk']
    waits = sorted((instant(l['owner_updated_at']) - instant(l['received_at'])).total_seconds() / 60
                   for l in recent if instant(l.get('owner_updated_at')))
    pct = lambda n: round(100 * n / len(recent)) if recent else None
    median = None
    if waits:
        mid = len(waits) // 2
        median = round(waits[mid] if len(waits) % 2 else (waits[mid - 1] + waits[mid]) / 2, 1)
    return {'leads_since_start': len(recent), 'uncontacted_now': sum(is_open(l, start_at) for l in recent),
            'touched_within_15_min_pct': pct(sum(w <= 15 for w in waits)),
            'touched_within_60_min_pct': pct(sum(w <= 60 for w in waits)),
            'median_minutes_to_first_touch': median,
            'quoted': sum(l.get('stage') in {'send_quote', 'quote_sent'} for l in recent),
            'booked': sum(l.get('stage') in {'booked', 'scheduled', 'call_schedule'} for l in recent)}


def plan(baseline, worker_online, now, state, start_at, dashboard_url=''):
    """Pure decision step: returns pushes to send as (state_key or None, recipient, message)."""
    if baseline.get('complete') is not True or not isinstance(baseline.get('leads'), list):
        raise FollowupError('dashboard_readback_incomplete')
    leads, sent = baseline['leads'], state.setdefault('sent', {})
    pushes = []
    for lead in sorted((l for l in leads if is_open(l, start_at)), key=lambda l: l['received_at']):
        kind = priority(lead)
        for step, keys in due_steps(lead, now, sent):
            pushes.append((keys, step[1], push_message(lead, step, kind, dashboard_url)))
    for alarm in (offline_alarm(worker_online, now, state),):
        if alarm:
            pushes += [([], 'tony', alarm), ([], 'raj', alarm)]
    older = sum(1 for l in leads if l.get('stage') == 'current_review' and not l.get('historical')
                and l.get('source') != 'beside-history' and l.get('folder') != 'junk'
                and not is_open(l, start_at) and not l.get('owner_updated_at'))
    note = digest(sum(is_open(l, start_at) for l in leads), older, now, state)
    if note:
        pushes += [([], 'tony', note), ([], 'raj', note)]
    return pushes, counters(leads, start_at, now)


def read_settings(config):
    settings = config.get('followup') or {}
    if settings.get('enabled') is not True:
        return None
    urls = {who: settings.get(who + '_push_url') for who in ('tony', 'raj')}
    if not all(isinstance(u, str) and u.startswith('https://') and not re.search(r'\s', u) for u in urls.values()):
        raise FollowupError('invalid_push_urls')
    start_at = instant(settings.get('start_at'))
    if start_at is None:
        raise FollowupError('invalid_start_at')
    return {'urls': urls, 'start_at': start_at, 'dashboard_url': settings.get('dashboard_url', '')}


def send_push(url, message, opener=None):
    headers = {'Title': message['title'], 'Priority': message['priority'], 'Tags': message['tags']}
    if message.get('click'):
        headers['Click'] = message['click']
    req = request.Request(url, data=message['body'].encode('utf-8'), method='POST', headers=headers)
    opener = opener or request.build_opener(request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=10) as response:
            return 200 <= response.status < 300
    except (error.URLError, TimeoutError, OSError):
        return False


def owner_baseline(config, opener=None):
    """Read-only: the same authenticated baseline the reconciliation uses."""
    base = str(config.get('url', '')).removesuffix('/api/sync').rstrip('/')
    if not base.startswith('https://'):
        raise FollowupError('invalid_dashboard_url')
    req = request.Request(base + '/api/beside-refresh/worker', data=b'{"action":"baseline"}', method='POST', headers={
        'Content-Type': 'application/json', 'Accept': 'application/json',
        'OAI-Sites-Authorization': 'Bearer ' + config['service_token'], 'x-owner-sync-token': config['sync_token'],
        'User-Agent': 'PerfectTiming-LeadFollowup/1.0'})
    opener = opener or request.build_opener(request.ProxyHandler({}))
    with opener.open(req, timeout=15) as response:
        live = json.loads(response.read(4_000_001))
    if live.get('ok') is not True:
        raise FollowupError('dashboard_response_unconfirmed')
    return live['baseline'], bool((live.get('state') or {}).get('worker', {}).get('online'))


def atomic_json(path, value):
    temp = path.with_name(path.name + '.' + str(os.getpid()) + '.tmp')
    temp.write_text(json.dumps(value, indent=2), encoding='utf-8')
    temp.replace(path)


def run(config, fetch_baseline, private_dir, now=None, post=send_push):
    """fetch_baseline() -> (baseline, worker_online). Writes a receipt with counts only."""
    now = now or datetime.now(timezone.utc)
    receipt = {'checked_at': now.isoformat(), 'ok': False, 'enabled': False}
    state_path, receipt_path = Path(private_dir) / 'followup-state.json', Path(private_dir) / 'followup-status.json'
    try:
        settings = read_settings(config)
        if settings is None:
            receipt.update(ok=True)
            return receipt
        receipt['enabled'] = True
        state = json.loads(state_path.read_text(encoding='utf-8')) if state_path.exists() else {}
        cutoff = now - timedelta(days=KEEP_SENT_DAYS)
        state['sent'] = {k: v for k, v in state.get('sent', {}).items() if (instant(v) or now) >= cutoff}
        baseline, worker_online = fetch_baseline()
        pushes, stats = plan(baseline, worker_online, now, state, settings['start_at'], settings['dashboard_url'])
        delivered = failed = 0
        for keys, who, message in pushes:
            if post(settings['urls'][who], message):
                delivered += 1
                for key in keys:
                    state['sent'][key] = now.isoformat()
            else:
                failed += 1
        atomic_json(state_path, state)
        receipt.update(ok=failed == 0, pushes_sent=delivered, pushes_failed=failed, counters=stats,
                       customer_messages_sent=False)
    except FollowupError as exc:
        receipt['error'] = str(exc)
    except Exception as exc:
        receipt['error'] = type(exc).__name__
    finally:
        try:
            atomic_json(receipt_path, receipt)
        except OSError:
            pass
    return receipt
