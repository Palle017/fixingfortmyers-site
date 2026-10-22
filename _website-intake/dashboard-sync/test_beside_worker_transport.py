import json
import io
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from urllib import error,request

import beside_refresh_runner as R

CID='prv_'+'A'*26
JOB='12345678-1234-4234-8234-123456789abc'
AT='2026-10-22T20:00:00.000Z'


class Response:
    status=200
    def __init__(self,value):self.raw=json.dumps(value).encode()
    def __enter__(self):return self
    def __exit__(self,*args):return False
    def read(self,size):return self.raw


class WorkerResponseTests(unittest.TestCase):
    def invoke(self,body,effects,*,budget=100,phase='checking',url='https://dashboard.fixingfortmyers.com/api/beside-refresh/worker'):
        self.remaining=budget;self.opened=[];self.report={};self.effects=iter(effects)
        req=request.Request(url,data=json.dumps(body).encode())
        def open_one(actual,timeout):
            self.opened.append((actual.data,timeout))
            effect=next(self.effects)
            if isinstance(effect,BaseException):self.remaining-=timeout;raise effect
            self.remaining-=1
            return effect
        return R.worker_response(mock.Mock(open=open_one),req,body,lambda:self.remaining,self.report,phase)

    def test_baseline_retries_once_and_preserves_finishing_budget(self):
        result=self.invoke({'action':'baseline'},[TimeoutError('PRIVATE'),Response({'ok':True})])
        self.assertTrue(result['ok']);self.assertEqual(len(self.opened),2)
        self.assertEqual(self.opened[0][0],self.opened[1][0])
        self.assertTrue(all(timeout<=12 for _,timeout in self.opened))
        self.assertGreaterEqual(self.remaining,R.FINISH_RESERVE_SECONDS)
        self.assertEqual(len(self.report['worker_transport_retries']),1)

    def test_retry_is_refused_when_a_full_window_would_spend_the_reserve(self):
        with self.assertRaisesRegex(R.ScanError,'WORKER_UNREACHABLE'):
            self.invoke({'action':'baseline'},[TimeoutError('PRIVATE')],budget=98)
        self.assertEqual(len(self.opened),1)
        self.assertNotIn('worker_transport_retries',self.report)

    def test_verifying_progress_retry_leaves_baseline_completion_and_proof_time(self):
        body={'action':'progress','jobId':JOB,'claimToken':'c'*64,'phase':'verifying'}
        self.invoke(body,[TimeoutError('PRIVATE'),Response({'ok':True})],budget=50,phase='importing')
        self.assertEqual(len(self.opened),2)
        self.assertGreaterEqual(self.remaining,26)

    def test_importing_progress_retry_keeps_sender_and_readback_allowance(self):
        body={'action':'progress','jobId':JOB,'claimToken':'c'*64,'phase':'importing'}
        self.invoke(body,[TimeoutError('PRIVATE'),Response({'ok':True})],budget=80)
        self.assertGreaterEqual(self.remaining,R.READBACK_RESERVE_SECONDS+12)
        with self.assertRaisesRegex(R.ScanError,'WORKER_UNREACHABLE'):
            self.invoke(body,[TimeoutError('PRIVATE')],budget=60)
        self.assertEqual(len(self.opened),1)

    def test_readback_baseline_retry_keeps_completion_and_proof_time(self):
        self.invoke({'action':'baseline'},[TimeoutError('PRIVATE'),Response({'ok':True})],budget=40,phase='verifying')
        self.assertGreaterEqual(self.remaining,14)

    def test_transport_retry_is_limited_to_two_identical_attempts(self):
        reason=OSError(111,'PRIVATE destination/token')
        with self.assertRaisesRegex(R.ScanError,'WORKER_UNREACHABLE'):
            self.invoke({'action':'baseline'},[error.URLError(reason),TimeoutError('PRIVATE')],budget=150)
        self.assertEqual(len(self.opened),2)
        self.assertEqual(len(self.report['worker_transport_retries']),1)
        self.assertEqual(self.report['worker_transport_retries'][0]['errno'],111)
        self.assertNotIn('PRIVATE',json.dumps(self.report))

    def test_claim_complete_fail_heartbeat_resolution_and_source_posts_never_retry(self):
        for action in ('claim','complete','fail','heartbeat','resolve_attention'):
            with self.subTest(action=action),self.assertRaisesRegex(R.ScanError,'WORKER_UNREACHABLE'):
                self.invoke({'action':action},[TimeoutError('PRIVATE')],budget=150)
            self.assertEqual(len(self.opened),1)
        with self.assertRaisesRegex(R.ScanError,'WORKER_UNREACHABLE'):
            self.invoke({'action':'baseline'},[TimeoutError('PRIVATE')],budget=150,url='https://dashboard.fixingfortmyers.com/api/sync')
        self.assertEqual(len(self.opened),1)

    def test_invalid_progress_identity_is_not_retryable(self):
        for body in ({'action':'progress','phase':'verifying'},
                     {'action':'progress','phase':'invalid','jobId':JOB,'claimToken':'c'*64},
                     {'action':'baseline','extra':True},
                     {'action':'progress','phase':'verifying','jobId':JOB,'claimToken':'c'*64,'extra':True}):
            with self.subTest(body=body),self.assertRaisesRegex(R.ScanError,'WORKER_UNREACHABLE'):
                self.invoke(body,[TimeoutError('PRIVATE')],budget=150)
            self.assertEqual(len(self.opened),1)

    def test_baseline_retry_requires_the_exact_trusted_worker_endpoint(self):
        for url in ('https://untrusted.invalid/api/beside-refresh/worker',
                    'http://dashboard.fixingfortmyers.com/api/beside-refresh/worker',
                    'https://dashboard.fixingfortmyers.com/api/beside-refresh/worker?extra=1',
                    'https://dashboard.fixingfortmyers.com/api/beside-refresh/worker#extra',
                    'https://dashboard.fixingfortmyers.com/api/beside-refresh/worker/extra'):
            with self.subTest(url=url),self.assertRaisesRegex(R.ScanError,'WORKER_UNREACHABLE'):
                self.invoke({'action':'baseline'},[TimeoutError('PRIVATE')],budget=150,url=url)
            self.assertEqual(len(self.opened),1)

    def test_http_errors_are_not_retried_or_stored_as_free_text(self):
        for status in (400,401,403,409,429,500):
            exc=error.HTTPError('https://PRIVATE.invalid',status,'PRIVATE',{},io.BytesIO(b'{"ok":false,"code":"CLAIM_CONFLICT"}'))
            with self.subTest(status=status),self.assertRaisesRegex(R.ScanError,'WORKER_HTTP_'+str(status)):
                self.invoke({'action':'baseline'},[exc],budget=150)
            self.assertEqual(len(self.opened),1)
            self.assertEqual(self.report['worker_http_status'],status)
            self.assertNotIn('PRIVATE',json.dumps(self.report))
            exc.close()

    def test_invalid_json_and_server_rejections_are_not_retried(self):
        broken=Response({});broken.raw=b'PRIVATE not JSON'
        for response,code in ((broken,'WORKER_RESPONSE_INVALID'),(Response([]),'WORKER_RESPONSE_INVALID'),
                              (Response({'ok':False,'code':'VALIDATION_FAILED'}),'BASELINE_UNAVAILABLE')):
            with self.subTest(code=code),self.assertRaisesRegex(R.ScanError,code):
                self.invoke({'action':'baseline'},[response],budget=150)
            self.assertEqual(len(self.opened),1)
            self.assertNotIn('PRIVATE',json.dumps(self.report))


