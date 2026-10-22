"""Verify source IDs/fields against live Owner Desk using existing private APIs.
Writes source-status metadata only. Never writes inquiries or sends messages.
A saved-record reconciliation is not a fresh Beside scan.
"""
from __future__ import annotations
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import time
from urllib import request, parse

PRIVATE = Path(r'C:\Users\LP15\PerfectTiming-Pipeline-private')
SYNC_CONFIG = Path(r'C:\Users\LP15\Codex\PerfectTiming-LeadDesk\dashboard-sync-private\config.json')
OWNER = 'https://perfect-timing-owner-desk.prudhvi-pallempati.chatgpt.site'
CLOUD = 'https://perfect-timing-cloud-intake.prudhvi-pallempati.chatgpt.site'
BESIDE = PRIVATE / 'beside-recovery-20261013'
REPORT = PRIVATE / 'dashboard-reconciliation-status.json'
SOURCE_FIELDS = ('name','phone','email','vehicle','concern','source_status')
class CheckError(Exception):
    pass
class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def utc_millis():
    # The hosted TypeScript API persists JavaScript Date precision (milliseconds).
    # Generate matching precision instead of weakening exact readback verification.
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')

def canonical(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False)
def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))
def atomic_json(path,value):
    temp=path.with_name(path.name+'.'+str(os.getpid())+'.tmp')
    temp.write_text(canonical(value),encoding='utf-8')
    temp.replace(path)
def instant(value):
    """Compare instants, not ISO spelling or timezone offsets."""
    if value in (None,''):return None
    if not isinstance(value,str):raise CheckError('invalid_source_timestamp')
    try:
        parsed=datetime.fromisoformat(value.replace('Z','+00:00'))
        if parsed.tzinfo is None:
            if len(value)!=10:raise ValueError('offset required')
            parsed=parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError as exc:
        raise CheckError('invalid_source_timestamp') from exc

def metadata_matches(saved,expected):
    return isinstance(saved,dict) and all(saved.get(k)==expected[k] for k in ('name','status','record_count','detail')) and instant(saved.get('observed_at'))==instant(expected['observed_at'])

def index_rows(baseline):
    if baseline.get('complete') is not True or not isinstance(baseline.get('leads'),list):
        raise CheckError('dashboard_readback_incomplete')
    rows=baseline['leads']
    if len(rows)>=int(baseline.get('limit',1000)):
        raise CheckError('dashboard_readback_at_limit')
    indexed={row['id']:row for row in rows}
    if len(indexed)!=len(rows):
        raise CheckError('duplicate_dashboard_ids')
    if any(row['id']!=row['source']+':'+row['source_id'] for row in rows):
        raise CheckError('invalid_dashboard_source_identity')
    return indexed

def completed_proof_owner(receipt,proof,windows_refresh_enabled):
    """Who completed the live last-success job: 'local' (receipt matches this machine's proof) or
    'other_worker'. Strict when this machine runs Beside refresh: a mismatch then only passes if the
    live receipt is newer than the local proof (a later job by another worker); otherwise it fails."""
    if receipt.get('planSha256')==proof.get('plan_sha256') and receipt.get('afterSha256')==proof.get('after_sha256'):
        return 'local'
    if not windows_refresh_enabled:
        return 'other_worker'
    live_at,local_at=parse_instant(receipt.get('capturedAt')),parse_instant(proof.get('captured_at'))
    if live_at and local_at and live_at>local_at:
        return 'other_worker'
    raise CheckError('beside_completed_job_and_local_proof_differ')

def parse_instant(value):
    try:
        moment=datetime.fromisoformat(str(value).replace('Z','+00:00'))
        return moment if moment.tzinfo else None
    except ValueError:
        return None

