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
from urllib import request
from urllib.parse import urlsplit
from beside_uia import CaptureError, conversation, generic_review
import beside_extract
from beside_schedule import auto_scan_reason

ROOT=Path(__file__).resolve().parent
SETTINGS=Path(r'C:\Users\LP15\PerfectTiming-Pipeline-private\beside-recovery-20261013\refresh\settings.json')
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
def selected_changes(inventory,checkpoint,maximum):
    records=inventory.get('records')
    if not isinstance(records,list) or not records or len(records)>200:raise ScanError('CAPTURE_INCOMPLETE')
    ids=[row.get('conversation_id') for row in records]
    if len(ids)!=len(set(ids)):raise ScanError('SOURCE_IDENTITY_MISMATCH')
    prior=checkpoint.get('records',{})
    changed=[row for row in records if prior.get(row['conversation_id'],{}).get('label')!=row.get('label')]
    return changed[:maximum],len(changed)
def preserve_known_fields(incoming,old):
    result=dict(incoming)
    if old:
        for key in ('name','phone','email','vehicle'):
            if old.get(key) and (not result.get(key) or result.get(key)=='Name not provided'):
                result[key]=old[key]
        result['received_at']=old['received_at']
    return result

def read_threads(selected,read_one,remaining,progress,*,skip_failed=False,max_failures=5,sleep=time.sleep,base_delay=0.5,max_delay=4.0):
    """Read selected threads. Default: stop at the first failure (previous behavior).
    With skip_failed, a failed thread is skipped with exponential backoff and the pass continues,
    up to max_failures. Failed threads are never checkpointed, so they stay pending."""
    captures=[];failures=[]
    for row in selected:
        if remaining()<35:break
        cid=row['conversation_id']
        try:
            captures.append(read_one(cid))
            if len(captures)%3==0:progress()
        except ScanError:
            failures.append(cid)
            if not skip_failed or len(failures)>=max_failures:break
            delay=min(max_delay,base_delay*(2**(len(failures)-1)))
            if remaining()-delay<35:break
            sleep(delay)
    return captures,failures

