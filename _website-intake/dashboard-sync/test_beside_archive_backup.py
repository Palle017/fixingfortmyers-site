"""Synthetic checks for the daily archive backup. Temporary databases only; no installed settings."""
from collections import namedtuple
from datetime import datetime, timedelta, timezone
import gzip
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest import mock

import beside_archive_backup as B

Usage = namedtuple('Usage', 'total used free')
GIB = 1024 ** 3


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


class BackupTests(unittest.TestCase):
    def test_publishes_verified_restorable_copy_with_manifest(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            before = s.archive.read_bytes()
            code, record = B.backup(s.settings, now=datetime(2026, 11, 3, 3, 17, tzinfo=timezone.utc))
            self.assertEqual(code, 0, record)
            published = s.target / record['file']
            self.assertEqual(record['file'], 'beside-archive-20261103T031700Z.sqlite3.gz')
            self.assertEqual(hashlib.sha256(published.read_bytes()).hexdigest(), record['gzip_sha256'])
            restored = s.root / 'restored.sqlite3'
            restored.write_bytes(gzip.decompress(published.read_bytes()))
            self.assertEqual(hashlib.sha256(restored.read_bytes()).hexdigest(), record['sqlite_sha256'])
            db = sqlite3.connect(restored)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM conversations').fetchone()[0], 500)
            db.close()
            self.assertEqual(s.archive.read_bytes(), before)
            self.assertEqual(json.loads((s.target / 'latest.json').read_text())['file'], record['file'])
            self.assertEqual(len((s.target / 'backups.jsonl').read_text().splitlines()), 1)
            self.assertEqual([p.name for p in s.target.iterdir() if p.name.startswith('.tmp-')], [])

    def test_low_disk_writes_nothing(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            with mock.patch.object(B.shutil, 'disk_usage', return_value=Usage(10 * GIB, 10 * GIB - 1, 1)):
                code, record = B.backup(s.settings)
            self.assertEqual((code, record['error']), (3, 'DISK_SPACE_LOW'))
            self.assertEqual(list(s.target.iterdir()), [])

    def test_failed_quick_check_publishes_nothing_and_keeps_old_backups(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            code, first = B.backup(s.settings, now=datetime(2026, 11, 2, 3, 17, tzinfo=timezone.utc))
            self.assertEqual(code, 0)
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
                code, record = B.backup(s.settings, now=datetime(2026, 11, 3, 3, 17, tzinfo=timezone.utc))
            self.assertEqual((code, record['error']), (4, 'QUICK_CHECK_FAILED'))
            self.assertEqual(sorted(p.name for p in s.target.iterdir() if B.NAME.fullmatch(p.name)), [first['file']])
            self.assertEqual([p.name for p in s.target.iterdir() if p.name.startswith('.tmp-')], [])

    def test_retention_keeps_7_daily_and_4_weekly_and_only_own_files(self):
        with tempfile.TemporaryDirectory() as root:
            s = Setup(root)
            s.target.mkdir(parents=True)
            start = datetime(2026, 9, 20, 3, 17, tzinfo=timezone.utc)
            for day in range(44):
                (s.target / f'beside-archive-{B.stamp(start + timedelta(days=day))}.sqlite3.gz').write_bytes(b'old')
            foreign = ['archive-before.sqlite3', 'beside-archive-manual.sqlite3.gz', 'notes.txt']
            for name in foreign:
                (s.target / name).write_bytes(b'keep')
            now = start + timedelta(days=44)
            code, record = B.backup(s.settings, now=now)
            self.assertEqual(code, 0, record)
            kept = sorted(p.name for p in s.target.iterdir() if B.NAME.fullmatch(p.name))
            self.assertIn(record['file'], kept)
            self.assertEqual(kept, sorted(record['retained']))
            dates = sorted(datetime.strptime(B.NAME.fullmatch(n).group(1), '%Y%m%dT%H%M%SZ') for n in kept)
            self.assertEqual(len([d for d in dates if d >= (now - timedelta(days=6)).replace(tzinfo=None)]), 7)
            self.assertLessEqual(len(kept), 7 + 4)
            self.assertGreaterEqual(len({d.isocalendar()[:2] for d in dates}), 4)
            for name in foreign:
                self.assertEqual((s.target / name).read_bytes(), b'keep')
            self.assertEqual(len(record['removed']), 45 - len(kept))


if __name__ == '__main__':
    unittest.main()
