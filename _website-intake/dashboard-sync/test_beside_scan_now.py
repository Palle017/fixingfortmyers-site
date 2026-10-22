import json, tempfile, unittest
from pathlib import Path
from unittest import mock
import beside_refresh_runner as R


class ScanNowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.settings = self.tmp / 'settings.json'
        self.settings.write_text('{}')

    def test_attention_evidence(self):
        run = self.tmp / 'queued-uia-1'; run.mkdir()
        (run / 'lease.json').write_text(json.dumps({'state': {'jobId': 'job-1'}}))
        self.assertEqual(R.attention_evidence(self.tmp, 'job-1'), {'found': True, 'import_attempted': False})
        (run / 'apply-journal.json').write_text('{}')
        self.assertTrue(R.attention_evidence(self.tmp, 'job-1')['import_attempted'])
        self.assertEqual(R.attention_evidence(self.tmp, 'job-2'), {'found': False})
        self.assertEqual(R.attention_evidence(self.tmp, None), {'found': False})

    def test_scan_now_runs_manual_under_lock(self):
        lock = mock.MagicMock()
        with mock.patch('beside_heartbeat_linux.capture_lock', return_value=lock) as take, \
             mock.patch.object(R, 'run', return_value={'ok': True}) as run, mock.patch('builtins.print'):
            self.assertEqual(R.main(['--scan-now', '--settings', str(self.settings)]), 0)
        take.assert_called_once()
        self.assertTrue(run.call_args.kwargs['manual'])
        self.assertEqual(run.call_args.kwargs['budget_seconds'], 600)
        lock.close.assert_called_once()

    def test_scan_now_refuses_when_capture_running(self):
        with mock.patch('beside_heartbeat_linux.capture_lock', return_value=None), \
             mock.patch.object(R, 'run') as run, mock.patch('builtins.print') as out:
            self.assertEqual(R.main(['--scan-now', '--settings', str(self.settings)]), 1)
        run.assert_not_called()
        self.assertIn('capture_already_running', out.call_args.args[0])

    def test_default_cli_is_plain_poll(self):
        with mock.patch.object(R, 'run', return_value={'ok': True}) as run, mock.patch('builtins.print'):
            self.assertEqual(R.main([]), 0)
        self.assertNotIn('manual', run.call_args.kwargs)

    def test_server_code_is_short_codes_only(self):
        self.assertEqual(R.server_code(b'{"ok":false,"code":"INVALID_ACTION"}'), 'INVALID_ACTION')
        self.assertEqual(R.server_code({'error': 'not_requestable'}), 'not_requestable')
        self.assertIsNone(R.server_code({'error': 'some long sentence with spaces'}))
        self.assertIsNone(R.server_code(b'<html>'))

    def test_unexpected_exception_type_is_reported(self):
        out = R.run(settings_path=self.settings, budget_seconds=30)
        self.assertEqual((out['error'], out['exception']), ('WORKER_FAILED', 'KeyError'))


class OwnerRequestRequiredTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        refresh = self.tmp / 'refresh'; (refresh / 'runs').mkdir(parents=True)
        dep = self.tmp / 'src' / 'scripts' / 'beside-import'; dep.mkdir(parents=True)
        (dep / 'beside_archive.py').write_text('import json\ndef canonical(v):return json.dumps(v,sort_keys=True,separators=(",",":"))\n')
        (dep / 'refresh_worker.py').write_text('')
        cfg = self.tmp / 'cfg.json'
        cfg.write_text(json.dumps({'url': 'https://dashboard.fixingfortmyers.com', 'service_token': 'x' * 20, 'sync_token': 'y' * 20}))
        self.settings = refresh / 'settings.json'
        self.settings.write_text(json.dumps({'private_archive_root': str(self.tmp), 'runs_directory': str(refresh / 'runs'),
            'source_checkout': str(self.tmp / 'src'), 'private_sync_config': str(cfg), 'beside_auto_scan_minutes': 15}))
        self.actions = []

    def opener(self, status):
        test = self
        class Resp:
            def __init__(self, body): self.body = body; self.status = 200
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def read(self, n): return self.body
        class Opener:
            def open(self, req, timeout=None):
                action = json.loads(req.data)['action']; test.actions.append(action)
                return Resp(json.dumps({'ok': True, 'state': {'status': status}}).encode())
        return Opener()

    def test_scan_now_without_queued_job_fails_fast_without_browser_or_request(self):
        with mock.patch.object(R.request, 'build_opener', return_value=self.opener('complete')), \
             mock.patch.object(R.subprocess, 'run') as sub:
            out = R.run(settings_path=self.settings, budget_seconds=60, manual=True)
        self.assertEqual((out['ok'], out['error'], out['queue_status']), (False, 'OWNER_REQUEST_REQUIRED', 'complete'))
        self.assertIn('Refresh Beside', out['owner_request_required'])
        self.assertEqual(self.actions, ['baseline'])
        sub.assert_not_called()

    def test_auto_scan_never_sends_request(self):
        def fake_run(args, **kw):
            Path(args[args.index('-OutputPath') + 1] if '-OutputPath' in args else args[-1]).write_text('{}')
            return mock.Mock(returncode=0, stderr='')
        with mock.patch.object(R.request, 'build_opener', return_value=self.opener('idle')), \
             mock.patch.object(R, 'capture_command', side_effect=lambda s, m, o, p: ['x', str(o)]), \
             mock.patch.object(R.subprocess, 'run', side_effect=fake_run):
            out = R.run(settings_path=self.settings, budget_seconds=60)
        self.assertTrue(out['ok'])
        self.assertEqual(self.actions, ['heartbeat', 'baseline'])
        self.assertIn('owner_request_required', out)


if __name__ == '__main__':
    unittest.main()
