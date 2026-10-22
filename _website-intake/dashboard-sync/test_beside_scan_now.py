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


if __name__ == '__main__':
    unittest.main()
