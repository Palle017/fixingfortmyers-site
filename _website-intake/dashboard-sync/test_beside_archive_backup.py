"""Synthetic checks for archive backup/restore. Temporary databases only; no installed settings. Linux (fcntl).

Covers the independent review of c7202d1 (task-11/IMPLEMENTATION-REVIEW.md): same-second reruns, concurrent
writers, preexisting destinations, durable commit before prune, manifest ownership, guarded restore."""
from datetime import datetime, timedelta, timezone
import gzip
import hashlib
import json
import multiprocessing
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from collections import namedtuple
from unittest import mock

import beside_archive_backup as B
import beside_heartbeat_linux as H

Usage = namedtuple('Usage', 'total used free')
GIB = 1024 ** 3
T0 = datetime(2026, 11, 3, 3, 17, tzinfo=timezone.utc)


class Setup:
    def __init__(self, root):
        self.root = Path(root)
        self.archive = self.root / 'normalization' / 'beside-archive.sqlite3'
        self.archive.parent.mkdir()
        db = sqlite3.connect(self.archive)
        db.execute('CREATE TABLE conversations(provider_id TEXT PRIMARY KEY, raw_json TEXT)')
        db.executemany('INSERT INTO conversations VALUES(?,?)', [(f'prv_{n}', 'x' * 200) for n in range(500)])
        db.commit()
        db.close()
        self.settings = {'persistent_archive': str(self.archive), 'private_archive_root': str(self.root)}
        self.target = self.root / 'backups' / 'archive-daily'

    def add(self, value):
        db = sqlite3.connect(self.archive)
        db.execute('INSERT INTO conversations VALUES(?,?)', (value, 'y'))
        db.commit()
        db.close()

    def backups(self):
        return sorted(p.name for p in self.target.iterdir() if B.NAME.fullmatch(p.name)) if self.target.exists() else []

    def manifest(self):
        return [json.loads(line) for line in (self.target / B.MANIFEST).read_text().splitlines()]

    def temporaries(self):
        return [p.name for p in self.target.iterdir() if p.name.startswith('.tmp-')]


def concurrent_backup(settings, start, results, index):
    start.wait()
    code, record = B.backup(settings, now=T0)
    results[index] = (code, record.get('result') or record.get('error'), record.get('file'))