def compare(events,current,expected):
    actual,prior=index_rows(current),index_rows(expected)
    if len({row['id'] for row in events})!=len(events):
        raise CheckError('duplicate_cloud_ids')
    roots=[row for row in events if row['id']==row['root_id']]
    root_ids={row['id'] for row in roots}
    if any(row['root_id'] not in root_ids for row in events):
        raise CheckError('unmatched_linked_cloud_event')
    missing_web,missing_beside,differences=[],[],[]
    for row in roots:
        key='website:'+row['id'];target=actual.get(key)
        if target is None:
            missing_web.append(key);continue
        payload=row['payload']
        for field in ('name','phone','email','vehicle'):
            if (payload.get(field) or '')!=(target.get(field) or ''):
                differences.append({'id':key,'field':field})
        if (payload.get('details') or '') not in (target.get('concern') or ''):
            differences.append({'id':key,'field':'repair_description'})
    for key,old in prior.items():
        if old['source'] not in ('beside','beside-history'):continue
        target=actual.get(key)
        if target is None:
            missing_beside.append(key);continue
        current_version,previous_version=instant(target.get('source_updated_at')),instant(old.get('source_updated_at'))
        newer=current_version is not None and (previous_version is None or current_version>previous_version)
        for field in SOURCE_FIELDS:
            before,after=old.get(field) or '',target.get(field) or ''
            if before!=after and (not newer or (before and not after)):
                differences.append({'id':key,'field':field})
    counts=Counter(row['source'] for row in actual.values())
    prior_counts=Counter(row['source'] for row in prior.values())
    tests=sum(row['payload'].get('ownerTest') is True for row in roots)
    return {'delivery_ok':not(missing_web or missing_beside or differences),
        'dashboard_records':len(actual),'unique_dashboard_records':len(actual),
        'website':{'source_requests':len(roots),'matched':len(roots)-len(missing_web),'owner_tests':tests,
            'not_marked_as_test':len(roots)-tests,'linked_events':len(events)-len(roots),'missing_ids':missing_web},
        'beside':{'saved_cards':counts['beside'],'expected_saved_cards':prior_counts['beside'],
            'historical_cards':counts['beside-history'],'expected_historical_cards':prior_counts['beside-history'],'missing_ids':missing_beside},
        'field_differences':differences}

def metadata_publish_allowed(publish, state):
    # An active scan owns its source descriptor until proof and checkpoints land.
    return publish and state.get('status') not in ('queued','running')

