"""Bounded, request-driven Beside capture on the existing signed-in Windows task.
No browser credentials, customer sends, owner decisions or fabricated scan health.
Uses the already installed private archive/planner and the existing refresh queue.
"""
from __future__ import annotations
from datetime import datetime, timezone
import hashlib
import importlib
import json
import math
import os
import re
from pathlib import Path
import sqlite3
import subprocess
import sys
import time
from urllib import error, request
from urllib.parse import urlsplit
from beside_uia import CaptureError, OTP_MESSAGE, OTP_WARNING, conversation, generic_review, review_content
import beside_intake
import beside_extract
import beside_attempt

ROOT=Path(__file__).resolve().parent
# BESIDE_REFRESH_SETTINGS lets the Linux service point at its own private settings; Windows default unchanged.
SETTINGS=Path(os.environ.get('BESIDE_REFRESH_SETTINGS') or r'C:\Users\LP15\PerfectTiming-Pipeline-private\beside-recovery-20261013\refresh\settings.json')
ALLOWED_ORIGINS={'https://dashboard.fixingfortmyers.com','https://perfect-timing-owner-desk.prudhvi-pallempati.chatgpt.site'}

class ScanError(RuntimeError):
    pass
class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def stamp():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))
def write(path,value):
    # Existing private files retain their ACLs. Unique evidence files are never reused.
    data=(json.dumps(value,ensure_ascii=False,sort_keys=True,indent=2,allow_nan=False)+'\n').encode()
    with Path(path).open('wb') as stream:
        stream.write(data);stream.flush();os.fsync(stream.fileno())
RELATIVE_LABEL=re.compile(r'^(.*?)\s+(Just now|Now|\d+\s*[smhdw])(?:\s+(.*))?$',re.I)

def relative_label(label):
    match=RELATIVE_LABEL.fullmatch(' '.join(str(label or '').split()))
    if not match:return None
    age=match[2].lower().replace(' ','')
    seconds=0 if age in ('justnow','now') else int(age[:-1])*{'s':1,'m':60,'h':3600,'d':86400,'w':604800}[age[-1]]
    return (match[1],match[3] or ''),seconds

def selected_changes(inventory,checkpoint,maximum):
    records=inventory.get('records')
    if not isinstance(records,list) or not records or len(records)>200:raise ScanError('CAPTURE_INCOMPLETE')
    ids=[row.get('conversation_id') for row in records]
    if len(ids)!=len(set(ids)):raise ScanError('SOURCE_IDENTITY_MISMATCH')
    prior=checkpoint.get('records',{})
    # Relative age text is presentation, but a reset can be a new identical call.
    # Recheck unchanged relative previews periodically as an additional safety net.
    now=inventory.get('captured_at');changed=[];recheck=[]
    for row in records:
        previous=prior.get(row['conversation_id'],{})
        old=relative_label(previous.get('label'));new=relative_label(row.get('label'))
        if old and new and old[0]==new[0] and new[1]>=old[1]:
            try:
                age=(datetime.fromisoformat(now.replace('Z','+00:00'))-datetime.fromisoformat(previous['checked_at'].replace('Z','+00:00'))).total_seconds()
            except (KeyError,ValueError,TypeError,AttributeError):age=900
            if age>=900 or age<0:recheck.append(row)
        elif previous.get('label')!=row.get('label'):
            changed.append(row)
    # New previews and age resets go first; oldest checked relative rows rotate.
    recheck.sort(key=lambda row:prior.get(row['conversation_id'],{}).get('checked_at',''))
    changed+=recheck
    return changed[:maximum],len(changed)
def preserve_known_fields(incoming,old):
    result=dict(incoming)
    if old:
        for key in ('name','phone','email','vehicle'):
            if old.get(key) and (not result.get(key) or result.get(key)=='Name not provided'):
                result[key]=old[key]
        result['received_at']=old['received_at']
    return result

def capture_fields_fingerprint(item):
    # Re-observing the same rendered words is not a new source update. Preserve
    # clocks/dates within concern so a repeated call with new activity still changes.
    facts={key:item.get(key) for key in ('name','phone','email','vehicle','concern','received_at')}
    return hashlib.sha256(json.dumps(facts,ensure_ascii=False,sort_keys=True).encode()).hexdigest()

CONTEXT_BLOCK=re.compile(r'^(Earlier saved context(?: \(source observed \d{4}-\d{2}-\d{2}\))?): (.*?)(?:\nLatest capture(?: \([^\n]*\))?: .*)?$',re.S)
NON_CONTEXT=('New or changed Beside conversation captured for review.','Call captured; name and repair details still needed.',
    'Conversation captured; name and repair details still needed.','Call captured; repair details still needed.',
    'Conversation captured; repair details still needed.',
    'No customer message details are visible','Automated verification message only;',
    'Previously reviewed archive-only conversation;','Updated source observations are archived;')

def saved_context(old):
    """Retain the earlier useful summary once, never the full formatted concern."""
    first=str((old or {}).get('concern') or '').split('\n\n',1)[0].strip()
    if not first or any(marker in first for marker in NON_CONTEXT):return None
    parsed=CONTEXT_BLOCK.fullmatch(first)
    if parsed:return parsed[1],parsed[2][:280]
    if first.startswith('Captured text: '):first=first[len('Captured text: '):]
    first=' '.join(first.split())
    date=str((old or {}).get('source_updated_at') or '')[:10]
    label='Earlier saved context'+(' (source observed '+date+')' if re.fullmatch(r'\d{4}-\d{2}-\d{2}',date) else '')
    return label,first[:280]

