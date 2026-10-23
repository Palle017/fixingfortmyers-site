"""Normalize explicitly scoped, rendered Beside captures. No network or UI actions."""
from __future__ import annotations
import calendar
from datetime import datetime, timedelta, timezone
import hashlib
import math
import re
import unicodedata
from zoneinfo import ZoneInfo
from beside_evidence import rendered_provenance, qualifier_summary, is_shop_reply

ID = re.compile(r'^prv_[A-Z0-9]{26}$')
URL = re.compile(r'^https://app\.beside\.com/chats/(prv_[A-Z0-9]{26})$')
CLOCK = re.compile(r'^(\d{1,2}:\d{2} [AP]M)$')
DAY = re.compile(r'^(Today|Yesterday|[A-Z][a-z]{2} \d{1,2})$')
MONTHS = {name:i for i,name in enumerate(calendar.month_abbr) if name}

class CaptureError(ValueError):
    pass

def finite(value):
    return isinstance(value,(int,float)) and math.isfinite(value)

def sanitize_raw(value):
    if isinstance(value,float) and not math.isfinite(value):
        return None
    if isinstance(value,list):
        return [sanitize_raw(item) for item in value]
    if isinstance(value,dict):
        return {key:sanitize_raw(item) for key,item in value.items()}
    return value

# A URL change is not proof that the rendered conversation has changed.
PHONE = re.compile(r'^(?:\+?1[ .-]?)?\(?[0-9]{3}\)?[ .-]?[0-9]{3}[ .-]?[0-9]{4}$')
CAPTION = re.compile(r'^(?P<title>.+?)\s+(?:[0-9]+\s*[smhdw]|Just now|Now|Today|Yesterday|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+[0-9]{1,2}(?:,\s+[0-9]{4})?)(?=\s|$)', re.I)
LOADING = re.compile(r'^(?:loading|loading messages|loading conversation|please wait)[.\s\u2026]*$', re.I)

def contact_identity(title):
    if not isinstance(title,str) or not title.strip():
        raise CaptureError('contact_identity_missing')
    clean=' '.join(unicodedata.normalize('NFC',title).split())
    if PHONE.fullmatch(clean):
        digits=re.sub(r'[^0-9]','',clean)
        return 'phone:'+digits[-10:]
    return 'name:'+clean.casefold()

def caption_identity(label):
    if not isinstance(label,str):
        raise CaptureError('inventory_identity_missing')
    match=CAPTION.match(' '.join(unicodedata.normalize('NFC',label).split()))
    if not match:
        raise CaptureError('inventory_identity_unreadable')
    return contact_identity(match['title'])

def _observation_text(capture,observation):
    cid=capture.get('conversation_id','')
    if capture.get('format')!='beside-uia-thread/v1' or not isinstance(cid,str) or not ID.fullmatch(cid) or capture.get('source_url')!='https://app.beside.com/chats/'+cid:
        raise CaptureError('capture_identity_mismatch')
    if not isinstance(observation,dict):
        raise CaptureError('invalid_capture_observation')
    expected=capture['source_url']
    if observation.get('observed_url_before')!=expected or observation.get('observed_url_after')!=expected:
        raise CaptureError('navigation_changed_during_capture')
    nodes=observation.get('nodes')
    if not isinstance(nodes,list) or not nodes or len(nodes)>2500 or any(not isinstance(n,dict) for n in nodes):
        raise CaptureError('invalid_capture_nodes')
    sidebar=[n for n in nodes if n.get('role')=='ControlType.Hyperlink' and isinstance(n.get('value'),str) and URL.fullmatch(n['value']) and finite(n.get('left')) and finite(n.get('width')) and n['width']>0]
    targets=[n for n in sidebar if n['value']==expected]
    if len(targets)!=1:
        raise CaptureError('target_link_not_unique')
    intended=caption_identity(capture.get('inventory_label'))
    if caption_identity(targets[0].get('name'))!=intended:
        raise CaptureError('inventory_target_changed')
    identities=[caption_identity(n.get('name')) for n in sidebar]
    if identities.count(intended)!=1:
        raise CaptureError('ambiguous_visible_contact_identity')
    boundary=max(n['left']+n['width'] for n in sidebar)
    chosen=[n for n in nodes if finite(n.get('left')) and n['left']>=boundary and n.get('role') in ('ControlType.Text','ControlType.ListItem') and isinstance(n.get('name'),str) and n['name']]
    if len(chosen)<3:
        raise CaptureError('selected_thread_not_substantive')
    if contact_identity(chosen[0]['name'])!=intended:
        raise CaptureError('rendered_contact_does_not_match_target')
    if any(LOADING.fullmatch(n['name'].strip()) for n in chosen):
        raise CaptureError('conversation_still_loading')
    return chosen

