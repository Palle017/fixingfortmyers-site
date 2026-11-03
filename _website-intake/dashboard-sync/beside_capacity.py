"""Shared ingestion-capacity rule for the refresh runner and the Linux heartbeat.

A run needs room for its rollback journal (worst case the whole archive), run evidence and status files. On
2026-11-02 per-run full archive copies filled VM101's disk; the failed copy also hid the failure report and left
job 44c7fde7 in LEASE_EXPIRED. A worker without this much free space must neither claim work nor advertise ready.
"""
from __future__ import annotations
from pathlib import Path
import shutil

MINIMUM_FREE_BYTES = 1024 ** 3


def disk_headroom(settings):
    """(ok, free_bytes, required_bytes) for the filesystems holding the archive and run evidence."""
    archive = Path(settings['persistent_archive']).expanduser()
    size = archive.stat().st_size if archive.exists() else 0
    required = max(int(settings.get('beside_minimum_free_bytes', MINIMUM_FREE_BYTES)), MINIMUM_FREE_BYTES) + size
    places = [archive.parent] + ([Path(settings['runs_directory']).expanduser()] if settings.get('runs_directory') else [])
    free = min(shutil.disk_usage(path).free for path in places)
    return free >= required, free, required
