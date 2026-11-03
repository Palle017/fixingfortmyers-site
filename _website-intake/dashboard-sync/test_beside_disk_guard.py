"""Synthetic disk-exhaustion checks for the refresh runner and heartbeat. No installed settings, browser, queue,
or network.

Regression for 2026-11-02 job 44c7fde7: a per-run full archive copy filled VM101's disk, the failure handler's
journal write failed before the fail request, and the server lease expired silently (LEASE_EXPIRED). Includes the
independent review's cases (task-11/audit/review_failure_cases.py)."""
import errno
import json
import sqlite3
import tempfile
import unittest
from collections import namedtuple
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import beside_attempt as A
import beside_capacity as C
import beside_heartbeat_linux as H
import beside_refresh_runner as R
from test_beside_runner_reliability import Fixture

Usage = namedtuple('Usage', 'total used free')
GIB = 1024 ** 3


def disk(free):
    return mock.patch.object(C.shutil, 'disk_usage', return_value=Usage(100 * GIB, 100 * GIB - free, free))


def recording_database(copies):
    return SimpleNamespace(backup=lambda other: copies.append(other), close=lambda: None,
                           execute=lambda *args: SimpleNamespace(fetchone=lambda: None))


class DiskGuardTests(unittest.TestCase):
    def test_successful_run_makes_no_per_run_archive_copy(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            copies = []
            fixture.database = lambda: recording_database(copies)
            with disk(50 * GIB):
                out = fixture.run()
            self.assertTrue(out['ok'], out)
            self.assertEqual(copies, [])
            self.assertEqual(list(fixture.runs.rglob('archive-before.sqlite3')), [])
            self.assertIn('complete', fixture.actions)

    def test_low_disk_opens_no_source_sends_no_heartbeat_and_is_not_ready(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            with disk(100 * 1024 ** 2):
                out = fixture.run()
            self.assertEqual(fixture.capture_calls, [])
            self.assertEqual(fixture.actions, [])
            self.assertFalse(out['ok'])
            self.assertFalse(out['worker_ready'])
            self.assertEqual(out['ingestion_capacity'], 'unavailable')
            self.assertEqual((out['error'], out['deferred_reason']), ('LOCAL_STORAGE_UNAVAILABLE', 'DISK_SPACE_LOW'))
            self.assertEqual(out['disk_free_bytes'], 100 * 1024 ** 2)
            status = json.loads((fixture.refresh / 'uia-worker-status.json').read_text())
            self.assertFalse(status['worker_ready'])
            self.assertFalse(any(path.name.startswith('queued-uia-') for path in fixture.runs.iterdir()))

    def test_low_disk_manual_scan_makes_no_queue_request(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            with disk(1):
                out = fixture.run(manual=True)
            self.assertEqual(fixture.actions, [])
            self.assertEqual(fixture.capture_calls, [])
            self.assertFalse(out['worker_ready'])

    def test_space_lost_during_readiness_probe_never_claims(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            free = [50 * GIB]
            def heartbeat(action, body):
                if action == 'heartbeat':
                    free[0] = 1
            fixture.worker_behavior = heartbeat
            with mock.patch.object(C.shutil, 'disk_usage', side_effect=lambda p: Usage(100 * GIB, 0, free[0])):
                out = fixture.run()
            self.assertNotIn('claim', fixture.actions)
            self.assertFalse(out['worker_ready'])
            self.assertEqual(out['deferred_reason'], 'DISK_SPACE_LOW')

    def test_required_headroom_includes_archive_size_and_setting(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            archive = fixture.root / 'synthetic.sqlite3'
            archive.write_bytes(b'x' * 4096)
            settings = dict(fixture.values, beside_minimum_free_bytes=3 * GIB)
            with disk(3 * GIB + 4095):
                self.assertEqual(C.disk_headroom(settings), (False, 3 * GIB + 4095, 3 * GIB + 4096))
            with disk(3 * GIB + 4096):
                self.assertTrue(C.disk_headroom(settings)[0])
            with disk(GIB):
                self.assertFalse(C.disk_headroom(dict(fixture.values, beside_minimum_free_bytes=1))[0])

    def test_disk_shrinking_after_claim_reports_failure_to_queue(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            free = [50 * GIB]
            def shrink(action, body):
                if action == 'baseline' and fixture.state.get('phase') == 'checking':
                    free[0] = 10 * 1024 ** 2
            fixture.worker_behavior = shrink
            with mock.patch.object(C.shutil, 'disk_usage', side_effect=lambda p: Usage(100 * GIB, 0, free[0])):
                out = fixture.run()
            self.assertIn('claim', fixture.actions)
            self.assertIn('fail', fixture.actions)
            self.assertNotIn('complete', fixture.actions)
            self.assertEqual(out['error'], 'LOCAL_STORAGE_UNAVAILABLE')
            self.assertTrue(out['failure_reporting']['accepted'])
            self.assertEqual(fixture.state['status'], 'failed')
            fail = next(body for body in fixture.bodies if body['action'] == 'fail')
            self.assertEqual((fail['jobId'], fail['claimToken']), (fixture.state['jobId'], 'a' * 64))

    def test_full_disk_during_archive_still_sends_fail(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            full = [False]
            def ingest(*args):
                full[0] = True
                raise sqlite3.OperationalError('database or disk is full')
            fixture.archive.ingest = ingest
            real_atomic, real_write = A._atomic, R.write
            def atomic(path, data):
                if full[0]:
                    raise OSError(errno.ENOSPC, 'No space left on device')
                return real_atomic(path, data)
            def write(path, value):
                if full[0]:
                    raise OSError(errno.ENOSPC, 'No space left on device')
                return real_write(path, value)
            with disk(50 * GIB), mock.patch.object(A, '_atomic', side_effect=atomic), \
                    mock.patch.object(R, 'write', side_effect=write):
                out = fixture.run()
            self.assertIn('fail', fixture.actions)
            self.assertTrue(out['failure_reporting']['accepted'], out)
            self.assertNotIn('queue_failure_unconfirmed', out)
            self.assertTrue(out['attempt_evidence_unavailable'])
            self.assertEqual(fixture.state['status'], 'failed')

    def test_disk_full_after_grant_still_fails_exact_lease_without_import(self):
        """Independent review case 1: ENOSPC persisting the acquired claim."""
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            real_atomic = A._atomic
            def atomic(path, value):
                if value.get('claim_state') in ('acquired', 'failed'):
                    raise OSError(errno.ENOSPC, 'test disk full')
                return real_atomic(path, value)
            with disk(50 * GIB), mock.patch.object(A, '_atomic', side_effect=atomic):
                out = fixture.run()
            self.assertIn('claim', fixture.actions)
            self.assertIn('fail', fixture.actions)
            self.assertTrue(out['failure_reporting']['accepted'], out)
            self.assertEqual(fixture.imports, 0)
            self.assertEqual(fixture.state['status'], 'failed')
            fail = next(body for body in fixture.bodies if body['action'] == 'fail')
            self.assertEqual((fail['jobId'], fail['claimToken']), (fixture.state['jobId'], 'a' * 64))

    def test_undurable_import_intent_never_launches_import(self):
        """Independent review case 2: write_uncertain intent must be durable before the importer runs."""
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            fixture.with_import = True
            fixture.plan.update(batches=[{}], proposed={'new': [{}], 'updated': []})
            real_atomic = A._atomic
            def atomic(path, value):
                if value.get('claim_state') == 'write_uncertain':
                    raise OSError(errno.ENOSPC, 'test disk full')
                return real_atomic(path, value)
            with disk(50 * GIB), mock.patch.object(A, '_atomic', side_effect=atomic):
                out = fixture.run()
            self.assertEqual(fixture.imports, 0)
            self.assertIn('fail', fixture.actions)
            self.assertNotIn('complete', fixture.actions)
            self.assertEqual(fixture.state['status'], 'attention')
            self.assertTrue(out['failure_reporting']['accepted'], out)

    def test_pending_claim_intent_stays_strict(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            real_atomic = A._atomic
            def atomic(path, value):
                if value.get('claim_state') == 'pending':
                    raise OSError(errno.ENOSPC, 'test disk full')
                return real_atomic(path, value)
            with disk(50 * GIB), mock.patch.object(A, '_atomic', side_effect=atomic):
                fixture.run()
            self.assertNotIn('claim', fixture.actions)


class HeartbeatCapacity(unittest.TestCase):
    def test_low_disk_sends_no_heartbeat_even_with_a_fresh_ready_status(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            (root / 'refresh').mkdir()
            now = datetime(2026, 11, 3, 16, 0, tzinfo=timezone.utc)
            (root / 'refresh' / 'uia-worker-status.json').write_text(json.dumps(
                {'ok': True, 'worker_ready': True, 'checked_at': (now - timedelta(minutes=2)).isoformat()}))
            settings = {'beside_linux_capture_enabled': True, 'private_archive_root': str(root),
                        'persistent_archive': str(root / 'archive.sqlite3'), 'private_sync_config': str(root / 'sync.json')}
            path = root / 'settings.json'
            path.write_text(json.dumps(settings))
            calls = []
            worker = lambda action, **extra: calls.append(action) or {'ok': True, 'state': {'status': 'queued'}}
            with disk(1):
                out = H.run(path, now=now, worker=worker, starter=lambda: calls.append('start'))
            self.assertEqual(calls, [])
            self.assertFalse(out['ok'])
            self.assertEqual(out['error'], 'ingestion_capacity_unavailable')
            with disk(50 * GIB):
                out = H.run(path, now=now, worker=worker, starter=lambda: calls.append('start'))
            self.assertTrue(out['heartbeat_sent'])


if __name__ == '__main__':
    unittest.main()