def selected_text(capture):
    """Validate the final observation; conversation() additionally requires stability."""
    return _observation_text(capture,capture)

def verified_text(capture):
    if capture.get('identity_format')!='beside-uia-identity/v1':
        raise CaptureError('capture_identity_unverified')
    prior=capture.get('prior_samples')
    if not isinstance(prior,list) or len(prior)!=2:
        raise CaptureError('three_observations_required')
    times=[]; fingerprints=[]; result=None
    for observation in [*prior,capture]:
        result=_observation_text(capture,observation)
        fingerprints.append(tuple(n['name'] for n in result))
        try:
            instant=datetime.fromisoformat(observation['observed_at'].replace('Z','+00:00'))
            if instant.tzinfo is None:raise ValueError('timezone missing')
        except (KeyError,TypeError,ValueError,AttributeError) as exc:
            raise CaptureError('invalid_observation_timestamp') from exc
        times.append(instant)
    if len(set(fingerprints))!=1:
        raise CaptureError('conversation_pane_not_stable')
    gaps=[(b-a).total_seconds() for a,b in zip(times,times[1:])]
    if any(gap<0.2 for gap in gaps) or (times[-1]-times[0]).total_seconds()>30:
        raise CaptureError('observations_not_independent')
    return result

def displayed_activity(capture,text_nodes):
    observed=datetime.fromisoformat(capture['observed_at'].replace('Z','+00:00'))
    if observed.tzinfo is None:
        raise CaptureError('capture_timezone_missing')
    local=observed.astimezone(ZoneInfo('America/New_York'))
    clock_index=next((i for i,n in enumerate(text_nodes) if CLOCK.fullmatch(n['name'])),None)
    if clock_index is None:
        raise CaptureError('displayed_activity_time_missing')
    marker=next((n['name'] for n in text_nodes[clock_index+1:] if DAY.fullmatch(n['name'])),None)
    if marker is None:
        raise CaptureError('displayed_activity_day_missing')
    if marker=='Today':
        day=local.date()
    elif marker=='Yesterday':
        day=local.date()-timedelta(days=1)
    else:
        month,number=marker.split()
        if month not in MONTHS:
            raise CaptureError('unrecognized_activity_month')
        day=local.date().replace(month=MONTHS[month],day=int(number))
        if day>local.date():
            day=day.replace(year=day.year-1)
    clock=datetime.strptime(text_nodes[clock_index]['name'],'%I:%M %p').time()
    instant=datetime.combine(day,clock,tzinfo=ZoneInfo('America/New_York'))
    if instant>local+timedelta(minutes=1):
        raise CaptureError('future_displayed_activity')
    return instant.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')

# Assumed Beside wording for call activity; unverified against every Beside layout. Override with
# beside_call_markers (regex) in the refresh settings if the shop's threads use other labels.
CALL_MARKERS=re.compile(r'\b(?:incoming call|outgoing call|missed call|voicemail|call ended|call summary|call recap|answered by|phone call|call transcript|recording)\b',re.I)

def _day_for(marker,local):
    if marker=='Today':return local.date()
    if marker=='Yesterday':return local.date()-timedelta(days=1)
    month,number=marker.split()
    if month not in MONTHS:raise CaptureError('unrecognized_activity_month')
    day=local.date().replace(month=MONTHS[month],day=int(number))
    return day.replace(year=day.year-1) if day>local.date() else day