def source_review(capture,observed,item,old,prior_class=None,previous_fingerprint=None):
    decision=generic_review(capture,observed,item=item)
    if prior_class in ('spam','operational','personal'):
        decision.update(classification=prior_class,include_in_dashboard=False,
            summary='Previously reviewed archive-only conversation; fresh source preserved without changing its classification.')
    elif prior_class=='repair':
        decision.update(classification='repair',include_in_dashboard=True,category='Previously reviewed repair conversation')
    context=saved_context(old)
    if context and prior_class not in ('spam','operational','personal'):
        useful=[line for line in review_content(item) if not OTP_MESSAGE.fullmatch(line) and not OTP_WARNING.fullmatch(line)]
        latest=' '.join(useful)
        label,earlier=context
        decision['summary']=label+': '+earlier
        if latest!=earlier:
            latest=latest[:300] if latest else 'No new repair details visible; earlier context retained.'
            decision['summary']+='\nLatest capture ('+observed[:10]+'): '+latest
    if old and previous_fingerprint==capture_fields_fingerprint(item):
        decision['include_in_dashboard']=False
    return decision

def capture_command(settings,mode,output,settings_path):
    # Default: the Windows UI Automation capture. Opt-in Linux/Playwright capture with the same
    # arguments and output format (beside_capture_backend: "linux").
    if settings.get('beside_capture_backend')=='linux':
        return [sys.executable,str(ROOT/'capture_beside_linux.py'),'-Mode',mode,
            '-OutputPath',str(output),'-SettingsPath',str(settings_path)]
    return ['powershell.exe','-NoProfile','-File',str(ROOT/'capture_beside.ps1'),'-Mode',mode,
        '-OutputPath',str(output),'-SettingsPath',str(settings_path),'-PythonExecutable',sys.executable]

HTTP_TIMEOUT_SECONDS=12
FINALIZATION_RESERVE_SECONDS=120
CAPTURE_MINIMUM_SECONDS=10

def capture_ceiling(settings):
    value=float(settings.get('beside_linux_capture_timeout_seconds',90)) if settings.get('beside_capture_backend')=='linux' else 25.0
    if not math.isfinite(value) or value<CAPTURE_MINIMUM_SECONDS or value>3600:
        raise ScanError('LOCAL_STORAGE_UNAVAILABLE')
    return value

def minimum_claim_budget(settings):
    # One claim, a fresh claimed inventory, the first full thread, and finalization.
    # Respect explicitly low settings by deferring; never silently extend a caller's slot.
    return HTTP_TIMEOUT_SECONDS+2*capture_ceiling(settings)+FINALIZATION_RESERVE_SECONDS+3

def capture_timeout(settings,remaining,reserve_seconds=0):
    available=remaining-reserve_seconds-3
    if available<=0:raise ScanError('CAPTURE_INCOMPLETE')
    return min(capture_ceiling(settings),available)

def validate_claim(value,expected):
    # The backend has no token recovery endpoint. Only the exact CAS winner may proceed.
    if not isinstance(value,dict) or type(value.get('claimed')) is not bool:
        raise ScanError('WORKER_RESPONSE_INVALID')
    if not isinstance(expected,dict):raise ScanError('WORKER_RESPONSE_INVALID')
    state=value.get('state')
    if not isinstance(state,dict) or state.get('status') not in ('queued','running','complete','failed','attention','idle'):
        raise ScanError('WORKER_RESPONSE_INVALID')
    if value['claimed'] is False:
        if value.get('claimToken') is not None:raise ScanError('WORKER_RESPONSE_INVALID')
        return None
    token=value.get('claimToken')
    if (not isinstance(token,str) or not re.fullmatch(r'[a-f0-9]{64}',token)
        or state.get('status')!='running' or state.get('phase')!='reading'
        or not beside_attempt._identifier(expected.get('jobId'))
        or state.get('jobId')!=expected.get('jobId')
        or not beside_attempt._date(expected.get('requestedAt'))
        or state.get('requestedAt')!=expected.get('requestedAt')
        or not beside_attempt._date(state.get('startedAt'))
        or beside_attempt._date(state['startedAt'])<beside_attempt._date(expected['requestedAt'])):
        raise ScanError('WORKER_RESPONSE_INVALID')
    return value

def failure_code(code):
    # Private v27 fail enum does not accept transport-local diagnostic codes.
    return code if code in beside_attempt.FAILURE_CODES else 'WORKER_FAILED'

# Existing import/readback gate remains independently enforced.
IMPORT_RESERVE_SECONDS=60
PREPARATION_RESERVE_SECONDS=15
FINISH_RESERVE_SECONDS=PREPARATION_RESERVE_SECONDS+IMPORT_RESERVE_SECONDS
READBACK_RESERVE_SECONDS=38


OWNER_REQUEST_MESSAGE=('No Refresh Beside job is queued. Workers cannot request jobs directly; press Refresh Beside '
    'in Owner Desk (or enable Owner Desk automatic refresh), then run --scan-now or let the timer pick it up.')