class Backup(unittest.TestCase):
    def test_partial_manifest_tail_is_preserved_and_new_publication_remains_owned(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            _, first = B.backup(s.settings, now=T0)
            manifest = s.target / B.MANIFEST
            original = manifest.read_bytes()
            tail = b'42\n{"event":"published"'
            with manifest.open('ab') as log:
                log.write(tail)
            s.add('changed-after-interrupted-manifest')
            code, record = B.backup(s.settings, now=T0 + timedelta(minutes=1))
            self.assertEqual((code, record['result']), (0, 'PUBLISHED'))
            self.assertTrue(manifest.read_bytes().startswith(original + tail + b'\n'))
            self.assertEqual(set(B.owned(s.target)), {first['file'], record['file']})
            self.assertNotIn(record['file'], record['unowned_preserved'])
            self.assertEqual(B.sha256(s.target / record['file']), B.owned(s.target)[record['file']]['gzip_sha256'])

    def test_publishes_verified_restorable_copy_with_ownership_record(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            before = s.archive.read_bytes()
            code, record = B.backup(s.settings, now=T0)
            self.assertEqual((code, record['result']), (0, 'PUBLISHED'), record)
            published = s.target / record['file']
            self.assertTrue(B.NAME.fullmatch(record['file']))
            self.assertEqual(hashlib.sha256(published.read_bytes()).hexdigest(), record['gzip_sha256'])
            self.assertEqual(hashlib.sha256(gzip.decompress(published.read_bytes())).hexdigest(), record['sqlite_sha256'])
            self.assertEqual(s.archive.read_bytes(), before)
            self.assertEqual([r['event'] for r in s.manifest()], ['published'])
            self.assertEqual(s.temporaries(), [])

    def test_unchanged_archive_rerun_is_idempotent_and_rewrites_nothing(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            _, first = B.backup(s.settings, now=T0)
            data = (s.target / first['file']).read_bytes()
            for when in (T0, T0 + timedelta(hours=5)):
                code, again = B.backup(s.settings, now=when)
                self.assertEqual((code, again['result'], again['file']), (0, 'ALREADY_PUBLISHED', first['file']))
            self.assertEqual(s.backups(), [first['file']])
            self.assertEqual((s.target / first['file']).read_bytes(), data)
            self.assertEqual(len(s.manifest()), 1)

    def test_same_second_with_changed_source_keeps_both_and_first_stays_verified(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            _, first = B.backup(s.settings, now=T0)
            data = (s.target / first['file']).read_bytes()
            s.add('newer')
            code, second = B.backup(s.settings, now=T0)
            self.assertEqual((code, second['result']), (0, 'PUBLISHED'))
            self.assertNotEqual(first['file'], second['file'])
            self.assertEqual((s.target / first['file']).read_bytes(), data)
            self.assertEqual(B.sha256(s.target / first['file']), first['gzip_sha256'])
            self.assertEqual(len(s.backups()), 2)

    def test_preexisting_destination_is_never_replaced(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            probe, s = Setup(a), Setup(b)
            s.archive.write_bytes(probe.archive.read_bytes())
            _, predicted = B.backup(probe.settings, now=T0)
            s.target.mkdir(parents=True)
            squatter = s.target / predicted['file']
            squatter.write_bytes(b'not a backup')
            code, record = B.backup(s.settings, now=T0)
            self.assertEqual((code, record['error']), (4, 'DESTINATION_EXISTS'))
            self.assertEqual(squatter.read_bytes(), b'not a backup')
            self.assertEqual(s.temporaries(), [])
            self.assertFalse((s.target / B.MANIFEST).exists())

    def test_link_race_on_destination_is_not_replaced(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            real_link = os.link
            def racing(src, dst):
                Path(dst).write_bytes(b'other writer')
                return real_link(src, dst)
            with mock.patch.object(B.os, 'link', side_effect=racing):
                code, record = B.backup(s.settings, now=T0)
            self.assertEqual((code, record['error']), (4, 'DESTINATION_EXISTS'))
            self.assertEqual((s.target / record['file']).read_bytes(), b'other writer')
            self.assertEqual(s.temporaries(), [])

    def test_lock_held_means_busy_and_nothing_written(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            s.target.mkdir(parents=True)
            holder = B.lock(s.target)
            try:
                code, record = B.backup(s.settings, now=T0)
            finally:
                holder.close()
            self.assertEqual((code, record['error']), (5, 'BACKUP_ALREADY_RUNNING'))
            self.assertEqual(s.backups(), [])
            self.assertEqual(s.temporaries(), [])

    def test_truly_concurrent_processes_publish_one_verified_copy(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            s.target.mkdir(parents=True)
            context = multiprocessing.get_context('fork')
            start = context.Event()
            with context.Manager() as manager:
                results = manager.dict()
                workers = [context.Process(target=concurrent_backup, args=(s.settings, start, results, i)) for i in range(6)]
                for worker in workers:
                    worker.start()
                start.set()
                for worker in workers:
                    worker.join(60)
                outcomes = dict(results)
            self.assertEqual(len(outcomes), 6)
            self.assertTrue(all(code in (0, 5) for code, _, _ in outcomes.values()), outcomes)
            self.assertEqual(len([o for o in outcomes.values() if o[1] == 'PUBLISHED']), 1, outcomes)
            self.assertEqual(len(s.backups()), 1)
            self.assertEqual(len([r for r in s.manifest() if r['event'] == 'published']), 1)
            only = s.manifest()[0]
            self.assertEqual(B.sha256(s.target / only['file']), only['gzip_sha256'])
            self.assertEqual(s.temporaries(), [])

    def test_partial_temporaries_from_a_crash_are_preserved_and_reported(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            s.target.mkdir(parents=True)
            (s.target / '.tmp-crashed.sqlite3.gz').write_bytes(b'partial')
            code, record = B.backup(s.settings, now=T0)
            self.assertEqual(code, 0)
            self.assertEqual(record['stale_temporaries'], ['.tmp-crashed.sqlite3.gz'])
            self.assertEqual((s.target / '.tmp-crashed.sqlite3.gz').read_bytes(), b'partial')

    def test_low_disk_writes_nothing(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            with mock.patch.object(B.shutil, 'disk_usage', return_value=Usage(10 * GIB, 10 * GIB - 1, 1)):
                code, record = B.backup(s.settings)
            self.assertEqual((code, record['error']), (3, 'DISK_SPACE_LOW'))
            self.assertEqual(s.backups(), [])
            self.assertEqual(s.temporaries(), [])

    def test_failed_quick_check_publishes_nothing_and_keeps_old_backups(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            _, first = B.backup(s.settings, now=T0 - timedelta(days=1))
            s.add('changed')
            real = sqlite3.connect
            class Bad:
                def __init__(self, conn): self.conn = conn
                def execute(self, sql, *a):
                    if sql == 'PRAGMA quick_check':
                        return iter([('*** in database main ***',)])
                    return self.conn.execute(sql, *a)
                def close(self): self.conn.close()
            def connect(path, *a, **k):
                conn = real(path, *a, **k)
                return Bad(conn) if '.tmp-' in str(path) and 'mode=ro' in str(path) else conn
            with mock.patch.object(B.sqlite3, 'connect', side_effect=connect):
                code, record = B.backup(s.settings, now=T0)
            self.assertEqual((code, record['error']), (4, 'QUICK_CHECK_FAILED'))
            self.assertEqual(s.backups(), [first['file']])
            self.assertEqual(s.temporaries(), [])


def owned_history(s, days, prune=False):
    """Create `days` manifest-owned backups on consecutive days with changing content."""
    files = []
    for day in range(days):
        s.add(f'day{day}')
        code, record = B.backup(s.settings, now=T0 - timedelta(days=days - day), prune=prune)
        assert code == 0, record
        files.append(record['file'])
    return files


class Retention(unittest.TestCase):
    def test_pruning_is_off_by_default_and_only_reports(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            files = owned_history(s, 15)
            s.add('today')
            code, record = B.backup(s.settings, now=T0)
            self.assertEqual(code, 0)
            self.assertFalse(record['prune_enabled'])
            self.assertTrue(record['would_remove'])
            self.assertEqual(record['removed'], [])
            self.assertTrue(set(files) <= set(s.backups()))

    def test_unowned_matching_files_are_never_deleted(self):
        """Review reproduction: 20 pattern-matching gzip files without an ownership manifest."""
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            s.target.mkdir(parents=True)
            names = []
            for day in range(20):
                for name in (f'beside-archive-{B.stamp(T0 - timedelta(days=40 - day))}-{day:012x}.sqlite3.gz',
                             f'beside-archive-{B.stamp(T0 - timedelta(days=40 - day))}.sqlite3.gz'):
                    (s.target / name).write_bytes(b'unowned')
                    names.append(name)
            code, record = B.backup(s.settings, now=T0, prune=True)
            self.assertEqual(code, 0)
            self.assertEqual(record['removed'], [])
            for name in names:
                self.assertEqual((s.target / name).read_bytes(), b'unowned')
            self.assertEqual(len(record['unowned_preserved']), 40)

    def test_enabled_pruning_removes_only_verified_owned_outside_retention(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            files = owned_history(s, 44)
            tampered = files[0]
            (s.target / tampered).write_bytes(b'modified after publication')
            s.add('today')
            code, record = B.backup(s.settings, now=T0, prune=True)
            self.assertEqual(code, 0, record)
            kept = s.backups()
            self.assertIn(record['file'], kept)
            self.assertIn(tampered, kept)
            self.assertIn(tampered, record['ambiguous_preserved'])
            self.assertEqual(sorted(record['retained']), sorted(set(kept) - {tampered}))
            self.assertLessEqual(len(record['retained']), B.KEEP_DAILY + B.KEEP_WEEKLY)
            dates = sorted(datetime.strptime(B.NAME.fullmatch(n).group(1), '%Y%m%dT%H%M%SZ') for n in record['retained'])
            self.assertGreaterEqual(len({d.isocalendar()[:2] for d in dates}), B.KEEP_WEEKLY)
            self.assertEqual(len(record['removed']), 45 - len(kept))
            events = [r['event'] for r in s.manifest()]
            self.assertEqual(events[-2:], ['prune_intent', 'pruned'])
            # Pruned files are no longer owned; a later run never counts them again.
            self.assertFalse(set(record['removed']) & set(B.owned(s.target)))

    def test_commit_boundary_is_durable_before_any_prune(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            owned_history(s, 14)
            s.add('today')
            trace = []
            real_fsync, real_link, real_unlink, real_append = os.fsync, os.link, Path.unlink, B.append_record
            real_fsync_dir = B.fsync_dir
            def fsync(fd):
                trace.append('fsync:' + os.path.basename(os.readlink(f'/proc/self/fd/{fd}')))
                return real_fsync(fd)
            def link(a, b):
                trace.append('link:' + Path(b).name)
                return real_link(a, b)
            def unlink(path, *a, **k):
                if B.NAME.fullmatch(path.name):
                    trace.append('unlink-backup')
                return real_unlink(path, *a, **k)
            def append(target, record):
                real_append(target, record)
                trace.append('manifest:' + record['event'])
            def fsync_dir(path):
                trace.append('fsync-dir')
                return real_fsync_dir(path)
            with mock.patch.object(B.os, 'fsync', side_effect=fsync), mock.patch.object(B.os, 'link', side_effect=link), \
                    mock.patch.object(Path, 'unlink', autospec=True, side_effect=unlink), \
                    mock.patch.object(B, 'append_record', side_effect=append), \
                    mock.patch.object(B, 'fsync_dir', side_effect=fsync_dir):
                code, record = B.backup(s.settings, now=T0, prune=True)
            self.assertEqual(code, 0, record)
            self.assertTrue(record['removed'])
            link_at = next(i for i, e in enumerate(trace) if e.startswith('link:'))
            gzip_fsync = max(i for i, e in enumerate(trace[:link_at]) if e.startswith('fsync:.tmp-') and e.endswith('.gz'))
            published = trace.index('manifest:published')
            intent = trace.index('manifest:prune_intent')
            first_prune = trace.index('unlink-backup')
            self.assertLess(gzip_fsync, link_at)
            self.assertIn('fsync-dir', trace[link_at:published])
            self.assertLess(published, intent)
            self.assertLess(intent, first_prune)

    def test_failed_manifest_write_keeps_every_prior_backup(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            files = owned_history(s, 14)
            s.add('today')
            real_append = B.append_record
            def failing(target, record):
                if record.get('event') == 'published':
                    raise OSError(28, 'No space left on device')
                return real_append(target, record)
            with mock.patch.object(B, 'append_record', side_effect=failing):
                code, record = B.backup(s.settings, now=T0, prune=True)
            self.assertEqual((code, record['error']), (4, 'MANIFEST_WRITE_FAILED'))
            for name in files:
                self.assertTrue((s.target / name).exists(), name)
            self.assertNotIn(record['file'], B.owned(s.target))
            # The unowned leftover is preserved by a later run, never pruned.
            code, later = B.backup(s.settings, now=T0 + timedelta(minutes=1), prune=True)
            self.assertEqual(later['result'], 'PUBLISHED')
            self.assertIn(record['file'], later['unowned_preserved'])
            self.assertTrue((s.target / record['file']).exists())


class Restore(unittest.TestCase):
    def published(self, s):
        code, record = B.backup(s.settings, now=T0)
        self.assertEqual(code, 0)
        s.add('observed-after-backup')
        return record['file']

    def test_requires_explicit_acceptance_of_missing_newer_observations(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            name = self.published(s)
            before = s.archive.read_bytes()
            code, record = B.restore(s.settings, name, holders=lambda path: [])
            self.assertEqual((code, record['error']), (4, 'NEWER_OBSERVATIONS_NOT_ACCEPTED'))
            self.assertEqual(s.archive.read_bytes(), before)

    def test_refuses_while_capture_runs_or_archive_is_open(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            name = self.published(s)
            before = s.archive.read_bytes()
            capture = H.capture_lock(s.settings)
            try:
                code, record = B.restore(s.settings, name, accept_missing_newer=True, holders=lambda path: [])
            finally:
                capture.close()
            self.assertEqual((code, record['error']), (4, 'CAPTURE_RUNNING'))
            code, record = B.restore(s.settings, name, accept_missing_newer=True, holders=lambda path: [4242])
            self.assertEqual((code, record['error'], record['pids']), (4, 'ARCHIVE_IN_USE', [4242]))
            # A real second process holding the archive open (a manual writer) is detected through /proc.
            import subprocess, sys
            writer = subprocess.Popen([sys.executable, '-c', 'import sqlite3,sys,time;c=sqlite3.connect(sys.argv[1]);'
                                       'c.execute("SELECT COUNT(*) FROM conversations").fetchone();print("ready",flush=True);time.sleep(30)',
                                       str(s.archive)], stdout=subprocess.PIPE, text=True)
            try:
                self.assertEqual(writer.stdout.readline().strip(), 'ready')
                code, record = B.restore(s.settings, name, accept_missing_newer=True)
            finally:
                writer.kill()
                writer.wait()
                writer.stdout.close()
            self.assertEqual((record['error'], record['pids']), ('ARCHIVE_IN_USE', [writer.pid]))
            self.assertEqual(s.archive.read_bytes(), before)

    def test_refuses_unverified_backup_schema_mismatch_and_leftover_journal(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            name = self.published(s)
            before = s.archive.read_bytes()
            journal = Path(f'{s.archive}-journal')
            journal.write_bytes(b'hot')
            code, record = B.restore(s.settings, name, accept_missing_newer=True, holders=lambda path: [])
            self.assertEqual(record['error'], 'ARCHIVE_JOURNAL_PRESENT')
            journal.unlink()
            db = sqlite3.connect(s.archive)
            db.execute('CREATE TABLE added_later(x)')
            db.commit()
            db.close()
            code, record = B.restore(s.settings, name, accept_missing_newer=True, holders=lambda path: [])
            self.assertEqual((record['error'], record['missing_in_backup']), ('SCHEMA_MISMATCH', ['added_later']))
            (s.target / name).write_bytes(b'tampered')
            code, record = B.restore(s.settings, name, accept_missing_newer=True, holders=lambda path: [])
            self.assertEqual(record['error'], 'BACKUP_NOT_VERIFIED')
            code, record = B.restore(s.settings, 'beside-archive-20990101T000000Z-000000000000.sqlite3.gz',
                                     accept_missing_newer=True, holders=lambda path: [])
            self.assertEqual(record['error'], 'BACKUP_NOT_VERIFIED')
            self.assertNotEqual(s.archive.read_bytes(), before)  # only the test's own schema change

    def test_restore_preserves_current_archive_and_replaces_atomically(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            name = self.published(s)
            live_sha = B.sha256(s.archive)
            entry = B.owned(s.target)[name]
            code, record = B.restore(s.settings, name, accept_missing_newer=True, holders=lambda path: [], now=T0 + timedelta(days=1))
            self.assertEqual((code, record['result'], record['ok']), (0, 'RESTORED', True), record)
            self.assertEqual(record['restored_sha256'], entry['sqlite_sha256'])
            preserved = Path(record['preserved'])
            db = sqlite3.connect(preserved)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM conversations WHERE provider_id='observed-after-backup'").fetchone()[0], 1)
            db.close()
            db = sqlite3.connect(s.archive)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM conversations WHERE provider_id='observed-after-backup'").fetchone()[0], 0)
            self.assertEqual(db.execute('PRAGMA quick_check').fetchone()[0], 'ok')
            db.close()
            self.assertNotEqual(live_sha, record['restored_sha256'])
            self.assertEqual([p.name for p in s.archive.parent.iterdir() if '.restore.' in p.name], [])

    def test_refuses_changed_columns_indexes_and_triggers_without_replacing_live_archive(self):
        changes = (
            "ALTER TABLE conversations ADD COLUMN source_revision TEXT NOT NULL DEFAULT 'v2'",
            'CREATE INDEX conversations_raw ON conversations(raw_json)',
            'CREATE TRIGGER preserve_source AFTER UPDATE ON conversations BEGIN SELECT 1; END',
        )
        for sql in changes:
            with self.subTest(sql=sql), tempfile.TemporaryDirectory() as root:
                s = Setup(root)
                name = self.published(s)
                db = sqlite3.connect(s.archive)
                db.execute(sql)
                db.commit()
                db.close()
                before = s.archive.read_bytes()
                code, record = B.restore(s.settings, name, accept_missing_newer=True, holders=lambda path: [])
                self.assertEqual((code, record['error']), (4, 'SCHEMA_MISMATCH'))
                self.assertTrue(record['schema_objects_changed'])
                self.assertEqual(s.archive.read_bytes(), before)
                self.assertEqual(list(s.archive.parent.glob('*.pre-restore-*')), [])

    def test_refuses_user_or_application_version_downgrade_with_unchanged_schema(self):
        for pragma in ('user_version', 'application_id'):
            with self.subTest(pragma=pragma), tempfile.TemporaryDirectory() as root:
                s = Setup(root)
                name = self.published(s)
                db = sqlite3.connect(s.archive)
                db.execute(f'PRAGMA {pragma}=2')
                db.close()
                before = s.archive.read_bytes()
                code, record = B.restore(s.settings, name, accept_missing_newer=True, holders=lambda path: [])
                self.assertEqual((code, record['error']), (4, 'SCHEMA_MISMATCH'))
                self.assertFalse(record['schema_objects_changed'])
                self.assertEqual(record[f'live_{pragma}'], 2)
                self.assertEqual(record[f'backup_{pragma}'], 0)
                self.assertEqual(s.archive.read_bytes(), before)

    def test_preserved_archive_directory_is_durable_before_live_replacement(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            name = self.published(s)
            events = []
            real_sync, real_replace = B.fsync_dir, os.replace
            def sync(path):
                real_sync(path)
                events.append(('directory_synced', Path(path)))
            def replace(src, dst):
                self.assertIn(('directory_synced', s.archive.parent), events)
                preserved = list(s.archive.parent.glob('*.pre-restore-*'))
                self.assertEqual(len(preserved), 1)
                self.assertNotEqual(B.sha256(preserved[0]), B.owned(s.target)[name]['sqlite_sha256'])
                events.append(('replace', Path(dst)))
                real_replace(src, dst)
            with mock.patch.object(B, 'fsync_dir', side_effect=sync), mock.patch.object(B.os, 'replace', side_effect=replace):
                code, record = B.restore(s.settings, name, accept_missing_newer=True, holders=lambda path: [])
            self.assertEqual((code, record['ok']), (0, True))
            self.assertLess(events.index(('directory_synced', s.archive.parent)), events.index(('replace', s.archive)))

    def test_failed_preservation_directory_sync_never_replaces_live_archive(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            name = self.published(s)
            before = s.archive.read_bytes()
            with mock.patch.object(B, 'fsync_dir', side_effect=OSError('synthetic directory sync failure')):
                with self.assertRaises(OSError):
                    B.restore(s.settings, name, accept_missing_newer=True, holders=lambda path: [])
            self.assertEqual(s.archive.read_bytes(), before)
            self.assertEqual(len(list(s.archive.parent.glob('*.pre-restore-*'))), 1)

    def test_invalid_preserved_copy_never_replaces_live_archive(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            name = self.published(s)
            before = s.archive.read_bytes()
            real_connect = sqlite3.connect
            class BadPreservation:
                def __init__(self, conn): self.conn = conn
                def execute(self, sql, *args):
                    if sql == 'PRAGMA quick_check':
                        return iter([('synthetic preservation check failure',)])
                    return self.conn.execute(sql, *args)
                def close(self): self.conn.close()
            def connect(path, *args, **kwargs):
                conn = real_connect(path, *args, **kwargs)
                return BadPreservation(conn) if '.pre-restore-' in str(path) and '?mode=ro' in str(path) else conn
            with mock.patch.object(B.sqlite3, 'connect', side_effect=connect):
                code, record = B.restore(s.settings, name, accept_missing_newer=True, holders=lambda path: [])
            self.assertEqual((code, record['error']), (4, 'PRESERVATION_CHECK_FAILED'))
            self.assertEqual(s.archive.read_bytes(), before)


if __name__ == '__main__':
    unittest.main()