class FailureReportingTests(unittest.TestCase):
    def test_unsupported_local_errors_are_normalized_for_the_queue(self):
        for phase in ('reading','checking','importing','verifying'):
            expected='IMPORT_RESULT_UNCERTAIN' if phase in ('importing','verifying') else 'WORKER_FAILED'
            self.assertEqual(R.queue_failure_code('WORKER_UNREACHABLE',phase),expected)
            self.assertEqual(R.queue_failure_code('WORKER_HTTP_401',phase),expected)
        for code in R.QUEUE_ERROR_CODES:self.assertEqual(R.queue_failure_code(code,'checking'),code)

    def test_failure_reporting_cannot_replace_the_original_cause(self):
        report={'worker_action':'progress','worker_transport_error':{'exception_type':'TimeoutError'}}
        def failed_report(action,**extra):
            self.assertEqual((action,extra),('fail',{'errorCode':'IMPORT_RESULT_UNCERTAIN'}))
            report.update(worker_action='fail',worker_http_status=400,worker_error_code='INVALID_REQUEST')
            raise R.ScanError('WORKER_HTTP_400')
        R.report_queue_failure(failed_report,report,'WORKER_UNREACHABLE','importing')
        self.assertEqual(report['worker_action'],'progress')
        self.assertNotIn('worker_http_status',report)
        self.assertEqual(report['original_failure']['error'],'WORKER_UNREACHABLE')
        self.assertEqual(report['original_failure']['worker_transport_error']['exception_type'],'TimeoutError')
        self.assertEqual(report['failure_reporting']['worker_http_status'],400)
        self.assertTrue(report['queue_failure_unconfirmed'])

    def test_supported_failure_is_reported_once_with_original_action_retained(self):
        report={'worker_action':'baseline','worker_http_status':403}
        worker=mock.Mock(side_effect=lambda *args,**kw:report.update(worker_action='fail'))
        R.report_queue_failure(worker,report,'WORKER_HTTP_403','checking')
        worker.assert_called_once_with('fail',errorCode='WORKER_FAILED')
        self.assertEqual(report['worker_action'],'baseline')
        self.assertEqual(report['worker_http_status'],403)
        self.assertTrue(report['failure_reporting']['accepted'])