def server_code(value):
    """A short server error code (e.g. INVALID_ACTION) from a JSON reply, or None. Never free text."""
    if isinstance(value,(bytes,bytearray)):
        try:value=json.loads(value)
        except ValueError:return None
    if not isinstance(value,dict):return None
    for key in ('code','errorCode','error'):
        v=value.get(key)
        if isinstance(v,str) and v in beside_attempt.SERVER_CODES:return v
    return None

WORKER_REQUEST_SECONDS=12
QUEUE_ERROR_CODES=frozenset(('BROWSER_UNAVAILABLE','BESIDE_SIGN_IN_REQUIRED','SOURCE_IDENTITY_MISMATCH','CAPTURE_INCOMPLETE',
    'REVIEW_REQUIRED','VERIFICATION_REQUIRED','VALIDATION_FAILED','BASELINE_UNAVAILABLE','IMPORT_REJECTED',
    'IMPORT_RESULT_UNCERTAIN','READBACK_MISMATCH','LOCAL_STORAGE_UNAVAILABLE','WORKER_FAILED'))
WORKER_DIAGNOSTIC_KEYS=('worker_action','worker_http_status','worker_error_code','worker_transport_error')

def retryable_worker_action(body):
    # Reuse the identical encoded request. Never replay a claim, completion,
    # failure, heartbeat (which may enqueue), resolution or source import.
    return body=={'action':'baseline'} or (set(body)=={'action','jobId','claimToken','phase'} and
        body['action']=='progress' and body['phase'] in ('reading','checking','importing','verifying') and
        all(isinstance(body[key],str) and body[key] for key in ('jobId','claimToken')))

def worker_retry_reserve(body,phase):
    target=body.get('phase') if body.get('action')=='progress' else phase
    if target=='verifying':
        # After progress: baseline + completion + proof writes; after baseline:
        # only completion + proof writes. These consume the readback allowance.
        return (2 if body['action']=='progress' else 1)*WORKER_REQUEST_SECONDS+2
    if target=='importing':return READBACK_RESERVE_SECONDS+WORKER_REQUEST_SECONDS
    return FINISH_RESERVE_SECONDS

def transport_diagnostic(exc):
    detail={'exception_type':type(exc).__name__}
    reason=exc.reason if isinstance(exc,error.URLError) else exc
    if isinstance(reason,BaseException):
        detail['reason_type']=type(reason).__name__
        number=getattr(reason,'errno',None)
        if isinstance(number,int):detail['errno']=number
    return detail

def worker_response(opener,req,body,remaining,report,phase,*,minimum_budget=0,finish_reserve=None):
    endpoint=urlsplit(req.full_url)
    safe=(endpoint.scheme+'://'+endpoint.netloc in ALLOWED_ORIGINS and endpoint.path=='/api/beside-refresh/worker'
        and not endpoint.query and not endpoint.fragment and retryable_worker_action(body))
    reserve=worker_retry_reserve(body,phase)
    target=body.get('phase') if body.get('action')=='progress' else phase
    if finish_reserve is not None and target in ('reading','checking'):
        reserve=max(reserve,finish_reserve)
    for attempt in range(2 if safe else 1):
        budget=remaining()
        # Final guard is after request serialization and all durable journal writes.
        # Returning None here is known to precede the sole claim POST.
        if not attempt and body.get('action')=='claim' and budget<minimum_budget:return None
        if budget<2:raise ScanError('CAPTURE_INCOMPLETE')
        if attempt and budget<reserve+WORKER_REQUEST_SECONDS:raise ScanError('WORKER_UNREACHABLE')
        timeout=min(WORKER_REQUEST_SECONDS,budget-(reserve if attempt else 0))
        try:
            report['worker_step']='request'
            with opener.open(req,timeout=timeout) as response:
                report['worker_step']='response_read'
                raw=response.read(4_000_001)
                if response.status!=200 or len(raw)>4_000_000:raise ScanError('BASELINE_UNAVAILABLE')
                report['worker_step']='response_decode'
                value=json.loads(raw)
        except error.HTTPError as exc:
            report['worker_exception']='HTTPError'
            report['worker_http_status']=exc.code
            try:code=server_code(exc.read(4096))
            except Exception:code=None
            finally:exc.close()
            if code:report['worker_error_code']=code
            raise ScanError('WORKER_HTTP_'+str(exc.code)) from None
        except (error.URLError,TimeoutError,OSError) as exc:
            name=type(exc).__name__
            report['worker_exception']=name if name in beside_attempt.EXCEPTION_TYPES else 'Exception'
            report['worker_transport_error']=transport_diagnostic(exc)
            if not attempt and safe and remaining()>=reserve+WORKER_REQUEST_SECONDS:
                report.setdefault('worker_transport_retries',[]).append({'action':body['action'],
                    **({'phase':body['phase']} if body['action']=='progress' else {}),**transport_diagnostic(exc)})
                continue
            raise ScanError('WORKER_UNREACHABLE') from None
        except ValueError as exc:
            report['worker_exception']='JSONDecodeError' if isinstance(exc,json.JSONDecodeError) else 'ValueError'
            raise ScanError('WORKER_RESPONSE_INVALID') from None
        report['worker_step']='response_validate'
        if not isinstance(value,dict):raise ScanError('WORKER_RESPONSE_INVALID')
        if value.get('ok') is not True:
            code=server_code(value)
            if code:report['worker_error_code']=code
            raise ScanError('BASELINE_UNAVAILABLE')
        return value

def queue_failure_code(code,phase):
    if code in QUEUE_ERROR_CODES:return code
    return 'IMPORT_RESULT_UNCERTAIN' if phase in ('importing','verifying') else 'WORKER_FAILED'

