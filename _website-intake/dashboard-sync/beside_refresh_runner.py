"""Bounded, request-driven Beside capture on the existing signed-in Windows task.
No browser credentials, customer sends, owner decisions or fabricated scan health.
Uses the already installed private archive/planner and the existing refresh queue.
"""
from __future__ import annotations
from datetime import datetime, timezone
import hashlib
import importlib
import json
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

FINISH_RESERVE_SECONDS=60
READBACK_RESERVE_SECONDS=38

def capture_timeout(settings,remaining,*,reserve_seconds=0):
    # Windows UIA capture: unchanged 25 s. Linux/Playwright: cold Chromium start + read takes ~30 s
    # on the 2-vCPU VM, so allow beside_linux_capture_timeout_seconds (default 90). Always capped
    # by the remaining run budget minus 3 s.
    available=remaining-reserve_seconds-3
    if available<=0:raise ScanError('CAPTURE_INCOMPLETE')
    if settings.get('beside_capture_backend')=='linux':
        return min(float(settings.get('beside_linux_capture_timeout_seconds',90)),available)
    return min(25,available)

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
        if isinstance(v,str) and re.fullmatch(r'[A-Za-z0-9_.:-]{1,64}',v):return v
    return None

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
    if remaining()<FINISH_RESERVE_SECONDS:raise ScanError('CAPTURE_INCOMPLETE')
    progress()
    return min(30,remaining()-READBACK_RESERVE_SECONDS)

def read_threads(selected,read_one,remaining,progress,*,skip_failed=False,max_failures=5,sleep=time.sleep,base_delay=0.5,max_delay=4.0,reserve_seconds=0):
    """Read selected threads. Default: stop at the first failure (previous behavior).
    With skip_failed, a failed thread is skipped with exponential backoff and the pass continues,
    up to max_failures. Failed threads are never checkpointed, so they stay pending.
    The caller can reserve time for archive/import/readback before starting another read."""
    captures=[];failures=[]
    for row in selected:
        if remaining()<35+reserve_seconds:break
        cid=row['conversation_id']
        try:
            captures.append(read_one(cid))
            if len(captures)%3==0:progress()
        except ScanError:
            failures.append(cid)
            if not skip_failed or len(failures)>=max_failures:break
            delay=min(max_delay,base_delay*(2**(len(failures)-1)))
            if remaining()-delay<35+reserve_seconds:break
            sleep(delay)
    return captures,failures

