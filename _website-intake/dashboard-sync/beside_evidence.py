"""Bounded provenance from rendered words; no provider export or customer qualification."""
from datetime import datetime, timedelta, timezone
import re
from zoneinfo import ZoneInfo

CLOCK = re.compile(r'^\d{1,2}:\d{2}\s*[AP]M$', re.I)
DATE = re.compile(r'^(Today|Yesterday|([A-Za-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?)$', re.I)
MONTHS = {name: index for index, name in enumerate(
    ('jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'), 1)}
CALL = re.compile(r'^(?:Audio\s*Call|Receptionist\s*Call|No\s*Answer|Incoming call|Outgoing call|Missed call|Voicemail)$', re.I)
CHROME = re.compile(r'^(?:AI recap|AI summary|Summary|Transcript|Call details|Conversation details|Read|Unread|Delivered|Sent|Show more|Show less|View transcript|View recording|Play recording|Message|Ask\s*Beside\s*AI)$', re.I)
REPAIR = re.compile(r'\b(?:engine|brakes?|diagnos\w*|transmission|overheat\w*|oil leak|not start|won.t start|no.start|need(?:s|ed)? repair|repair (?:request|my|the|service))\b', re.I)
DURATION = re.compile(r'^(?:\d+(?:\.\d+)?\s*(?:seconds?|secs?|s|minutes?|mins?|m)|\d{1,2}:\d{2}(?::\d{2})?)$', re.I)
SHOP_TEXTS = (
    "Sorry we missed your call. Feel free to text us here, or we'll follow up shortly.",
    "Thanks for calling Perfect Timing Auto Repair. Please text your name, your vehicle's year, make and model, and a short description of the issue so Tony can prepare before calling you back.",
    "Hey, it's Tony at Perfect Timing. Text me your name, your vehicle's year, make and model, and what's going on with it. I'll give you a call back when I'm free.",
    "Hey, it's Tony at Perfect Timing. Text me your name and your vehicle's year, make and model. I'll give you a call back as soon as I can.",
)


def _text(value):
    return ' '.join(str(value or '').replace('\u2019', "'").split())


def is_shop_reply(value):
    text = _text(value)
    if re.fullmatch(r'(?:\u2013|-)?\s*Tony\s*-\s*Perfect Timing', text):
        return True
    text = re.sub(r'\s*(?:\u2013|-)?\s*Tony\s*-\s*Perfect Timing$', '', text).strip()
    return text in SHOP_TEXTS


def _instant(value):
    try:
        result = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return result if result.utcoffset() is not None else None
    except (TypeError, ValueError):
        return None


def _day(label, observed):
    match = DATE.fullmatch(label)
    if not match or observed is None:
        return None
    local = observed.astimezone(ZoneInfo('America/New_York'))
    if label.lower() == 'today':
        return local.date()
    if label.lower() == 'yesterday':
        return local.date() - timedelta(days=1)
    month = MONTHS.get(match[2][:3].lower())
    if month is None:
        return None
    try:
        day = local.date().replace(year=int(match[4] or local.year), month=month, day=int(match[3]))
        if not match[4] and day > local.date():
            day = day.replace(year=day.year - 1)
        return day if day <= local.date() else None
    except ValueError:
        return None


def _event(text, at=None, date_label=None, direction='unknown'):
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    useful = [line for line in lines if not CALL.fullmatch(line) and not CHROME.fullmatch(line)
              and not CLOCK.fullmatch(line) and not DATE.fullmatch(line) and not DURATION.fullmatch(line) and not is_shop_reply(line)]
    shop = any(is_shop_reply(line) for line in lines)
    call = any(CALL.fullmatch(line) for line in lines)
    if direction == 'unknown':
        if any(re.fullmatch('Outgoing call', line, re.I) for line in lines):
            direction = 'outbound'
        elif any(re.fullmatch('Incoming call', line, re.I) for line in lines):
            direction = 'inbound'
    return {'at': at, 'date_label': date_label, 'direction': direction,
            'kind': 'shop_reply' if shop and not useful else 'call' if call else 'text',
            'text': '\n'.join(useful)[:1200], 'has_shop_reply': shop, 'has_call_event': call,
            'repair_candidate': bool(REPAIR.search(' '.join(useful))),
            'basis': 'rendered_source_only'}