def report_queue_failure(worker,report,code,phase):
    original={key:report[key] for key in WORKER_DIAGNOSTIC_KEYS if key in report}
    report['original_failure']={'error':code,'phase':phase,**original}
    wire_code=queue_failure_code(code,phase)
    try:
        worker('fail',errorCode=wire_code)
        report['failure_reporting']={'accepted':True,'errorCode':wire_code}
    except Exception as exc:
        report['queue_failure_unconfirmed']=True
        report['failure_reporting']={'accepted':False,'errorCode':wire_code,
            'exception_type':type(exc).__name__,**{key:report[key] for key in WORKER_DIAGNOSTIC_KEYS if key in report}}
    finally:
        # Reporting must not replace the action/status/type that caused failure.
        for key in WORKER_DIAGNOSTIC_KEYS:
            if key in original:report[key]=original[key]
            else:report.pop(key,None)

def attention_evidence(runs,job_id):
    """Local proof about an attention job: did this worker claim it, and did it try an import?"""
    if not job_id:return {'found':False}
    for lease_path in Path(runs).glob('*/lease.json'):
        try:lease=load(lease_path)
        except (OSError,ValueError):continue
        if (lease.get('state') or {}).get('jobId')==job_id:
            return {'found':True,'import_attempted':(lease_path.parent/'apply-journal.json').exists()}
    return {'found':False}

def require_captured_changes(selected,captures):
    if selected and not captures:raise ScanError('CAPTURE_INCOMPLETE')

def sample_when_unchanged(inventory,checkpoint,selected):
    if selected:return selected
    # A queued no-change refresh still reads one actual thread. Rotate the oldest
    # checked visible row; its content fingerprint prevents an unchanged card write.
    return [min(inventory['records'],key=lambda row:checkpoint.get('records',{}).get(row['conversation_id'],{}).get('checked_at',''))]

def capture_change_count(captures,plan,unchanged_probe):
    # A sampled unchanged preview can reveal new content. The receipt must still
    # cover any resulting card changes; a genuinely unchanged sample reports zero.
    card_changes=len(plan['proposed']['new'])+len(plan['proposed']['updated'])
    return max(card_changes,0 if unchanged_probe else len(captures))

def begin_import(remaining,progress):
    # Refuse before the remote phase changes: no POST has been attempted yet.
    if remaining()<IMPORT_RESERVE_SECONDS:raise ScanError('CAPTURE_INCOMPLETE')
    progress()
    return min(30,remaining()-READBACK_RESERVE_SECONDS)

def read_threads(selected,read_one,remaining,progress,*,skip_failed=False,max_failures=5,sleep=time.sleep,base_delay=0.5,max_delay=4.0,reserve_seconds=0,minimum_remaining=None):
    minimum_remaining=max(35+reserve_seconds,minimum_remaining if minimum_remaining is not None else 35)

    """Read selected threads. Default: stop at the first failure (previous behavior).
    With skip_failed, a failed thread is skipped with exponential backoff and the pass continues,
    up to max_failures. Failed threads are never checkpointed, so they stay pending.
    The caller can reserve time for archive/import/readback before starting another read."""
    captures=[];failures=[]
    for row in selected:
        if remaining()<minimum_remaining:break

        cid=row['conversation_id']
        try:
            captures.append(read_one(cid))
            if len(captures)%3==0:progress()
        except ScanError:
            failures.append(cid)
            if not skip_failed or len(failures)>=max_failures:break
            delay=min(max_delay,base_delay*(2**(len(failures)-1)))
            if remaining()-delay<minimum_remaining:break

            sleep(delay)
    return captures,failures