def run(*,settings_path=SETTINGS,budget_seconds=145,manual=False):
    started=time.monotonic();lease=None;run_dir=None;phase='reading';last_error='WORKER_FAILED'
    report={'ok':False,'checked_at':stamp(),'fresh_scan_performed':False,'customer_messages_sent':False}
    def remaining():return budget_seconds-(time.monotonic()-started)
    if budget_seconds<15:
        return {**report,'error':'scan_time_budget_unavailable'}
    try:
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
        def call(path,body):
            if remaining()<2:raise ScanError('CAPTURE_INCOMPLETE')
            req=request.Request(origin+path,data=archive.canonical(body).encode(),headers={
                'Content-Type':'application/json','Accept':'application/json',
                'OAI-Sites-Authorization':'Bearer '+config['service_token'],'x-owner-sync-token':config['sync_token']})
            try:
                with opener.open(req,timeout=min(12,remaining())) as response:
                    raw=response.read(4_000_001)
                    if response.status!=200 or len(raw)>4_000_000:raise ScanError('BASELINE_UNAVAILABLE')
                    value=json.loads(raw)
            except error.HTTPError as exc:
                # Keep only the status and a short server error code; never the body or headers.
                report['worker_http_status']=exc.code
                code=server_code(exc.read(4096))
                if code:report['worker_error_code']=code
                raise ScanError('WORKER_HTTP_'+str(exc.code)) from None
            except (error.URLError,TimeoutError,OSError):
                raise ScanError('WORKER_UNREACHABLE') from None
            except ValueError:
                raise ScanError('WORKER_RESPONSE_INVALID') from None
            if value.get('ok') is not True:
                code=server_code(value)
                if code:report['worker_error_code']=code
                raise ScanError('BASELINE_UNAVAILABLE')
            return value
        def worker(action,**extra):
            body={'action':action,**extra}
            if action in ('progress','complete','fail'):
                body.update(jobId=lease['state']['jobId'],claimToken=lease['claimToken'])
            report['worker_action']=action
            return call('/api/beside-refresh/worker',body)
        def capture(mode,output,*,cid=None,inventory=None):
            reserve=FINISH_RESERVE_SECONDS if mode=='thread' else 0
            if remaining()<10+reserve:raise ScanError('CAPTURE_INCOMPLETE')
            args=capture_command(settings,mode,output,settings_path)
            if cid:args+=['-ConversationId',cid,'-InventoryPath',str(inventory)]
            for attempt in range(2):
                try:
                    completed=subprocess.run(args,capture_output=True,text=True,timeout=capture_timeout(settings,remaining(),reserve_seconds=reserve),
                        creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                except subprocess.TimeoutExpired:raise ScanError('CAPTURE_INCOMPLETE') from None
                if completed.returncode==0:return load(output)
                report['source_read_failure'] = (completed.stderr.splitlines() or ['Source read failed'])[0][:180]
                # Only retry source reads during transient page rendering. Never replay writes.
                if attempt or output.exists() or remaining()<12+reserve:break
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
        # No automatic retry of an earlier uncertain write or failed job.
        lease=worker('claim')
        if lease.get('claimed') is not True:raise ScanError('WORKER_FAILED')
        run_dir=runs/('queued-uia-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));run_dir.mkdir()
        write(run_dir/'lease.json',lease)
        inventory=capture('inventory',run_dir/'inventory.json')
        checkpoint_path=refresh/'uia-checkpoint.json'
        checkpoint=load(checkpoint_path) if checkpoint_path.exists() else {'records':{}}
        selected,total_changed=selected_changes(inventory,checkpoint,min(25,int(settings.get('maximum_changed_threads_per_pass',25))))
        unchanged_probe=not selected
        selected=sample_when_unchanged(inventory,checkpoint,selected)
        def read_one(cid):
            return capture('thread',run_dir/('thread-'+cid+'.json'),cid=cid,inventory=run_dir/'inventory.json')
        captures,capture_failures=read_threads(selected,read_one,remaining,
            lambda:worker('progress',phase='reading'),
            skip_failed=settings.get('beside_skip_failed_threads') is True,
            max_failures=int(settings.get('beside_max_thread_failures',5)),reserve_seconds=FINISH_RESERVE_SECONDS)
        report['thread_failures']=len(capture_failures)
        require_captured_changes(selected,captures)
        worker('progress',phase='checking');phase='checking'
        baseline=worker('baseline')['baseline'];archive.validate_baseline(baseline)
        by_id={row['id']:row for row in baseline['leads']}
        observed=stamp();review={'format':'beside-review/v1','classifications':{},'crosswalks':[]};conversations=[];held=[];capture_hashes={}
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
            applied=subprocess.run(command,capture_output=True,text=True,timeout=import_timeout,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            if applied.returncode:raise ScanError('IMPORT_RESULT_UNCERTAIN')
            journal=load(run_dir/'apply-journal.json')
        else:journal=None
        worker('progress',phase='verifying');phase='verifying'
        after=worker('baseline')['baseline'];verified=archive.verify_after(baseline,after,plan)
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
            report['intake_post']={'enabled':True,'error':str(exc) if isinstance(exc,ValueError) else type(exc).__name__}
        report.update(ok=True,fresh_scan_performed=True,worker_ready=True,job_id=lease['state']['jobId'],counts=counts,
            dashboard_records=len(after['leads']),scope=scope,full_account_export=False)
    except Exception as exc:
        code=str(exc) if isinstance(exc,ScanError) else 'WORKER_FAILED'
        if not isinstance(exc,ScanError):report['exception']=type(exc).__name__
        report.update(error=code,phase=phase,requires_review=phase in ('importing','verifying'))
        if lease and lease.get('claimed'):
            try:worker('fail',errorCode=code)
            except Exception:report['queue_failure_unconfirmed']=True
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