def run(*,settings_path=SETTINGS,budget_seconds=80):
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
            with opener.open(req,timeout=min(12,remaining())) as response:
                raw=response.read(4_000_001)
                if response.status!=200 or len(raw)>4_000_000:raise ScanError('BASELINE_UNAVAILABLE')
                value=json.loads(raw)
                if value.get('ok') is not True:raise ScanError('BASELINE_UNAVAILABLE')
                return value
        def worker(action,**extra):
            body={'action':action,**extra}
            if action in ('progress','complete','fail'):
                body.update(jobId=lease['state']['jobId'],claimToken=lease['claimToken'])
            return call('/api/beside-refresh/worker',body)
        def capture(mode,output,*,cid=None,inventory=None):
            if remaining()<10:raise ScanError('CAPTURE_INCOMPLETE')
            args=['powershell.exe','-NoProfile','-File',str(ROOT/'capture_beside.ps1'),'-Mode',mode,
                '-OutputPath',str(output),'-SettingsPath',str(settings_path),'-PythonExecutable',sys.executable]
            if cid:args+=['-ConversationId',cid,'-InventoryPath',str(inventory)]
            for attempt in range(2):
                completed=subprocess.run(args,capture_output=True,text=True,timeout=min(25,remaining()-3),
                    creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                if completed.returncode==0:return load(output)
                report['source_read_failure'] = (completed.stderr.splitlines() or ['Source read failed'])[0][:180]
                # Only retry source reads during transient page rendering. Never replay writes.
                if attempt or output.exists() or remaining()<12:break
                time.sleep(0.4)
            raise ScanError('BROWSER_UNAVAILABLE')
        # Real signed-in source access must succeed before a readiness heartbeat.
        probe_dir=refresh/'uia-readiness';probe_dir.mkdir(exist_ok=True)
        probe_path=probe_dir/(datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.json')
        capture('inventory',probe_path)
        worker('heartbeat')
        state=worker('baseline')['state']
        if state['status']!='queued' and settings.get('beside_auto_scan_minutes'):
            # Optional scheduled scan (off by default): ask the dashboard queue for a job;
            # the next task run claims it through the normal lease path.
            auto_path=refresh/'uia-auto-scan.json'
            auto_state=load(auto_path) if auto_path.exists() else {}
            checkpoint_path=refresh/'uia-checkpoint.json'
            reason=auto_scan_reason(datetime.now(timezone.utc),settings,auto_state,
                load(probe_path),load(checkpoint_path) if checkpoint_path.exists() else {'records':{}})
            if reason and state['status'] in ('idle','complete','failed',None):
                requested=worker(settings.get('beside_auto_scan_action','request'),reason='scheduled:'+reason)
                auto_state.update(last_requested_at=stamp(),last_reason=reason)
                write(auto_path,auto_state)
                report['auto_scan_requested']=reason
                state=requested.get('state') or state
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
        def read_one(cid):
            return capture('thread',run_dir/('thread-'+cid+'.json'),cid=cid,inventory=run_dir/'inventory.json')
        captures,capture_failures=read_threads(selected,read_one,remaining,
            lambda:worker('progress',phase='reading'),
            skip_failed=settings.get('beside_skip_failed_threads') is True,
            max_failures=int(settings.get('beside_max_thread_failures',5)))
        report['thread_failures']=len(capture_failures)
        if selected and not captures:raise ScanError('CAPTURE_INCOMPLETE')
        worker('progress',phase='checking');phase='checking'
        baseline=worker('baseline')['baseline'];archive.validate_baseline(baseline)
        by_id={row['id']:row for row in baseline['leads']}
        observed=stamp();review={'format':'beside-review/v1','classifications':{},'crosswalks':[]};conversations=[];held=[]
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
                if settings.get('beside_extract_fields') is True:item=beside_extract.apply(item)
                item=preserve_known_fields(item,old)
                archived=database.execute('SELECT parent_id FROM conversations WHERE mailbox_id=? AND provider_id=?',(settings['mailbox_id'],cid)).fetchone()
                if archived and archived['parent_id']:item['contact_id']=archived['parent_id']
                decision=generic_review(cap,observed)
                prior=database.execute('SELECT classification FROM conversation_classifications WHERE mailbox_id=? AND conversation_id=? ORDER BY reviewed_at DESC LIMIT 1',(settings['mailbox_id'],cid)).fetchone()
                if prior and prior['classification'] in ('spam','operational','personal'):
                    decision.update(classification=prior['classification'],include_in_dashboard=False,
                        summary='Previously reviewed archive-only conversation; fresh source preserved without changing its classification.')
                if prior and prior['classification']=='repair':
                    decision.update(classification='repair',category='Previously reviewed repair conversation')
                if old and old.get('concern'):
                    decision['summary']=old['concern'][:700]+'\nUpdated source observations are archived; review the original thread for the latest context.'
                review['classifications'][cid]=decision;conversations.append(item)
            scope=f"{len(inventory['records'])} recent visible All-list conversations inventoried; {len(captures)} selected rendered threads read. {total_changed-len(captures)} changed/uninspected visible conversations remain outside this bounded pass. Not a full account export."
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
        worker('progress',phase='importing');phase='importing'
        if plan['batches']:
            if remaining()<20:raise ScanError('CAPTURE_INCOMPLETE')
            command=[sys.executable,str(dependency/'apply_reviewed_plan.py'),'--plan',str(run_dir/'plan.json'),
                '--approved-plan-sha256',plan['plan_sha256'],'--baseline',str(run_dir/'ownerdesk-before.json'),
                '--latest-baseline',str(run_dir/'latest-before.json'),'--private-config',settings['private_sync_config'],
                '--journal',str(run_dir/'apply-journal.json'),'--private-directory-confirmed','--apply']
            applied=subprocess.run(command,capture_output=True,text=True,timeout=min(30,remaining()-10),creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            if applied.returncode:raise ScanError('IMPORT_RESULT_UNCERTAIN')
            journal=load(run_dir/'apply-journal.json')
        else:journal=None
        worker('progress',phase='verifying');phase='verifying'
        after=worker('baseline')['baseline'];verified=archive.verify_after(baseline,after,plan)
        write(run_dir/'ownerdesk-after.json',after);write(run_dir/'readback-verification.json',verified)
        if not verified['ok']:raise ScanError('READBACK_MISMATCH')
        readback=stamp();counts={'conversationsRead':len(inventory['records']),'conversationsChanged':len(captures),
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
            if row['conversation_id'] in good:checkpoint.setdefault('records',{})[row['conversation_id']]=row
        checkpoint.update(last_job_id=lease['state']['jobId'],updated_at=readback)
        write(checkpoint_path,checkpoint)
        report.update(ok=True,fresh_scan_performed=True,worker_ready=True,job_id=lease['state']['jobId'],counts=counts,
            dashboard_records=len(after['leads']),scope=scope,full_account_export=False)
    except Exception as exc:
        code=str(exc) if isinstance(exc,ScanError) else 'WORKER_FAILED'
        report.update(error=code,phase=phase,requires_review=phase in ('importing','verifying'))
        if lease and lease.get('claimed'):
            try:worker('fail',errorCode=code)
            except Exception:report['queue_failure_unconfirmed']=True
    report['duration_seconds']=round(time.monotonic()-started,3)
    try:write(Path(settings_path).parent/'uia-worker-status.json',report)
    except OSError:pass
    return report

if __name__=='__main__':
    outcome=run();print(json.dumps(outcome));raise SystemExit(0 if outcome['ok'] else 1)