def rendered_provenance(item, observed_at):
    """Direction stays unknown unless the source explicitly supplies it.
    Conflicting preceding/following days leave event time unknown. A sole
    visible separator is rendered evidence, never a provider message timestamp.
    """
    observed = _instant(observed_at)
    events = []; displayed_days = set()
    for message in item.get('messages') or []:
        if not isinstance(message, dict):
            continue
        body = message.get('body') or message.get('text')
        if not isinstance(body, str) or not body.strip():
            continue
        instant = _instant(message.get('at') or message.get('sent_at'))
        at = (instant.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
              if instant and (observed is None or instant <= observed + timedelta(minutes=1)) else None)
        direction = message.get('direction')
        events.append(_event(body, at, direction=direction if direction in ('inbound', 'outbound') else 'unknown'))
        if len(events) == 50:
            break
    if not events:
        groups = item.get('groups') or ((item.get('raw') or {}).get('capture') or {}).get('groups') or []
        for ordinal, group in enumerate(groups[:50] if isinstance(groups, list) else []):
            if not isinstance(group, dict):
                continue
            body = group.get('text')
            if not isinstance(body, str):
                continue
            group_times = group.get('times') if isinstance(group.get('times'), list) else []
            times = [{key: value[:180] for key, value in time.items()
                      if key in ('display', 'datetime') and isinstance(value, str)}
                     for time in group_times[:10] if isinstance(time, dict)]
            instants = {_instant(time.get('datetime')) for time in times}
            instants.discard(None)
            instants = {instant for instant in instants if observed is None or instant <= observed + timedelta(minutes=1)}
            at = (next(iter(instants)).astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
                  if len(instants) == 1 else None)
            direction = group.get('direction')
            event = _event(body, at, direction=direction if direction in ('inbound', 'outbound') else 'unknown')
            event.update(basis='rendered_group_metadata', displayed_times=times,
                         has_audio=group.get('has_audio') is True, has_image=group.get('has_image') is True,
                         source_link_count=len(group.get('links')) if isinstance(group.get('links'), list) else 0,
                         rendered_group_ordinal=group.get('reverse_dom_ordinal') if type(group.get('reverse_dom_ordinal')) is int else ordinal)
            events.append(event)
    if not events:
        lines = [line.strip() for line in str(item.get('concern') or '').splitlines() if line.strip()][:2500]
        days = [(index, line) for index, line in enumerate(lines) if DATE.fullmatch(line)]
        displayed_days.update(_day(line, observed).isoformat() for _, line in days if _day(line, observed))
        clocks = [index for index, line in enumerate(lines) if CLOCK.fullmatch(line)]
        if not clocks:
            events = [_event('\n'.join(lines))]
        else:
            # Keep text before the first clock; it has no proved event timestamp.
            if clocks[0]:
                before = _event('\n'.join(lines[:clocks[0]]))
                if before['text'] or before['has_shop_reply']:
                    events.append(before)
            for position, index in enumerate(clocks[:50]):
                end = clocks[position + 1] if position + 1 < len(clocks) else len(lines)
                following = next((line for number, line in days if number > index), None)
                preceding = next((line for number, line in reversed(days) if number < index), None)
                unresolved = any(value and _day(value, observed) is None for value in (preceding, following))
                ambiguous = unresolved or bool(following and preceding and _day(following, observed) != _day(preceding, observed))
                label = None if ambiguous else following or preceding
                at = None
                if label:
                    try:
                        clock = datetime.strptime(lines[index].upper().replace(' ', ''), '%I:%M%p').time()
                        instant = datetime.combine(_day(label, observed), clock, tzinfo=ZoneInfo('America/New_York'))
                        if instant <= observed.astimezone(ZoneInfo('America/New_York')) + timedelta(minutes=1):
                            at = instant.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
                    except (TypeError, ValueError):
                        pass
                event = _event('\n'.join(lines[index + 1:end]), at, label)
                event.update(date_ambiguous=ambiguous, date_context=list(dict.fromkeys(value for value in (preceding, following) if value)))
                events.append(event)
    dated = [event['at'] for event in events if event['at']]
    displayed_days.update(_instant(value).astimezone(ZoneInfo('America/New_York')).date().isoformat() for value in dated)
    latest_day = max(displayed_days) if displayed_days else None
    latest = max(dated) if dated else None
    repair = [event for event in events if event['repair_candidate']]
    qualifiers = ['rendered_only']
    if any(event['direction'] == 'unknown' for event in events):
        qualifiers.append('direction_unknown')
    if events and all(event['direction'] == 'outbound' for event in events):
        qualifiers.append('outbound_only')
    if repair and any(event.get('date_ambiguous') for event in repair):
        qualifiers.append('mixed_date_repair_context')
    elif repair and latest_day and all(event['at'] and _instant(event['at']).astimezone(ZoneInfo('America/New_York')).date().isoformat() < latest_day for event in repair):
        qualifiers.append('older_repair_context')
    if events and any(event['has_shop_reply'] for event in events) and not any(event['text'] for event in events):
        qualifiers.append('shop_reply_without_customer_details')
    if any(event.get('has_call_event') for event in events) and not any(event['text'] for event in events):
        qualifiers.append('call_without_customer_details')
    return {'format': 'beside-rendered-provenance/v1', 'observed_at': observed_at,
            'latest_activity_at': latest, 'latest_displayed_day': latest_day, 'displayed_days': sorted(displayed_days),
            'events': events[:50], 'qualifiers': qualifiers,
            'limitations': ['Rendered clock/day association only; provider timestamps and unrendered history are unavailable.',
                            'Flat text does not establish message direction or whether a repair request is new.']}


