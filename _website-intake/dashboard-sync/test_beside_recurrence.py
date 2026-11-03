"""Synthetic regressions for the independent Opus review of PR #228 (task-12/opus-review/OPUS-REVIEW.md): non-atomic
settings/checkpoint writes, fail after an accepted complete, SIGTERM -> silent lease expiry, disk-full error code,
early disk warning, backup vs. archive writer overlap, restore exit status, keepalive before capacity. Linux only."""
import errno
import json
import os
from pathlib import Path
import signal
import sqlite3
import tempfile
import unittest
from collections import namedtuple
from unittest import mock

import beside_archive_backup as B
import beside_capacity as C
import beside_heartbeat_linux as H
import beside_refresh_runner as R
import capture_beside_linux as L
from test_beside_runner_reliability import Fixture
from test_beside_archive_backup import Setup, T0

Usage = namedtuple('Usage', 'total used free')
GIB = 1024 ** 3


def disk(free):
    return mock.patch.object(C.shutil, 'disk_usage', return_value=Usage(100 * GIB, 100 * GIB - free, free))


class AtomicWrite(unittest.TestCase):
    def test_full_disk_leaves_previous_file_intact_and_no_temp(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'settings.json'
            R.write(path, {'version': 1})
            os.chmod(path, 0o600)
            real = os.fsync
            with mock.patch.object(R.os, 'fsync', side_effect=OSError(errno.ENOSPC, 'No space left on device')):
                with self.assertRaises(OSError):
                    R.write(path, {'version': 2, 'big': 'x' * 10000})
            self.assertEqual(json.loads(path.read_text()), {'version': 1})
            self.assertEqual(sorted(p.name for p in Path(root).iterdir()), ['settings.json'])
            R.write(path, {'version': 3})
            self.assertEqual(json.loads(path.read_text()), {'version': 3})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)


class RunnerFailurePaths(unittest.TestCase):
    def test_error_after_accepted_complete_never_sends_fail(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            real_write = R.write
            def write(path, value):
                if Path(path) == fixture.settings and 'complete' in fixture.actions:
                    raise OSError(errno.ENOSPC, 'No space left on device')
                return real_write(path, value)
            with disk(50 * GIB), mock.patch.object(R, 'write', side_effect=write):
                out = fixture.run()
            self.assertIn('complete', fixture.actions)
            self.assertNotIn('fail', fixture.actions)
            self.assertTrue(out['post_completion_error'])
            self.assertEqual(fixture.state['status'], 'complete')

    def test_sigterm_mid_run_reports_failure_for_exact_lease(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            original = fixture.sub
            def sub(args, **kw):
                if args[0] == 'synthetic-capture' and args[1] == 'thread':
                    os.kill(os.getpid(), signal.SIGTERM)
                return original(args, **kw)
            fixture.sub = sub
            before = signal.getsignal(signal.SIGTERM)
            with disk(50 * GIB):
                out = fixture.run()
            self.assertEqual(signal.getsignal(signal.SIGTERM), before)
            self.assertEqual(out['terminated_by_signal'], 'SIGTERM')
            self.assertIn('fail', fixture.actions)
            self.assertTrue(out['failure_reporting']['accepted'])
            fail = next(b for b in fixture.bodies if b['action'] == 'fail')
            self.assertEqual((fail['jobId'], fail['claimToken']), (fixture.state['jobId'], 'a' * 64))

    def test_sqlite_disk_full_is_reported_as_storage(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            def ingest(*args):
                raise sqlite3.OperationalError('database or disk is full')
            fixture.archive.ingest = ingest
            with disk(50 * GIB):
                out = fixture.run()
            fail = next(b for b in fixture.bodies if b['action'] == 'fail')
            self.assertEqual(fail['errorCode'], 'LOCAL_STORAGE_UNAVAILABLE')
            self.assertEqual(out['error'], 'LOCAL_STORAGE_UNAVAILABLE')

    def test_disk_warning_before_the_guard_stops_work(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            with disk(2 * GIB):
                out = fixture.run()
            self.assertTrue(out['ok'], out)
            self.assertTrue(out['disk_warning'])
            with tempfile.TemporaryDirectory() as other:
                fixture = Fixture(other)
                with disk(50 * GIB):
                    self.assertNotIn('disk_warning', fixture.run())


class BackupOverlap(unittest.TestCase):
    def test_backup_waits_for_capture_lock_and_gives_up_without_writing(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            holder = H.capture_lock(s.settings)
            sleeps = []
            try:
                code, record = B.backup(s.settings, now=T0, capture_wait_seconds=45, sleep=sleeps.append)
            finally:
                holder.close()
            self.assertEqual((code, record['error']), (5, 'CAPTURE_RUNNING'))
            self.assertEqual(sleeps, [15, 15, 15])
            self.assertEqual(s.backups(), [])

    def test_backup_proceeds_once_the_capture_finishes(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            holder = H.capture_lock(s.settings)
            code, record = B.backup(s.settings, now=T0, capture_wait_seconds=60, sleep=lambda seconds: holder.close())
            self.assertEqual((code, record['result']), (0, 'PUBLISHED'))

    def test_capture_service_skips_while_backup_holds_the_lock(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            settings = dict(s.settings, beside_linux_capture_enabled=True)
            path = Path(root) / 'settings.json'
            path.write_text(json.dumps(settings))
            holder = H.capture_lock(settings)
            try:
                self.assertEqual(L.service(path)['skipped'], 'capture_already_running')
            finally:
                holder.close()

    def test_restore_result_not_ok_exits_nonzero(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            path = Path(root) / 'settings.json'
            path.write_text(json.dumps(s.settings))
            with mock.patch.object(B, 'restore', return_value=(0, {'ok': False, 'result': 'RESTORED'})), \
                    mock.patch('builtins.print'):
                self.assertEqual(B.main(['--settings', str(path), '--restore', 'x']), 4)
            with mock.patch.object(B, 'restore', return_value=(0, {'ok': True, 'result': 'RESTORED'})), \
                    mock.patch('builtins.print'):
                self.assertEqual(B.main(['--settings', str(path), '--restore', 'x']), 0)


class KeepaliveCapacity(unittest.TestCase):
    def test_keepalive_never_opens_browser_on_low_disk(self):
        with tempfile.TemporaryDirectory() as root:
            settings = {'persistent_archive': str(Path(root) / 'a.sqlite3'), 'private_archive_root': root,
                        'beside_keepalive_enabled': True}
            path = Path(root) / 'settings.json'
            path.write_text(json.dumps(settings))
            with disk(1), mock.patch.object(L, 'keepalive') as keep, \
                    mock.patch.object(R, 'run', return_value={'ok': False}):
                status = L._service_locked(path, settings)
            keep.assert_not_called()
            self.assertEqual(status['keepalive'], {'skipped': 'disk_space_low'})


if __name__ == '__main__':
    unittest.main()
