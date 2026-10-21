"""Browser-free heartbeat: no network (fake worker/opener), no systemd (fake starter)."""
from datetime import datetime, timedelta, timezone
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import beside_heartbeat_linux as H  # noqa: E402
import capture_beside_linux as L  # noqa: E402

NOW = datetime(2026, 10, 21, 8, 0, tzinfo=timezone.utc)
HERE = Path(__file__).resolve().parent


class Env(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name)
        (self.root / 'refresh').mkdir()
        self.settings = {'beside_linux_capture_enabled': True, 'private_archive_root': str(self.root),
                         'private_sync_config': str(self.root / 'sync.json')}
        self.path = self.root / 'settings.json'; self.save()
        self.calls = []; self.started = []; self.state = 'idle'

    def tearDown(self):
        self.tmp.cleanup()

    def save(self):
        self.path.write_text(json.dumps(self.settings))

    def status(self, ok=True, ready=True, age=timedelta(minutes=5)):
        (self.root / 'refresh' / 'uia-worker-status.json').write_text(json.dumps(
            {'ok': ok, 'worker_ready': ready, 'checked_at': (NOW - age).isoformat().replace('+00:00', 'Z')}))

    def worker(self, action, **extra):
        self.calls.append(action)
        return {'ok': True, 'state': {'status': self.state}}

    def run_hb(self):
        return H.run(self.path, now=NOW, worker=self.worker, starter=lambda: self.started.append(1))


class Heartbeat(Env):
    def test_off_by_default(self):
        self.settings.pop('beside_linux_capture_enabled'); self.save(); self.status()
        out = self.run_hb()
        self.assertEqual(out['enabled'], False); self.assertEqual(self.calls, []); self.assertEqual(self.started, [])

    def test_heartbeat_when_source_recently_verified(self):
        self.status()
        out = self.run_hb()
        self.assertTrue(out['ok']); self.assertTrue(out['heartbeat_sent'])
        self.assertEqual(self.calls, ['heartbeat', 'baseline']); self.assertEqual(self.started, [])

    def test_no_fake_readiness_when_capture_failed_or_stale(self):
        for kwargs in ({'ok': False}, {'ready': False}, {'age': timedelta(minutes=16)}, {'age': timedelta(minutes=-1)}):
            self.calls.clear(); self.started.clear(); self.status(**kwargs)
            out = self.run_hb()
            self.assertFalse(out['heartbeat_sent']); self.assertEqual(self.calls, [])
            self.assertEqual(self.started, [1])  # capture kicked to re-prove the source
        (self.root / 'refresh' / 'uia-worker-status.json').unlink()
        self.calls.clear(); self.assertFalse(self.run_hb()['heartbeat_sent']); self.assertEqual(self.calls, [])

    def test_max_age_configurable(self):
        self.settings['beside_heartbeat_max_age_minutes'] = 30; self.save(); self.status(age=timedelta(minutes=20))
        self.assertTrue(self.run_hb()['heartbeat_sent'])

    def test_queued_refresh_starts_capture(self):
        self.status(); self.state = 'queued'
        out = self.run_hb()
        self.assertEqual(out['capture_started'], 'queued_refresh'); self.assertEqual(self.started, [1])

    def test_lock_prevents_overlap(self):
        self.status(); self.state = 'queued'
        held = H.capture_lock(self.settings); self.assertIsNotNone(held)
        try:
            self.assertIsNone(H.capture_lock(self.settings))
            out = self.run_hb()
            self.assertFalse(out['capture_started']); self.assertEqual(self.started, [])
            self.assertEqual(L.service(str(self.path)), {'ok': True, 'enabled': True, 'skipped': 'capture_already_running'})
        finally:
            held.close()
        again = H.capture_lock(self.settings); self.assertIsNotNone(again); again.close()

    def test_worker_errors_reported_without_crash(self):
        self.status()
        def broken(action, **extra): raise OSError('down')
        out = H.run(self.path, now=NOW, worker=broken, starter=lambda: None)
        self.assertFalse(out['ok']); self.assertEqual(out['error'], 'OSError')


class WorkerCall(Env):
    def write_config(self, url='https://dashboard.fixingfortmyers.com/api/sync'):
        Path(self.settings['private_sync_config']).write_text(json.dumps(
            {'url': url, 'service_token': 'synthetic-service-value', 'sync_token': 'synthetic-sync-value'}))

    def test_same_request_shape_as_windows_runner_and_no_claims(self):
        self.write_config(); sent = []
        class Resp(io.BytesIO):
            status = 200
            def __enter__(self): return self
            def __exit__(self, *a): return False
        class Opener:
            def open(self, req, timeout): sent.append(req); return Resp(b'{"ok":true,"state":{"status":"idle"}}')
        worker = H.make_worker(self.settings, Opener())
        worker('heartbeat')
        req = sent[0]
        self.assertEqual(req.full_url, 'https://dashboard.fixingfortmyers.com/api/beside-refresh/worker')
        self.assertEqual(req.data, b'{"action":"heartbeat"}')
        self.assertEqual(req.get_header('Oai-sites-authorization'), 'Bearer synthetic-service-value')
        self.assertEqual(req.get_header('X-owner-sync-token'), 'synthetic-sync-value')
        for action in ('claim', 'complete', 'progress', 'fail'):
            with self.assertRaises(ValueError): worker(action)

    def test_untrusted_origin_refused(self):
        self.write_config('https://evil.example/api/sync')
        with self.assertRaises(ValueError): H.make_worker(self.settings, object())


class Units(unittest.TestCase):
    def test_units(self):
        svc = (HERE / 'linux' / 'beside-heartbeat.service').read_text()
        timer = (HERE / 'linux' / 'beside-heartbeat.timer').read_text()
        self.assertIn('beside_heartbeat_linux.py', svc); self.assertNotIn('xvfb', svc); self.assertIn('MemoryMax=', svc)
        self.assertIn('OnUnitActiveSec=1min', timer)
        self.assertEqual(H.CAPTURE_UNIT, 'beside-capture.service')


if __name__ == '__main__':
    unittest.main()