def message_events(capture,text_nodes,call_markers=None):
    """Per-message timestamps: each visible clock is dated by the next day separator after it
    (the layout displayed_activity() already relies on), else the closest one before it.
    Clocks without any day separator are held (no invented dates)."""
    observed=datetime.fromisoformat(capture['observed_at'].replace('Z','+00:00'))
    if observed.tzinfo is None:raise CaptureError('capture_timezone_missing')
    local=observed.astimezone(ZoneInfo('America/New_York'))
    markers=call_markers if call_markers is not None else CALL_MARKERS
    names=[n['name'] for n in text_nodes[1:]]
    days=[(i,name) for i,name in enumerate(names) if DAY.fullmatch(name)]
    events=[];current=None
    for i,name in enumerate(names):
        if CLOCK.fullmatch(name):
            after=next((d for j,d in days if j>i),None)
            before=next((d for j,d in reversed(days) if j<i),None)
            marker=after or before
            if marker is None:raise CaptureError('displayed_activity_day_missing')
            clock=datetime.strptime(name,'%I:%M %p').time()
            instant=datetime.combine(_day_for(marker,local),clock,tzinfo=ZoneInfo('America/New_York'))
            if instant>local+timedelta(minutes=1):raise CaptureError('future_displayed_activity')
            current={'at':instant.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'),'text':[]}
            events.append(current)
        elif DAY.fullmatch(name):
            continue
        elif current is not None:
            current['text'].append(name)
    for event in events:
        body=' '.join(event['text'])
        event['kind']='call' if markers.search(body) else 'text'
    return events

def conversation(capture,raw_sha256,*,details=False,call_markers=None):
    text_nodes=verified_text(capture)
    title=text_nodes[0]['name']
    phone=''
    if re.fullmatch(r'(?:\+1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}',title):
        digits=re.sub(r'\D','',title)
        phone='+'+(digits if len(digits)==11 else '1'+digits)
        title='Name not provided'
    body='\n'.join(n['name'] for n in text_nodes[1:])
    item={'id':capture['conversation_id'],'name':title,'phone':phone,'email':'','vehicle':'',
        'concern':body,'received_at':displayed_activity(capture,text_nodes),'updated_at':None,
        'time_basis':'Latest rendered activity clock and following day separator, America/New_York; not first-ever receipt.',
        'raw':{'capture_sha256':raw_sha256,'capture':sanitize_raw(capture)}}
    if details:
        # Optional (beside_parse_details): earliest visible message time and call/text split.
        events=message_events(capture,text_nodes,call_markers)
        if events:
            times=sorted(e['at'] for e in events)
            item.update(received_at=times[0],updated_at=times[-1] if times[-1]!=times[0] else None,
                time_basis='Earliest rendered message clock in the visible thread, America/New_York; older paged history not read.')
        item['source']='beside_call' if any(e['kind']=='call' for e in events) else 'beside_text'
        item['messages']=[{'at':e['at'],'kind':e['kind']} for e in events]
    # Optional fields are preserved in the private archive; the dashboard contract
    # remains its existing source summary. Rendered activity is not a new request.
    item['provenance']=rendered_provenance(item,capture['observed_at'])
    return item

REVIEW_CHROME=re.compile(r'^(?:AI recap|AI summary|Summary|Transcript|Call details|Conversation details|Read|Unread|Delivered|Sent|Show more|Show less|View transcript|View recording|Play recording|Audio\s*Call|Receptionist\s*Call|No\s*Answer|Incoming call|Outgoing call|Missed call|Voicemail|Message|Ask\s*Beside\s*AI)$',re.I)
CALL_EVENT=re.compile(r'^(?:Audio\s*Call|Receptionist\s*Call|No\s*Answer|Incoming call|Outgoing call|Missed call|Voicemail)$',re.I)
DISPLAY_TIME=re.compile(r'^\d{1,2}:\d{2}(?::\d{2})?$')
DISPLAY_DATE=re.compile(r'^(?:(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?),?\s+)?(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{4})?$',re.I)
SHOP_AUTOTEXTS=(
    "Sorry we missed your call. Feel free to text us here, or we'll follow up shortly.",
    'Thanks for calling Perfect Timing Auto Repair. Please text your name, your vehicle’s year, make and model, and a short description of the issue so Tony can prepare before calling you back.',
)
SHOP_SIGNATURE='– Tony - Perfect Timing'
def _shop_text(value):return ' '.join(value.replace('’',"'").split())
SHOP_BOILERPLATE={_shop_text(text) for text in (*SHOP_AUTOTEXTS,SHOP_SIGNATURE,*(body+' '+SHOP_SIGNATURE for body in SHOP_AUTOTEXTS))}
OTP_MESSAGE=re.compile(r"^(?:Your (?:[A-Za-z][A-Za-z '&.-]{0,35} )?(?:verification|login|sign-in|one-time) code(?: is)?\s*:?\s*\d{4,8}[.!]?|\d{4,8} is your (?:[A-Za-z][A-Za-z '&.-]{0,35} )?(?:verification|login|sign-in|one-time) code[.!]?)$",re.I)
OTP_WARNING=re.compile(r"^(?:Do not share (?:this|your) code(?: with anyone)?[.!]?|This code expires in \d+ minutes?[.!]?)$",re.I)

def review_content(item):
    """Summarize captured words, without turning a recap into an owner decision."""
    lines=[]
    for line in str(item.get('concern') or '').splitlines():
        line=' '.join(line.split())
        if not line or CLOCK.fullmatch(line) or DAY.fullmatch(line) or DISPLAY_TIME.fullmatch(line) or DISPLAY_DATE.fullmatch(line) or REVIEW_CHROME.fullmatch(line) or _shop_text(line) in SHOP_BOILERPLATE or is_shop_reply(line):continue
        if line not in lines:lines.append(line)
    return lines

def generic_review(capture,observed_at,*,item=None):
    cid=capture['conversation_id']
    item=item if item is not None else conversation(capture,'0'*64)
    lines=review_content(item)
    # A complete, exact OTP template can be archived without creating an inquiry.
    # It remains uncertain, so a later actual customer message is reviewed afresh.
    has_call_event=any(CALL_EVENT.fullmatch(' '.join(line.split())) for line in str(item.get('concern') or '').splitlines())
    otp=not has_call_event and bool(lines) and any(OTP_MESSAGE.fullmatch(line) for line in lines) and all(OTP_MESSAGE.fullmatch(line) or OTP_WARNING.fullmatch(line) for line in lines)
    useful=[line for line in lines if not OTP_MESSAGE.fullmatch(line) and not OTP_WARNING.fullmatch(line)]
    missing='name and repair details' if not item.get('name') or item.get('name')=='Name not provided' else 'repair details'
    fallback=('Call' if has_call_event else 'Conversation')+' captured; '+missing+' still needed. Check the original conversation before following up.'
    summary=('Automated verification message only; no repair request is visible.' if otp else
        'Captured text: '+' '.join(useful) if useful else
        fallback)
    if not otp:
        qualified=qualifier_summary(item,observed_at)
        if qualified:summary=qualified
    if len(summary)>500:summary=summary[:499].rstrip()+'…'
    # Unknown, missed and silent callers remain owner-review items. No payment,
    # repair, spam or booking outcome is inferred from keywords or an AI recap.
    return {'classification':'uncertain','include_in_dashboard':not otp,'reviewer':'Owner-authorized source-capture automation (not owner qualification)',
        'reviewed_at':observed_at,'evidence':[{'kind':'conversations','id':cid}],
        'category':'Automated verification message' if otp else 'Captured conversation - review needed',
        'summary':summary,
        'uncertainties':['Repair intent and current follow-up state are not automatically qualified.','Activity date is from the visible thread, not proof of original receipt.','Only the rendered thread was read; recordings and older paged history are not included.']}


def validate_stdin():
    """Read-only validator used by the PowerShell capture loop; no PII in output."""
    import json
    import sys
    try:
        raw=sys.stdin.buffer.read(2_000_001)
        if len(raw)>2_000_000:
            raise CaptureError('capture_too_large')
        value=json.loads(raw)
        if not isinstance(value,dict):raise CaptureError('invalid_capture')
        conversation(value,hashlib.sha256(raw).hexdigest())
    except (CaptureError,ValueError,TypeError,KeyError,AttributeError):
        print('{"ok":false,"code":"CAPTURE_IDENTITY_UNVERIFIED"}')
        return 1
    print('{"ok":true,"identity_verified":true}')
    return 0

if __name__=='__main__':
    import sys
    if sys.argv[1:]!=['--verify-stdin']:
        raise SystemExit('Only --verify-stdin is supported; no source or dashboard writes.')
    raise SystemExit(validate_stdin())