def run(*,settings_path=SETTINGS,budget_seconds=240,manual=False):
    started=time.monotonic();lease=None;run_dir=None;phase='reading';attempt=None;operation='start';operation_started=started
    report={'ok':False,'checked_at':stamp(),'fresh_scan_performed':False,'customer_messages_sent':False}
    def remaining():return budget_seconds-(time.monotonic()-started)
    if not isinstance(budget_seconds,(int,float)) or not math.isfinite(budget_seconds) or budget_seconds<15:
        return {**report,'error':'scan_time_budget_unavailable'}
    try:
        # This journal exists before a claim or run directory and contains no credentials or payloads.
        attempt=beside_attempt.Attempt(Path(settings_path).parent,time.monotonic)
        settings=load(settings_path);private=Path(settings['private_archive_root']).resolve()
        refresh=private/'refresh';runs=Path(settings['runs_directory']).resolve()
        if not runs.is_relative_to(refresh.resolve()):raise ScanError('LOCAL_STORAGE_UNAVAILABLE')
        dependency=Path(settings['source_checkout']).resolve()/'scripts/beside-import'
        sys.path.insert(0,str(dependency))
        archive=importlib.import_module('beside_archive')
        queue=importlib.import_module('refresh_worker')
        config=load(settings['private_sync_config']);parsed=urlsplit(config['url'])
        origin=parsed.scheme+'://'+parsed.netloc
        if origin not in ALLOWED_ORIGINS or parsed.path not in ('','/','/api/sync') or parsed.query or parsed.fragment:
            raise ScanError('SOURCE_IDENTITY_MISMATCH')
        for key in ('service_token','sync_token'):
            if not isinstance(config.get(key),str) or len(config[key])<16 or any(c.isspace() for c in config[key]):raise ScanError('LOCAL_STORAGE_UNAVAILABLE')
        opener=request.build_opener(request.ProxyHandler({}),NoRedirect())
        def event(name,**extra):
            nonlocal operation,operation_started
            operation=name;operation_started=time.monotonic()
            report.pop('worker_exception',None)
            report.pop('worker_transport_error',None)
            attempt.event(name,phase=phase,remaining=remaining(),**extra)
        def defer_budget(ready):
            report.update(ok=True,worker_ready=ready,readiness_deferred=True,
                deferred_reason='INSUFFICIENT_CAPTURE_BUDGET',
                minimum_remaining_seconds=minimum_claim_budget(settings),
                remaining_seconds=round(remaining(),3))
            event('budget.deferred',error='INSUFFICIENT_CAPTURE_BUDGET')
            write(refresh/'uia-worker-status.json',report)
            return report
        def call(path,body):
            report.pop('worker_http_status',None);report.pop('worker_error_code',None)
            req=request.Request(origin+path,data=archive.canonical(body).encode(),headers={
                'Content-Type':'application/json','Accept':'application/json',
                'OAI-Sites-Authorization':'Bearer '+config['service_token'],'x-owner-sync-token':config['sync_token']})
            began=time.monotonic();report['worker_step']='request'
            value=worker_response(opener,req,body,remaining,report,phase,
                minimum_budget=minimum_claim_budget(settings) if body.get('action')=='claim' else 0,
                finish_reserve=FINALIZATION_RESERVE_SECONDS)
            if value is not None:
                attempt.event(operation,phase=phase,elapsed=time.monotonic()-began,remaining=remaining(),stage='response_validate')
            return value
        def worker(action,**extra):
            body={'action':action,**extra}
            if action in ('progress','complete','fail'):
                body.update(jobId=lease['state']['jobId'],claimToken=lease['claimToken'])
            report['worker_action']=action
            event('worker.'+action)
            return call('/api/beside-refresh/worker',body)
        def capture(mode,output,*,cid=None,inventory=None,reserve_seconds=0):
            event('capture.'+mode)
            report.pop('worker_http_status',None);report.pop('worker_error_code',None)
            args=capture_command(settings,mode,output,settings_path)
            if cid:args+=['-ConversationId',cid,'-InventoryPath',str(inventory)]
            # Linux threads already contain the reviewed same-thread stability retry.
            attempts=1 if mode=='thread' and settings.get('beside_capture_backend')=='linux' else 2
            for number in range(attempts):
                allowance=capture_timeout(settings,remaining(),reserve_seconds)
                if allowance<CAPTURE_MINIMUM_SECONDS:raise ScanError('CAPTURE_INCOMPLETE')
                began=time.monotonic();report['worker_step']='capture_process'
                try:
                    completed=subprocess.run(args,capture_output=True,text=True,timeout=allowance,
                        creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                except subprocess.TimeoutExpired:
                    report['worker_exception']='TimeoutExpired'
                    report['source_read_failure']='source_read_timeout'
                    raise ScanError('BROWSER_UNAVAILABLE') from None
                report['worker_step']='capture_output'
                attempt.event('capture.'+mode,phase=phase,elapsed=time.monotonic()-began,remaining=remaining())
                if completed.returncode==0:return load(output)
                report['source_read_failure']=beside_attempt.source_reason(completed.stderr)
                # Retry a source read only when another full read fits without consuming its reserve.
                if (number+1>=attempts or output.exists()
                    or remaining()<capture_ceiling(settings)+reserve_seconds+0.4):break
                time.sleep(0.4)
            raise ScanError('BROWSER_UNAVAILABLE')
        if manual:
            # Fail fast, before opening a browser, when there is no owner-requested job to run.
            state=worker('baseline')['state']
            if state['status']!='queued':
                report.update(ok=False,queue_status=state['status'],error='OWNER_REQUEST_REQUIRED',
                    owner_request_required=OWNER_REQUEST_MESSAGE)
                # Separate file: a refusal says nothing about source access, so it must not overwrite
                # uia-worker-status.json (the Linux heartbeat reads that to decide if it is ready).
                write(refresh/'uia-scan-now-status.json',report)
                return report
        # Real signed-in source access must succeed before a readiness heartbeat.
        probe_dir=refresh/'uia-readiness';probe_dir.mkdir(exist_ok=True)
        probe_path=probe_dir/(datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.json')
        capture('inventory',probe_path)
        beat=worker('heartbeat')
        # With BESIDE_AUTO_REFRESH_INTERVAL_MINUTES set on Owner Desk, the heartbeat itself may queue
        # an automatic job (requested_by automatic:beside-ready-worker); the baseline below sees it.
        if isinstance(beat.get('automatic'),dict):
            report['automatic']={k:beat['automatic'].get(k) for k in ('enabled','intervalMinutes','queued','reason')}
        state=worker('baseline')['state']
        held=attempt.held_claims(state)
        if state['status']!='queued' and (manual or settings.get('beside_auto_scan_minutes')):
            # Workers cannot request jobs. Jobs come from the owner's Refresh Beside button or from Owner
            # Desk's own automatic refresh, which runs server-side on this worker's heartbeat when
            # BESIDE_AUTO_REFRESH_INTERVAL_MINUTES is set. beside_auto_scan_minutes is informational only.
            report['owner_request_required']=OWNER_REQUEST_MESSAGE
        if manual and state['status']!='queued':
            report.update(ok=False,worker_ready=True,queue_status=state['status'],error='OWNER_REQUEST_REQUIRED')
            write(refresh/'uia-worker-status.json',report)
            return report
        if state['status']!='queued':
            report.update(ok=True,worker_ready=True,queue_status=state['status'],scan_trigger='Owner Dashboard Refresh Beside')
            write(refresh/'uia-worker-status.json',report)
            return report
        # Durable pending evidence precedes the POST; timers never repeat an uncertain claim.
        if (not beside_attempt._identifier(state.get('jobId')) or not beside_attempt._date(state.get('requestedAt'))
            or state.get('phase')!='queued'):
            raise ScanError('WORKER_RESPONSE_INVALID')
        if held and not manual:
            report.update(ok=True,worker_ready=True,queue_status=state['status'],
                readiness_deferred=True,deferred_reason='CLAIM_REVIEW_REQUIRED')
            event('held',error='CLAIM_REVIEW_REQUIRED')
            write(refresh/'uia-worker-status.json',report)
            return report
        if held and attempt.held_claims(state,manual=True,persist=False):
            # A manual claim readback cannot release an uncertain import.
            report.update(ok=True,worker_ready=True,queue_status=state['status'],
                readiness_deferred=True,deferred_reason='CLAIM_REVIEW_REQUIRED')
            event('held',error='CLAIM_REVIEW_REQUIRED')
            write(refresh/'uia-worker-status.json',report)
            return report
        if remaining()<minimum_claim_budget(settings):return defer_budget(True)
        attempt.claim('pending',state);event('claim.pending')
        # This particular deferral is known to precede any POST; old manual latches remain intact.
        if remaining()<minimum_claim_budget(settings):
            attempt.claim('refused')
            return defer_budget(True)
        reply=worker('claim')
        if reply is None:
            attempt.claim('refused')
            return defer_budget(True)
        report['worker_step']='claim_validate';operation='worker.claim'
        granted=validate_claim(reply,state)
        if granted is None:
            attempt.claim('refused');event('claim.refused')
            if held:attempt.held_claims(state,manual=True)
            report.update(ok=True,worker_ready=True,queue_status=reply['state']['status'],
                claim_not_acquired=True)
            write(refresh/'uia-worker-status.json',report)
            return report
        lease=granted;attempt.claim('acquired');event('claim.acquired')
        if held:attempt.held_claims(state,manual=True)
        event('mkdir')
        run_dir=runs/('queued-uia-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));run_dir.mkdir()
        write(run_dir/'lease.json',lease)
        inventory=capture('inventory',run_dir/'inventory.json',
            reserve_seconds=capture_ceiling(settings)+FINALIZATION_RESERVE_SECONDS)
        checkpoint_path=refresh/'uia-checkpoint.json'
        checkpoint=load(checkpoint_path) if checkpoint_path.exists() else {'records':{}}
        selected,total_changed=selected_changes(inventory,checkpoint,min(25,int(settings.get('maximum_changed_threads_per_pass',25))))
        unchanged_probe=not selected
        selected=sample_when_unchanged(inventory,checkpoint,selected)
        def read_one(cid):
            return capture('thread',run_dir/('thread-'+cid+'.json'),cid=cid,inventory=run_dir/'inventory.json',
                reserve_seconds=FINALIZATION_RESERVE_SECONDS)
        captures,capture_failures=read_threads(selected,read_one,remaining,
            lambda:worker('progress',phase='reading') if remaining()>=FINALIZATION_RESERVE_SECONDS+HTTP_TIMEOUT_SECONDS+3 else None,
            skip_failed=settings.get('beside_skip_failed_threads') is True,
            max_failures=int(settings.get('beside_max_thread_failures',5)),
            minimum_remaining=capture_ceiling(settings)+FINALIZATION_RESERVE_SECONDS)

        report['thread_failures']=len(capture_failures)
        require_captured_changes(selected,captures)
        worker('progress',phase='checking');phase='checking'
        baseline=worker('baseline')['baseline'];archive.validate_baseline(baseline)
        by_id={row['id']:row for row in baseline['leads']}
        observed=stamp();review={'format':'beside-review/v1','classifications':{},'crosswalks':[]};conversations=[];held=[];capture_hashes={}
        event('archive.plan')

        database=archive.connect(settings['persistent_archive'])
        try:
            backup=sqlite3.connect(str(run_dir/'archive-before.sqlite3'));database.backup(backup);backup.close()
            for cap in captures:
                cid=cap['conversation_id'];raw=(run_dir/('thread-'+cid+'.json')).read_bytes()
                try:item=conversation(cap,hashlib.sha256(raw).hexdigest(),details=settings.get('beside_parse_details') is True,
                    call_markers=re.compile(settings['beside_call_markers'],re.I) if settings.get('beside_call_markers') else None)
                except CaptureError:
                    held.append(cid);continue
                old=by_id.get('beside:chat:'+cid)
                item=preserve_known_fields(item,old)
                item=beside_extract.apply(item,explicit_only=settings.get('beside_extract_fields') is not True)
                archived=database.execute('SELECT parent_id FROM conversations WHERE mailbox_id=? AND provider_id=?',(settings['mailbox_id'],cid)).fetchone()
                if archived and archived['parent_id']:item['contact_id']=archived['parent_id']
                prior=database.execute('SELECT classification FROM conversation_classifications WHERE mailbox_id=? AND conversation_id=? ORDER BY reviewed_at DESC LIMIT 1',(settings['mailbox_id'],cid)).fetchone()
                decision=source_review(cap,observed,item,old,prior['classification'] if prior else None,
                    checkpoint.get('records',{}).get(cid,{}).get('content_sha256'))
                capture_hashes[cid]=capture_fields_fingerprint(item)
                review['classifications'][cid]=decision;conversations.append(item)
            require_captured_changes(selected,conversations)
            scope=f"{len(inventory['records'])} recent visible All-list conversations inventoried; {len(captures)} selected rendered threads read. {max(0,total_changed-len(captures))} changed/uninspected visible conversations remain outside this bounded pass. Not a full account export."
            if unchanged_probe:scope+=' No changed preview was detected; one oldest checked visible thread was sampled.'
            snapshot={'format':'beside-snapshot/v1','account':{'provider_id':settings['mailbox_id'],'mailbox_id':settings['mailbox_id']},
                'collected_at':observed,'coverage':{'complete':False,'method':'authorized_browser','scope':scope,
                    'limitations':['Rendered recent window only; no older paging, Spam-tab export, recording audio or transcript downloads.',
                    'Provider IDs are observed; dates come from visible clock/day separators in America/New_York.',
                    'Automated cards are unqualified review items. Previously archived non-repair classifications are preserved.']},
                'contacts':[],'conversations':conversations,'messages':[],'calls':[],'provider_status':[]}
            raw_snapshot=archive.canonical(snapshot).encode();(run_dir/'canonical-snapshot.json').write_bytes(raw_snapshot)
            ingest=archive.ingest(database,raw_snapshot);write(run_dir/'archive-receipt.json',ingest)
            plan=archive.plan_import(database,archive.digest(raw_snapshot),baseline,review)
        finally:database.close()
        write(run_dir/'ownerdesk-before.json',baseline);write(run_dir/'review.json',review);write(run_dir/'plan.json',plan)
        # Existing sender validates exact plan, latest baseline and source-only fields.
        latest=worker('baseline')['baseline'];write(run_dir/'latest-before.json',latest)
        if plan['batches']:
            import_timeout=begin_import(remaining,lambda:worker('progress',phase='importing'));phase='importing'
            command=[sys.executable,str(dependency/'apply_reviewed_plan.py'),'--plan',str(run_dir/'plan.json'),
                '--approved-plan-sha256',plan['plan_sha256'],'--baseline',str(run_dir/'ownerdesk-before.json'),
                '--latest-baseline',str(run_dir/'latest-before.json'),'--private-config',settings['private_sync_config'],
                '--journal',str(run_dir/'apply-journal.json'),'--private-directory-confirmed','--apply']
            event('import.apply')
            attempt.claim('write_uncertain')
            # Journal writes happen after phase progress; keep readback time intact.
            import_timeout=min(import_timeout,remaining()-READBACK_RESERVE_SECONDS)
            if import_timeout<=0:raise ScanError('CAPTURE_INCOMPLETE')
            applied=subprocess.run(command,capture_output=True,text=True,timeout=import_timeout,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))

            if applied.returncode:raise ScanError('IMPORT_RESULT_UNCERTAIN')
            journal=load(run_dir/'apply-journal.json')
        else:journal=None
        worker('progress',phase='verifying');phase='verifying'
        after=worker('baseline')['baseline'];event('readback.verify');verified=archive.verify_after(baseline,after,plan)
        write(run_dir/'ownerdesk-after.json',after);write(run_dir/'readback-verification.json',verified)
        if not verified['ok']:raise ScanError('READBACK_MISMATCH')
        readback=stamp();counts={'conversationsRead':len(inventory['records']),'conversationsChanged':capture_change_count(captures,plan,unchanged_probe),
            'archivedObservations':len(conversations),'newCards':len(plan['proposed']['new']),'updatedCards':len(plan['proposed']['updated']),
            'heldCards':len(plan['gaps'])+len(held),'skippedConversations':len(inventory['records'])-len(captures),'confirmedBatches':len(plan['batches'])}
        proof={'job_id':lease['state']['jobId'],'requested_at':lease['state']['requestedAt'],'captured_at':observed,'readback_at':readback,
            'plan_sha256':plan['plan_sha256'],'before_sha256':archive.digest(baseline),'after_sha256':archive.digest(after),
            'full_threads_read':len(captures),'list_conversations_checked':len(inventory['records']),'scope':scope}
        receipt=queue.completion(baseline,after,plan,counts,journal,lease,proof,raw_snapshot,snapshot)
        write(run_dir/'run-proof.json',proof);write(run_dir/'counts.json',counts);write(run_dir/'settings-before.json',settings)
        completed=worker('complete',receipt=receipt)
        if completed['state']['status']!='complete':raise ScanError('VERIFICATION_REQUIRED')
        write(run_dir/'completion-receipt.json',completed)
        event('checkpoint')
        current=load(settings_path)
        if current.get('last_verified_job')!=settings.get('last_verified_job'):raise ScanError('VERIFICATION_REQUIRED')
        current.update(last_verified_job=str(run_dir/'run-proof.json'),last_completed_recovery=str(run_dir/'canonical-snapshot.json'))
        write(settings_path,current)
        # Only inspected, verified rows advance. Skipped/held rows remain pending.
        good={item['id'] for item in conversations}-{g.get('conversation_id') for g in plan['gaps']}
        for row in inventory['records']:
            if row['conversation_id'] in good:checkpoint.setdefault('records',{})[row['conversation_id']]={**row,'checked_at':readback,'content_sha256':capture_hashes[row['conversation_id']]}
        checkpoint.update(last_job_id=lease['state']['jobId'],updated_at=readback)
        write(checkpoint_path,checkpoint)
        # Optional (beside_intake_post_enabled): also deliver verified new conversations to the intake hook.
        try:
            report['intake_post']=beside_intake.post_new([c for c in conversations if c['id'] in good],set(by_id),settings,refresh/'intake-posted.json')
        except Exception as exc:
            report['intake_post']={'enabled':True,'error':'intake_post_failed'}
        report.update(ok=True,fresh_scan_performed=True,worker_ready=True,job_id=lease['state']['jobId'],counts=counts,
            dashboard_records=len(after['leads']),scope=scope,full_account_export=False)
        attempt.claim('complete');event('complete')
    except Exception as exc:
        code=beside_attempt.safe_error(str(exc) if isinstance(exc,ScanError) else 'WORKER_FAILED')
        name=type(exc).__name__
        if not isinstance(exc,ScanError):report['exception']=name if name in beside_attempt.EXCEPTION_TYPES else 'Exception'
        report.update(error=code,phase=phase,requires_review=phase in ('importing','verifying'),
            failure_operation=operation,failure_operation_seconds=round(time.monotonic()-operation_started,3))
        # Preserve the original action, stage and evidence before a secondary fail/reconcile request.
        original_diagnostic={key:report[key] for key in ('worker_action','worker_step','worker_http_status','worker_error_code','worker_exception','worker_transport_error') if key in report}
        report['original_failure']={'error':code,'phase':phase,**{key:report[key] for key in WORKER_DIAGNOSTIC_KEYS if key in report}}
        primary_operation=operation
        try:
            if attempt:
                if lease is None and attempt.data.get('claim_state')=='pending':attempt.claim('uncertain')
                attempt.failure(primary_operation,code,exc,phase=phase,report=report)
        except OSError:report['attempt_evidence_unavailable']=True
        if lease and lease.get('claimed') is True:
            try:
                wire_code=queue_failure_code(code,phase)
                failed=worker('fail',errorCode=wire_code)
                failed_state=failed.get('state')
                if (not isinstance(failed_state,dict) or failed_state.get('jobId')!=lease['state']['jobId']
                    or failed_state.get('status') not in ('failed','attention')):
                    raise ScanError('WORKER_RESPONSE_INVALID')
                report['failure_reporting']={'accepted':True,'errorCode':wire_code}
                attempt.claim('write_uncertain' if phase in ('importing','verifying') else 'failed')
            except Exception as failure_exc:
                report['queue_failure_unconfirmed']=True
                report['failure_reporting']={'accepted':False,'errorCode':queue_failure_code(code,phase),
                    'exception_type':type(failure_exc).__name__,**{key:report[key] for key in WORKER_DIAGNOSTIC_KEYS if key in report}}
                try:attempt.claim('write_uncertain' if phase in ('importing','verifying') else 'uncertain')
                except OSError:report['attempt_evidence_unavailable']=True
        elif attempt and attempt.data.get('claim_state') in ('pending','uncertain'):
            # Lost/malformed grant: read-only reconciliation only, never another claim in this run.
            try:
                reconciled=worker('baseline')['state']
                attempt.held_claims(reconciled,include_current=True)
                report['claim_reconciliation']='readback_only'
            except Exception:report['claim_reconciliation']='unavailable'
        for key in ('worker_action','worker_step','worker_http_status','worker_error_code','worker_exception'):
            report.pop(key,None)
        report.update(original_diagnostic)

    report['duration_seconds']=round(time.monotonic()-started,3)
    try:write(Path(settings_path).parent/'uia-worker-status.json',report)
    except OSError:pass
    return report

def main(argv=None):
    import argparse
    parser=argparse.ArgumentParser(description='Beside refresh worker. Without options: one queue poll (Windows task behaviour).')
    parser.add_argument('--scan-now',action='store_true',help='Request and run a full scan + Owner Desk import now (same path as Refresh Beside). Never messages customers.')
    parser.add_argument('--settings',type=Path,default=None,help='Private settings file (default: BESIDE_REFRESH_SETTINGS or the Windows path).')
    parser.add_argument('--budget-seconds',type=int,default=None)
    args=parser.parse_args(argv)
    settings_path=args.settings or SETTINGS
    if not args.scan_now:
        outcome=run(settings_path=settings_path,**({'budget_seconds':args.budget_seconds} if args.budget_seconds else {}))
    else:
        lock=None
        try:
            import beside_heartbeat_linux  # shared capture.lock (Linux; fcntl)
            lock=beside_heartbeat_linux.capture_lock(load(settings_path))
            if lock is None:
                print(json.dumps({'ok':False,'error':'capture_already_running','customer_messages_sent':False}));return 1
        except ImportError:
            pass
        try:outcome=run(settings_path=settings_path,budget_seconds=args.budget_seconds or 600,manual=True)
        finally:
            if lock:lock.close()
    print(json.dumps(outcome));return 0 if outcome['ok'] else 1

if __name__=='__main__':
    raise SystemExit(main())