class RunTransportTests(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root=Path(self.temporary.name)
        refresh=self.root/'refresh';(refresh/'runs').mkdir(parents=True)
        config=self.root/'config.json'
        config.write_text(json.dumps({'url':'https://dashboard.fixingfortmyers.com','service_token':'x'*20,'sync_token':'y'*20}))
        self.settings=refresh/'settings.json'
        self.settings.write_text(json.dumps({'private_archive_root':str(self.root),'runs_directory':str(refresh/'runs'),
            'source_checkout':str(self.root/'source'),'private_sync_config':str(config),'persistent_archive':str(self.root/'archive.sqlite3'),
            'mailbox_id':'synthetic-mailbox','beside_capture_backend':'linux'}))
        self.clock=0.0;self.actions=[];self.imports=0;self.phase='reading';self.verifying_attempts=0
        self.plan={'plan_sha256':'a'*64,'proposed':{'new':[{'id':'synthetic-new'}],'updated':[]},'batches':[{}],'gaps':[]}
        self.archive=mock.Mock()
        self.archive.canonical.side_effect=lambda value:json.dumps(value,sort_keys=True)
        self.archive.digest.return_value='b'*64
        self.archive.connect.return_value.execute.return_value.fetchone.return_value=None
        self.archive.ingest.return_value={'ok':True}
        self.archive.plan_import.return_value=self.plan
        self.archive.verify_after.return_value={'ok':True,'problems':[]}
        self.queue=mock.Mock();self.queue.completion.return_value={'synthetic':'verified receipt'}

    def open(self,req,timeout):
        body=json.loads(req.data);self.actions.append(body)
        self.clock+=1
        action=body['action']
        state={'status':'running','phase':self.phase,'jobId':JOB,'requestedAt':AT,'startedAt':AT}
        extra={}
        if action=='baseline':extra['baseline']={'complete':True,'leads':[],'sources':[]}
        elif action=='claim':extra.update(claimed=True,claimToken='c'*64)
        elif action=='progress':
            self.phase=body['phase'];state['phase']=self.phase
            if self.phase=='verifying':
                self.verifying_attempts+=1
                if self.verifying_attempts==1:
                    # The server accepted progress, but its response was lost.
                    self.clock+=11
                    raise TimeoutError('PRIVATE transport detail must not be stored')
        elif action=='complete':state.update(status='complete',phase='complete')
        elif action=='fail' and body['errorCode']=='WORKER_UNREACHABLE':
            raise error.HTTPError(req.full_url,400,'private response',{},None)
        if action=='baseline' and not any(row['action']=='claim' for row in self.actions):state.update(status='queued',phase='queued')
        return Response({'ok':True,'state':state,**extra})

    def subprocess(self,args,**kwargs):
        self.clock+=5
        if args[0]=='capture':
            mode,output=args[1:3]
            value={'records':[{'conversation_id':CID,'label':'Synthetic caller 1m Missed call'}],'captured_at':AT}
            if mode=='thread':value={'conversation_id':CID,'concern':'My brakes are grinding.'}
            Path(output).write_text(json.dumps(value))
        else:
            self.imports+=1
            Path(args[args.index('--journal')+1]).write_text(json.dumps({'status':'acknowledged_pending_independent_readback'}))
        return mock.Mock(returncode=0,stderr='')

    def run_worker(self):
        modules={'beside_archive':self.archive,'refresh_worker':self.queue}
        with mock.patch.object(R.importlib,'import_module',side_effect=modules.__getitem__), \
             mock.patch.object(R.request,'build_opener',return_value=mock.Mock(open=self.open)), \
             mock.patch.object(R,'capture_command',side_effect=lambda settings,mode,output,path:['capture',mode,str(output)]), \
             mock.patch.object(R.subprocess,'run',side_effect=self.subprocess), \
             mock.patch.object(R,'conversation',return_value={'id':CID,'name':'Name not provided','concern':'My brakes are grinding.','received_at':AT}), \
             mock.patch.object(R.time,'monotonic',side_effect=lambda:self.clock), \
             mock.patch.object(R.beside_intake,'post_new',return_value={'enabled':False}):
            return R.run(settings_path=self.settings,budget_seconds=600)

    def test_lost_verifying_response_retries_same_progress_then_completes_without_reimport(self):
        result=self.run_worker()
        self.assertTrue(result['ok'],result)
        self.assertTrue(result['fresh_scan_performed'])
        self.assertEqual(self.imports,1)
        self.assertEqual(self.verifying_attempts,2)
        verifying=[row for row in self.actions if row.get('phase')=='verifying']
        self.assertEqual(verifying,[verifying[0],verifying[0]])
        self.assertEqual(len([row for row in self.actions if row['action']=='complete']),1)
        self.assertFalse(any(row['action']=='fail' for row in self.actions))
        self.queue.completion.assert_called_once()


if __name__=='__main__':unittest.main()