def qualifier_summary(item, observed_at):
    provenance = item.get('provenance') or rendered_provenance(item, observed_at)
    qualifiers = provenance['qualifiers']
    if 'outbound_only' in qualifiers:
        return 'Outbound shop activity captured; it does not establish an inbound repair request. Keep this conversation unqualified for owner review.'
    if 'mixed_date_repair_context' in qualifiers:
        context = next(event for event in provenance['events'] if event['repair_candidate'])
        return ('Repair context with mixed rendered dates (' + ', '.join(provenance['displayed_days'])
                + '): ' + _text(context['text'])[:180]
                + '; event dates are unverified; later activity is not proof of a new request.')
    if 'older_repair_context' in qualifiers:
        earlier = next(event for event in provenance['events'] if event['repair_candidate'])
        return ('Earlier repair context (' + earlier['at'][:10] + '): ' + _text(earlier['text'])[:210]
                + '\nLater rendered date: ' + provenance['latest_displayed_day']
                + '; recent calls or shop replies are not proof of a new request.')
    if 'call_without_customer_details' in qualifiers:
        missing = 'name and repair details' if not item.get('name') or item.get('name') == 'Name not provided' else 'repair details'
        summary = 'Call captured; ' + missing + ' still needed.'
        if 'shop_reply_without_customer_details' not in qualifiers:
            summary += ' There are no customer repair details visible in this capture.'
        return summary + ' Check the original conversation before following up.'
    if 'shop_reply_without_customer_details' in qualifiers:
        return 'Shop automated reply captured; no customer repair details are visible. Keep this conversation unqualified for owner review.'
    return None


def review_needed(item, observed_at, *, since=None):
    """Fixed metadata for local review, never an automatic classification change."""
    provenance = item.get('provenance') or rendered_provenance(item, observed_at)
    previous = _instant(since)
    for event in provenance['events']:
        if not event['repair_candidate'] or event['direction'] == 'outbound':
            continue
        instant = _instant(event['at'])
        if previous and instant and instant <= previous:
            continue
        reason = ('changed_inbound_repair_evidence' if event['direction'] == 'inbound' else
                  'changed_unattributed_repair_context' if instant else 'changed_undated_repair_context')
        return {'requires_review': True, 'reason': reason, 'event_at': event['at'],
                'direction': event['direction'], 'basis': 'rendered_source_not_owner_qualification'}
    return {'requires_review': False, 'reason': 'no_new_substantive_repair_evidence',
            'event_at': None, 'direction': 'unknown', 'basis': 'rendered_source_not_owner_qualification'}
