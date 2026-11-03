"""Daily verified backup of the private Beside archive (Linux VM, `beside` user timer).

Replaces the per-run `archive-before.sqlite3` copies, which grew ~250 MB per scan and filled VM101's disk on
2026-11-02. One consistent online copy per day: read-only source connection, SQLite backup API, PRAGMA quick_check
on the copy, gzip, SHA-256 manifest, atomic publish. Retention: the 7 newest daily files plus the newest file of
each of the 4 most recent ISO weeks. Only files this script created (exact name pattern in its own directory) are
ever removed, and only after a new backup is verified. Never touches the live archive, run folders or other copies.
No network, no customer data leaves the VM.

Exit codes: 0 published, 3 not enough disk space (nothing written), 4 verification failed (nothing published).
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import sys

SETTINGS = os.environ.get('BESIDE_REFRESH_SETTINGS') or str(Path.home() / 'beside-private/refresh/settings.json')
NAME = re.compile(r'beside-archive-(\d{8}T\d{6}Z)\.sqlite3\.gz')
KEEP_DAILY = 7
KEEP_WEEKLY = 4
MARGIN_BYTES = 1024 ** 3


def stamp(now):
    return now.strftime('%Y%m%dT%H%M%SZ')


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def fsync_write(path, text):
    with open(path, 'w', encoding='utf-8') as stream:
        stream.write(text)
        stream.flush()
        os.fsync(stream.fileno())


def retained(names):
    """Names to keep: newest KEEP_DAILY, plus the newest of each of the KEEP_WEEKLY most recent ISO weeks."""
    dated = sorted(((datetime.strptime(NAME.fullmatch(name).group(1), '%Y%m%dT%H%M%SZ'), name) for name in names), reverse=True)
    keep = {name for _, name in dated[:KEEP_DAILY]}
    weeks = []
    for when, name in dated:
        week = when.isocalendar()[:2]
        if week not in weeks:
            weeks.append(week)
            if len(weeks) <= KEEP_WEEKLY:
                keep.add(name)
    return keep


def backup(settings, *, now=None):
    now = now or datetime.now(timezone.utc)
    source = Path(settings['persistent_archive'])
    target = Path(settings['private_archive_root']) / 'backups' / 'archive-daily'
    target.mkdir(parents=True, exist_ok=True, mode=0o700)
    size = source.stat().st_size
    free = shutil.disk_usage(target).free
    required = 2 * size + MARGIN_BYTES
    result = {'format': 'beside-archive-backup/v1', 'started_at': now.isoformat(), 'source_bytes': size,
              'free_bytes': free, 'required_bytes': required}
    if free < required:
        return 3, {**result, 'ok': False, 'error': 'DISK_SPACE_LOW'}
    name = f'beside-archive-{stamp(now)}.sqlite3.gz'
    raw = target / f'.tmp-{stamp(now)}.sqlite3'
    packed = target / f'.tmp-{name}'
    try:
        src = sqlite3.connect(f'file:{source}?mode=ro', uri=True, timeout=120)
        dst = sqlite3.connect(str(raw))
        try:
            src.backup(dst, pages=-1)
        finally:
            dst.close()
            src.close()
        check = sqlite3.connect(f'file:{raw}?mode=ro', uri=True)
        try:
            verdict = [row[0] for row in check.execute('PRAGMA quick_check')]
            tables = check.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
        finally:
            check.close()
        if verdict != ['ok']:
            return 4, {**result, 'ok': False, 'error': 'QUICK_CHECK_FAILED', 'quick_check': verdict[:5]}
        raw_sha = sha256(raw)
        with open(raw, 'rb') as stream, gzip.open(packed, 'wb', compresslevel=6) as out:
            shutil.copyfileobj(stream, out, 1 << 20)
        with gzip.open(packed, 'rb') as stream:
            digest = hashlib.sha256()
            for block in iter(lambda: stream.read(1 << 20), b''):
                digest.update(block)
        if digest.hexdigest() != raw_sha:
            return 4, {**result, 'ok': False, 'error': 'COMPRESSED_COPY_MISMATCH'}
        os.replace(packed, target / name)
    finally:
        raw.unlink(missing_ok=True)
        packed.unlink(missing_ok=True)
    record = {**result, 'ok': True, 'file': name, 'sqlite_sha256': raw_sha, 'gzip_sha256': sha256(target / name),
              'gzip_bytes': (target / name).stat().st_size, 'quick_check': 'ok', 'tables': tables}
    names = [entry.name for entry in target.iterdir() if entry.is_file() and NAME.fullmatch(entry.name)]
    keep = retained(names) | {name}
    removed = []
    for old in sorted(set(names) - keep):
        (target / old).unlink()
        removed.append(old)
    record.update(retained=sorted(keep), removed=removed, finished_at=datetime.now(timezone.utc).isoformat())
    with open(target / 'backups.jsonl', 'a', encoding='utf-8') as log:
        log.write(json.dumps(record, sort_keys=True) + '\n')
        log.flush()
        os.fsync(log.fileno())
    fsync_write(target / '.latest.json.tmp', json.dumps(record, indent=2, sort_keys=True) + '\n')
    os.replace(target / '.latest.json.tmp', target / 'latest.json')
    return 0, record


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--settings', default=SETTINGS)
    args = parser.parse_args(argv)
    os.umask(0o077)
    settings = json.loads(Path(args.settings).read_text(encoding='utf-8-sig'))
    code, record = backup(settings)
    print(json.dumps(record, sort_keys=True))
    return code


if __name__ == '__main__':
    sys.exit(main())
