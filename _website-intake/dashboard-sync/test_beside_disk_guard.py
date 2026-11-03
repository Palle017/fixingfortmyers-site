"""Synthetic disk-exhaustion checks for the refresh runner. No installed settings, browser, queue, or network.

Regression for 2026-11-02 job 44c7fde7: a per-run full archive copy filled VM101's disk, the failure handler's
journal write failed before the fail request, and the server lease expired silently (LEASE_EXPIRED)."""
import errno
import sqlite3
import tempfile
import unittest
from collections import namedtuple
from unittest import mock

import beside_attempt as A
import beside_refresh_runner as R
from test_beside_runner_reliability import Fixture

Usage = namedtuple('Usage', 'total used free')
GIB = 1024 ** 3


def disk(free):
    return mock.patch.object(R.shutil, 'disk_usage', return_value=Usage(100 * GIB, 100 * GIB - free, free))


class DiskGuardTests(unittest.TestCase):
    def test_successful_run_makes_no_per_run_archive_copy(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            copies = []
            fixture.database = lambda: R_types_database(copies)
            with disk(50 * GIB):
                out = fixture.run()
            self.assertTrue(out['ok'], out)
            self.assertEqual(copies, [])
            self.assertEqual(list(fixture.runs.rglob('archive-before.sqlite3')), [])
            self.assertIn('complete', fixture.actions)

    def test_low_disk_never_claims(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            with disk(100 * 1024 ** 2):
                out = fixture.run()
            self.assertNotIn('claim', fixture.actions)
            self.assertFalse(out['ok'])
            self.assertEqual(out['error'], 'LOCAL_STORAGE_UNAVAILABLE')
            self.assertEqual(out['deferred_reason'], 'DISK_SPACE_LOW')
            self.assertEqual(out['disk_free_bytes'], 100 * 1024 ** 2)
            self.assertFalse(any(path.name.startswith('queued-uia-') for path in fixture.runs.iterdir()))

    def test_required_headroom_includes_archive_size_and_setting(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            archive = fixture.root / 'synthetic.sqlite3'
            archive.write_bytes(b'x' * 4096)
            settings = dict(fixture.values, beside_minimum_free_bytes=3 * GIB)
            with disk(3 * GIB + 4095):
                self.assertEqual(R.disk_headroom(settings), (False, 3 * GIB + 4095, 3 * GIB + 4096))
            with disk(3 * GIB + 4096):
                self.assertTrue(R.disk_headroom(settings)[0])
            # A smaller configured value cannot lower the floor.
            with disk(GIB):
                self.assertFalse(R.disk_headroom(dict(fixture.values, beside_minimum_free_bytes=1))[0])

    def test_disk_shrinking_after_claim_reports_failure_to_queue(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            free = [50 * GIB]
            original = fixture.worker_behavior
            def shrink(action, body):
                if action == 'baseline' and fixture.state.get('phase') == 'checking':
                    free[0] = 10 * 1024 ** 2
                return original(action, body) if original else None
            fixture.worker_behavior = shrink
            usage = lambda path: Usage(100 * GIB, 100 * GIB - free[0], free[0])
            with mock.patch.object(R.shutil, 'disk_usage', side_effect=usage):
                out = fixture.run()
            self.assertIn('claim', fixture.actions)
            self.assertIn('fail', fixture.actions)
            self.assertNotIn('complete', fixture.actions)
            self.assertEqual(out['error'], 'LOCAL_STORAGE_UNAVAILABLE')
            self.assertTrue(out['failure_reporting']['accepted'])
            self.assertEqual(fixture.state['status'], 'failed')

    def test_full_disk_during_archive_still_sends_fail(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            full = [False]
            def ingest(*args):
                full[0] = True
                raise sqlite3.OperationalError('database or disk is full')
            fixture.archive.ingest = ingest
            real_atomic = A._atomic
            def atomic(path, data):
                if full[0]:
                    raise OSError(errno.ENOSPC, 'No space left on device')
                return real_atomic(path, data)
            real_write = R.write
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


def R_types_database(copies):
    from types import SimpleNamespace
    return SimpleNamespace(backup=lambda other: copies.append(other), close=lambda: None,
                           execute=lambda *args: SimpleNamespace(fetchone=lambda: None))


if __name__ == '__main__':
    unittest.main()
