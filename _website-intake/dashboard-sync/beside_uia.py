"""Normalize explicitly scoped, rendered Beside captures. No network or UI actions."""
from __future__ import annotations
import calendar
from datetime import datetime, timedelta, timezone
import hashlib
import math
import re
from zoneinfo import ZoneInfo

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

def selected_text(capture):
    cid=capture.get('conversation_id','')
    if capture.get('format')!='beside-uia-thread/v1' or not ID.fullmatch(cid) or capture.get('source_url')!='https://app.beside.com/chats/'+cid:
        raise CaptureError('capture_identity_mismatch')
    nodes=capture.get('nodes')
    if not isinstance(nodes,list) or not nodes or len(nodes)>2500:
        raise CaptureError('invalid_capture_nodes')
    sidebar=[n for n in nodes if n.get('role')=='ControlType.Hyperlink' and URL.fullmatch(n.get('value') or '') and finite(n.get('left')) and finite(n.get('width'))]
    if not sidebar:
        raise CaptureError('sidebar_boundary_unverified')
    boundary=max(n['left']+n['width'] for n in sidebar)
    chosen=[n for n in nodes if finite(n.get('left')) and n['left']>=boundary and n.get('role') in ('ControlType.Text','ControlType.ListItem') and n.get('name')]
    if len(chosen)<3:
        raise CaptureError('selected_thread_not_substantive')
    return chosen

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

def conversation(capture,raw_sha256):
    text_nodes=selected_text(capture)
    title=text_nodes[0]['name']
    phone=''
    if re.fullmatch(r'(?:\+1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}',title):
        digits=re.sub(r'\D','',title)
        phone='+'+(digits if len(digits)==11 else '1'+digits)
        title='Name not provided'
    body='\n'.join(n['name'] for n in text_nodes[1:])
    return {'id':capture['conversation_id'],'name':title,'phone':phone,'email':'','vehicle':'',
        'concern':body,'received_at':displayed_activity(capture,text_nodes),'updated_at':None,
        'time_basis':'Latest rendered activity clock and following day separator, America/New_York; not first-ever receipt.',
        'raw':{'capture_sha256':raw_sha256,'capture':sanitize_raw(capture)}}

def generic_review(capture,observed_at):
    cid=capture['conversation_id']
    # Every automatic projection stays in owner review; no payment, repair, spam or
    # booking outcome is inferred from keywords or an AI-generated recap.
    return {'classification':'uncertain','include_in_dashboard':True,'reviewer':'Owner-authorized source-capture automation (not owner qualification)',
        'reviewed_at':observed_at,'evidence':[{'kind':'conversations','id':cid}],
        'category':'Captured conversation - review needed',
        'summary':'New or changed Beside conversation captured for review. Check the original thread before following up.',
        'uncertainties':['Repair intent and current follow-up state are not automatically qualified.','Activity date is from the visible thread, not proof of original receipt.','Only the rendered thread was read; recordings and older paged history are not included.']}