def run(*,publish=True,budget_seconds=45):
    started=time.monotonic();checked=utc_millis()
    result={'checked_at':checked,'ok':False,'delivery_ok':False}
    try:
        if budget_seconds<5:raise CheckError('reconciliation_time_budget_unavailable')
        cc,sc=load(PRIVATE/'cloud-intake.json'),load(SYNC_CONFIG)
        if cc.get('url')!=CLOUD or sc.get('url','').removesuffix('/api/sync').rstrip('/')!=OWNER:
            raise CheckError('unexpected_service_destination')
        headers={'cloud':{'Authorization':'Bearer '+cc['private_token']},
            'owner':{'OAI-Sites-Authorization':'Bearer '+sc['service_token'],'x-owner-sync-token':sc['sync_token']}}
        opener=request.build_opener(request.ProxyHandler({}),NoRedirect())
        def call(kind,path,body=None):
            remaining=budget_seconds-(time.monotonic()-started)
            if remaining<=1:raise CheckError('reconciliation_deadline_reached')
            req=request.Request((CLOUD if kind=='cloud' else OWNER)+path,
                data=None if body is None else canonical(body).encode(),
                headers={'Content-Type':'application/json','Accept':'application/json','User-Agent':'PerfectTiming-ID-Reconciliation/1.0',**headers[kind]})
            with opener.open(req,timeout=min(15,remaining)) as response:
                raw=response.read(4_000_001)
                if len(raw)>4_000_000:raise CheckError('response_too_large')
                value=json.loads(raw)
                if value.get('ok') is not True:raise CheckError('service_response_unconfirmed')
                return value
        events,cursor=[],''
        for _ in range(100):
            page=call('cloud','/private/leads?after='+parse.quote(cursor,safe=''))
            events.extend(page['leads'])
            if len(page['leads'])<100:break
            if page['cursor']==cursor:raise CheckError('cloud_cursor_not_advancing')
            cursor=page['cursor']
        else:raise CheckError('cloud_pagination_limit')
        live=call('owner','/api/beside-refresh/worker',{'action':'baseline'})
        settings=load(BESIDE/'refresh/settings.json')
        proof_path=Path(settings['last_verified_job']).resolve()
        if not proof_path.is_relative_to((BESIDE/'refresh/runs').resolve()):raise CheckError('unexpected_beside_proof_path')
        proof=load(proof_path);expected=load(proof_path.parent/'ownerdesk-after.json')
        if hashlib.sha256(canonical(expected).encode()).hexdigest()!=proof['after_sha256']:
            raise CheckError('beside_readback_hash_mismatch')
        receipt=live['state'].get('lastSuccessReceipt') or {}
        proof_owner=completed_proof_owner(receipt,proof,sc.get('beside_refresh_enabled') is True)
        # 'other_worker': the VM (or another worker) completed the latest scan. Records saved by this
        # machine's last proof are still checked below for loss; the scan time shown is the live one.
        scan_at=proof['captured_at'] if proof_owner=='local' else receipt.get('capturedAt')
        result.update(compare(events,live['baseline'],expected))
        health=call('cloud','/private/health')
        worker_online=bool(live['state'].get('worker',{}).get('online'))
        result.update(cloud_pending_handoffs=health.get('pending'),cloud_pending_owner_alerts=health.get('owner_alerts_pending'),
            all_sources_live=False,customer_messages_sent=False,inquiry_records_written=0,dashboard_status_updated=False)
        result['metadata_deferred_for_scan'] = bool(publish and not metadata_publish_allowed(publish,live['state']))
        if metadata_publish_allowed(publish,live['state']):
            verdict='Saved-record reconciliation passed.' if result['delivery_ok'] else 'ACTION NEEDED: missing records or changed source fields. See private reconciliation receipt.'
            detail=(f"{verdict} {result['beside']['saved_cards']} newer Beside cards and {result['beside']['historical_cards']} historical cards are saved. "
                f"Last verified scan: {scan_at}. This is a saved snapshot, not a live feed of every call/text. "
                +('Scan worker reports online; this check did not scrape new messages.' if worker_online else 'Scan worker is offline; calls/texts after the last scan are UNVERIFIED.')
                +f" Website IDs checked: {result['website']['matched']}/{result['website']['source_requests']} including owner tests.")
            source={'id':'beside','name':'Beside saved scans','status':'historical' if result['delivery_ok'] else 'error',
                'observed_at':checked,'latest_record_at':max((x['received_at'] for x in live['baseline']['leads'] if x['source']=='beside'),default=None),
                'record_count':result['beside']['saved_cards'],'detail':detail}
            if len(detail)>600:raise CheckError('source_detail_too_long')
            ack=call('owner','/api/sync',{'leads':[],'sources':[source]})
            if type(ack.get('accepted')) is not int or ack['accepted']!=0:raise CheckError('metadata_update_not_confirmed')
            after=call('owner','/api/beside-refresh/worker',{'action':'baseline'})
            result.update(compare(events,after['baseline'],expected))
            saved=next((x for x in after['baseline']['sources'] if x['id']=='beside'),None)
            if not metadata_matches(saved,source):
                raise CheckError('source_status_readback_mismatch')
            result['dashboard_status_updated']=True
        result['beside'].update(last_verified_scan_at=scan_at,completed_by=proof_owner,scan_scope=proof.get('scope') if proof_owner=='local' else None,
            scan_worker_online=worker_online,fresh_scan_performed=False)
        result['ok']=result['delivery_ok'] and health.get('pending')==0
    except Exception as exc:
        result.update(ok=False,delivery_ok=False,error=str(exc) if isinstance(exc,CheckError) else type(exc).__name__)
    result['duration_seconds']=round(time.monotonic()-started,3)
    atomic_json(REPORT,result)
    return result

if __name__=='__main__':
    result=run();print(canonical(result));raise SystemExit(0 if result['ok'] else 1)
