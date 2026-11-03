"""Verified backups of the private Beside archive (Linux VM, `beside` user), plus a guarded restore.

Replaces the per-run `archive-before.sqlite3` copies, which grew ~250 MB per scan and filled VM101's disk on
2026-11-02. Nothing here is scheduled or enabled by shipping it; activation and retention are separate decisions.

Backup (one writer at a time, flock on `.backup.lock`):
  1. Read-only online copy of the archive (SQLite backup API) into an exclusively created temporary file;
     PRAGMA quick_check must return ok.
  2. Gzip into a second exclusively created temporary file, fsync it, and check the decompressed SHA-256.
  3. Publish with os.link to `beside-archive-<UTC>-<sqlite sha256[:12]>.sqlite3.gz`. A link never replaces an
     existing file: an existing name with the same verified content is ALREADY_PUBLISHED (idempotent, nothing
     rewritten); anything else is DESTINATION_EXISTS and nothing is touched. Then fsync the directory.
  4. Append a `published` record to the ownership manifest `backups.jsonl` and fsync it. This is the durable
     commit boundary: nothing is ever pruned before it.
  5. Pruning is off unless settings say `"beside_backup_prune_enabled": true`. Otherwise eligible files are only
     reported (`would_remove`). Only manifest-owned files whose current SHA-256 matches their published record can
     be pruned, and only after a `prune_intent` record is durable. Unowned, legacy-named, modified or missing
     files are preserved and reported. Retention when enabled: 7 newest plus the newest of the 4 latest ISO weeks.

Restore (`--restore FILE`): refuses unless it holds the shared capture lock, no process has the archive open, the
file is manifest-owned and hash-verified, quick_check passes and its schema and application/user versions match
the live archive. The live
archive is preserved first as `<archive>.pre-restore-<UTC>.sqlite3` (verified copy), then the restored file
replaces it atomically. A backup does not contain observations archived after it was taken: restore requires
`--accept-missing-newer-observations`. Owner edits live in Owner Desk, not in this archive, and are unaffected.

Exit codes: 0 PUBLISHED/ALREADY_PUBLISHED/RESTORED, 3 DISK_SPACE_LOW, 4 verification/destination/restore refusal,
5 BACKUP_ALREADY_RUNNING.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import fcntl
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import sys
import tempfile

SETTINGS = os.environ.get('BESIDE_REFRESH_SETTINGS') or str(Path.home() / 'beside-private/refresh/settings.json')
NAME = re.compile(r'beside-archive-(\d{8}T\d{6}Z)-([0-9a-f]{12})\.sqlite3\.gz')
MANIFEST = 'backups.jsonl'
LOCK = '.backup.lock'
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


def gunzip_sha256(path):
    digest = hashlib.sha256()
    with gzip.open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def fsync_dir(path):
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def append_record(target, record):
    """Append one manifest line durably (file fsync, then directory fsync so a new manifest's entry persists)."""
    # A crash can leave a partial last line. Preserve it, but separate the new record so owned() can read it.
    # Callers serialize manifest changes with the backup lock; never truncate existing history to repair a tail.
    with open(target / MANIFEST, 'a+b') as log:
        log.seek(0, os.SEEK_END)
        if log.tell():
            log.seek(-1, os.SEEK_END)
            if log.read(1) != b'\n':
                log.write(b'\n')
        log.write((json.dumps(record, sort_keys=True) + '\n').encode('utf-8'))
        log.flush()
        os.fsync(log.fileno())
    fsync_dir(target)


def owned(target):
    """Published records not later pruned, keyed by file name. Unreadable lines are ignored, never trusted."""
    records = {}
    path = target / MANIFEST
    if not path.exists():
        return records
    for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if not isinstance(entry, dict):
            continue
        name = entry.get('file')
        if entry.get('event') == 'published' and isinstance(name, str) and NAME.fullmatch(name):
            records[name] = entry
        elif entry.get('event') == 'pruned':
            for gone in entry.get('files', []):
                records.pop(gone, None)
    return records


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


def exclusive_temp(target, suffix):
    fd, path = tempfile.mkstemp(dir=target, prefix='.tmp-', suffix=suffix)
    return fd, Path(path)


def target_dir(settings):
    return Path(settings['private_archive_root']).expanduser() / 'backups' / 'archive-daily'


def lock(target):
    handle = open(target / LOCK, 'a+')
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        return None
    return handle


def backup(settings, *, now=None, prune=None):
    now = now or datetime.now(timezone.utc)
    prune = settings.get('beside_backup_prune_enabled') is True if prune is None else prune
    source = Path(settings['persistent_archive']).expanduser()
    target = target_dir(settings)
    target.mkdir(parents=True, exist_ok=True, mode=0o700)
    result = {'format': 'beside-archive-backup/v2', 'started_at': now.isoformat()}
    held = lock(target)
    if held is None:
        return 5, {**result, 'ok': False, 'error': 'BACKUP_ALREADY_RUNNING'}
    temporaries = []
    try:
        size = source.stat().st_size
        free = shutil.disk_usage(target).free
        required = 2 * size + MARGIN_BYTES
        result.update(source_bytes=size, free_bytes=free, required_bytes=required)
        if free < required:
            return 3, {**result, 'ok': False, 'error': 'DISK_SPACE_LOW'}
        fd, raw = exclusive_temp(target, '.sqlite3')
        os.close(fd)
        temporaries.append(raw)
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
        name = f'beside-archive-{stamp(now)}-{raw_sha[:12]}.sqlite3.gz'
        final = target / name
        records = owned(target)
        for prior_name, prior in sorted(records.items()):
            # Unchanged archive: the existing verified copy is the result; do not write a duplicate.
            if prior.get('sqlite_sha256') == raw_sha and (target / prior_name).exists() \
                    and sha256(target / prior_name) == prior.get('gzip_sha256'):
                return 0, {**result, 'ok': True, 'result': 'ALREADY_PUBLISHED', 'file': prior_name, 'sqlite_sha256': raw_sha}
        if final.exists():
            prior = records.get(name)
            if prior and prior.get('sqlite_sha256') == raw_sha and sha256(final) == prior.get('gzip_sha256'):
                return 0, {**result, 'ok': True, 'result': 'ALREADY_PUBLISHED', 'file': name, 'sqlite_sha256': raw_sha}
            return 4, {**result, 'ok': False, 'error': 'DESTINATION_EXISTS', 'file': name}
        fd, packed = exclusive_temp(target, '.sqlite3.gz')
        temporaries.append(packed)
        with os.fdopen(fd, 'wb') as handle:
            with gzip.GzipFile(fileobj=handle, mode='wb', compresslevel=6) as out, open(raw, 'rb') as stream:
                shutil.copyfileobj(stream, out, 1 << 20)
            handle.flush()
            os.fsync(handle.fileno())
        if gunzip_sha256(packed) != raw_sha:
            return 4, {**result, 'ok': False, 'error': 'COMPRESSED_COPY_MISMATCH'}
        gzip_sha = sha256(packed)
        try:
            os.link(packed, final)
        except FileExistsError:
            return 4, {**result, 'ok': False, 'error': 'DESTINATION_EXISTS', 'file': name}
        fsync_dir(target)
        if sha256(final) != gzip_sha:
            return 4, {**result, 'ok': False, 'error': 'PUBLISHED_COPY_MISMATCH', 'file': name}
        record = {**result, 'event': 'published', 'ok': True, 'result': 'PUBLISHED', 'file': name,
                  'sqlite_sha256': raw_sha, 'gzip_sha256': gzip_sha, 'gzip_bytes': final.stat().st_size,
                  'quick_check': 'ok', 'tables': tables}
        try:
            append_record(target, record)
        except OSError as exc:
            # The published file stays (unowned, so never pruned); earlier backups are untouched.
            return 4, {**result, 'ok': False, 'error': 'MANIFEST_WRITE_FAILED', 'file': name, 'detail': type(exc).__name__}
        # Durable commit boundary passed: the new copy, its directory entry and its ownership record are on disk.
        for path in temporaries:
            path.unlink(missing_ok=True)
        temporaries.clear()
        record.update(retention(target, name, prune))
        return 0, record
    finally:
        for path in temporaries:
            path.unlink(missing_ok=True)
        held.close()


def retention(target, newest, prune):
    records = owned(target)
    verified, ambiguous = [], []
    for name, entry in records.items():
        path = target / name
        if path.exists() and sha256(path) == entry.get('gzip_sha256'):
            verified.append(name)
        else:
            ambiguous.append(name)
    unowned = sorted(entry.name for entry in target.iterdir()
                     if entry.is_file() and entry.name.endswith('.gz') and not entry.name.startswith('.tmp-')
                     and entry.name not in records)
    keep = retained(verified) | {newest}
    eligible = sorted(set(verified) - keep)
    report = {'retained': sorted(keep), 'unowned_preserved': unowned, 'ambiguous_preserved': sorted(ambiguous),
              'stale_temporaries': sorted(entry.name for entry in target.iterdir() if entry.name.startswith('.tmp-')),
              'prune_enabled': prune, 'would_remove': eligible, 'removed': []}
    if not prune or not eligible:
        return report
    append_record(target, {'event': 'prune_intent', 'files': eligible, 'at': datetime.now(timezone.utc).isoformat()})
    removed = []
    for name in eligible:
        path = target / name
        if sha256(path) == records[name].get('gzip_sha256'):
            path.unlink()
            removed.append(name)
    fsync_dir(target)
    append_record(target, {'event': 'pruned', 'files': removed, 'at': datetime.now(timezone.utc).isoformat()})
    report['removed'] = removed
    return report


def open_by_other_process(path):
    """PIDs (other than this one) holding `path` open, from /proc. Linux only."""
    path = os.path.realpath(path)
    holders = []
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit() or int(entry.name) == os.getpid():
            continue
        try:
            for fd in (entry / 'fd').iterdir():
                if os.path.realpath(fd) in (path, path + '-journal', path + '-wal'):
                    holders.append(int(entry.name))
                    break
        except OSError:
            continue
    return holders


def tables_of(path):
    db = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    try:
        return sorted(row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'"))
    finally:
        db.close()


def schema_of(path):
    """Exact persisted schema and version identifiers; accepting missing observations is not a migration."""
    db = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    try:
        return {'objects': list(db.execute('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name,tbl_name')),
                'user_version': db.execute('PRAGMA user_version').fetchone()[0],
                'application_id': db.execute('PRAGMA application_id').fetchone()[0]}
    finally:
        db.close()


def restore(settings, name, *, accept_missing_newer=False, holders=open_by_other_process, now=None):
    import beside_heartbeat_linux  # shared capture.lock, also held by the capture service and --scan-now
    now = now or datetime.now(timezone.utc)
    archive = Path(settings['persistent_archive']).expanduser()
    target = target_dir(settings)
    result = {'format': 'beside-archive-restore/v1', 'file': name, 'started_at': now.isoformat()}
    if not accept_missing_newer:
        return 4, {**result, 'ok': False, 'error': 'NEWER_OBSERVATIONS_NOT_ACCEPTED',
                   'detail': 'A backup lacks observations archived after it was taken; pass the explicit acceptance flag.'}
    capture = beside_heartbeat_linux.capture_lock(settings)
    if capture is None:
        return 4, {**result, 'ok': False, 'error': 'CAPTURE_RUNNING'}
    temporaries = []
    try:
        busy = holders(archive)
        if busy:
            return 4, {**result, 'ok': False, 'error': 'ARCHIVE_IN_USE', 'pids': busy}
        leftovers = [str(p) for p in (Path(f'{archive}-journal'), Path(f'{archive}-wal')) if p.exists()]
        if leftovers:
            # SQLite would apply a leftover journal to whatever file sits at this path, including a restored one.
            return 4, {**result, 'ok': False, 'error': 'ARCHIVE_JOURNAL_PRESENT', 'files': leftovers}
        entry = owned(target).get(name)
        path = target / name
        if not entry or not path.exists() or sha256(path) != entry.get('gzip_sha256'):
            return 4, {**result, 'ok': False, 'error': 'BACKUP_NOT_VERIFIED'}
        size = archive.stat().st_size
        free = shutil.disk_usage(archive.parent).free
        if free < 2 * max(size, entry.get('gzip_bytes', 0) * 4) + MARGIN_BYTES:
            return 3, {**result, 'ok': False, 'error': 'DISK_SPACE_LOW', 'free_bytes': free}
        fd, candidate = exclusive_temp(archive.parent, '.restore.sqlite3')
        temporaries.append(candidate)
        with os.fdopen(fd, 'wb') as handle, gzip.open(path, 'rb') as stream:
            shutil.copyfileobj(stream, handle, 1 << 20)
            handle.flush()
            os.fsync(handle.fileno())
        if sha256(candidate) != entry.get('sqlite_sha256'):
            return 4, {**result, 'ok': False, 'error': 'RESTORE_HASH_MISMATCH'}
        check = sqlite3.connect(f'file:{candidate}?mode=ro', uri=True)
        try:
            verdict = [row[0] for row in check.execute('PRAGMA quick_check')]
        finally:
            check.close()
        if verdict != ['ok']:
            return 4, {**result, 'ok': False, 'error': 'QUICK_CHECK_FAILED'}
        live_schema, backup_schema = schema_of(archive), schema_of(candidate)
        live_tables, backup_tables = tables_of(archive), tables_of(candidate)
        if live_schema != backup_schema:
            return 4, {**result, 'ok': False, 'error': 'SCHEMA_MISMATCH',
                       'missing_in_backup': sorted(set(live_tables) - set(backup_tables)),
                       'extra_in_backup': sorted(set(backup_tables) - set(live_tables)),
                       'schema_objects_changed': live_schema['objects'] != backup_schema['objects'],
                       'live_user_version': live_schema['user_version'], 'backup_user_version': backup_schema['user_version'],
                       'live_application_id': live_schema['application_id'], 'backup_application_id': backup_schema['application_id']}
        preserved = archive.with_name(f'{archive.name}.pre-restore-{stamp(now)}.sqlite3')
        if preserved.exists():
            return 4, {**result, 'ok': False, 'error': 'DESTINATION_EXISTS', 'preserved': str(preserved)}
        live = sqlite3.connect(f'file:{archive}?mode=ro', uri=True)
        keep = sqlite3.connect(str(preserved))
        try:
            live.backup(keep, pages=-1)
        finally:
            keep.close()
            live.close()
        with open(preserved, 'rb+') as handle:
            os.fsync(handle.fileno())
        preserved_sha = sha256(preserved)
        check = sqlite3.connect(f'file:{preserved}?mode=ro', uri=True)
        try:
            preserved_check = [row[0] for row in check.execute('PRAGMA quick_check')]
        finally:
            check.close()
        if preserved_check != ['ok']:
            return 4, {**result, 'ok': False, 'error': 'PRESERVATION_CHECK_FAILED', 'preserved': str(preserved)}
        # The preserved recovery copy and its directory entry must survive a crash before replacing the live file.
        fsync_dir(archive.parent)
        if holders(archive):
            return 4, {**result, 'ok': False, 'error': 'ARCHIVE_IN_USE', 'preserved': str(preserved)}
        os.replace(candidate, archive)
        temporaries.remove(candidate)
        fsync_dir(archive.parent)
        restored_sha = sha256(archive)
        return 0, {**result, 'ok': restored_sha == entry.get('sqlite_sha256'), 'result': 'RESTORED',
                   'preserved': str(preserved), 'preserved_sha256': preserved_sha, 'restored_sha256': restored_sha}
    finally:
        for path in temporaries:
            path.unlink(missing_ok=True)
        capture.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--settings', default=SETTINGS)
    parser.add_argument('--restore', metavar='FILE', help='Published backup file name to restore (see module docs).')
    parser.add_argument('--accept-missing-newer-observations', action='store_true')
    args = parser.parse_args(argv)
    os.umask(0o077)
    settings = json.loads(Path(args.settings).read_text(encoding='utf-8-sig'))
    if args.restore:
        code, record = restore(settings, args.restore, accept_missing_newer=args.accept_missing_newer_observations)
    else:
        code, record = backup(settings)
    print(json.dumps(record, sort_keys=True))
    return code


if __name__ == '__main__':
    sys.exit(main())
