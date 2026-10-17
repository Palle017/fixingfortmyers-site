"""Quiet deterministic sync runner for Windows Task Scheduler; no customer content in status."""
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
from time import monotonic

RUN_STARTED = monotonic()

ROOT = Path(__file__).resolve().parent
PRIVATE = ROOT.parent / 'dashboard-sync-private'
try:
    result = subprocess.run([sys.executable, str(ROOT / 'sync_dashboard.py'), '--config', str(PRIVATE / 'config.json')], capture_output=True, text=True, timeout=150, creationflags=subprocess.CREATE_NO_WINDOW)
    raw = result.stdout.strip() or result.stderr.strip()
    try:
        detail = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        detail = {'ok': False, 'error': 'unexpected_sync_output'}
    status = {'checked_at': datetime.now(timezone.utc).isoformat(), 'exit_code': result.returncode, 'result': detail}
except Exception:
    status = {'checked_at': datetime.now(timezone.utc).isoformat(), 'exit_code': 1, 'result': {'ok': False, 'error': 'runner_failed'}}
PRIVATE.mkdir(exist_ok=True)
temporary = PRIVATE / 'last-run.tmp'
temporary.write_text(json.dumps(status, indent=2), encoding='utf-8')
temporary.replace(PRIVATE / 'last-run.json')
# Compare authoritative cloud IDs and completed Beside scans with the live dashboard.
# This does not scrape Beside, emit a fake heartbeat, or change owner decisions.
try:
    from reconcile_dashboard import run as reconcile_dashboard
    status['reconciliation'] = reconcile_dashboard(budget_seconds=max(0, min(45, 170-(monotonic()-RUN_STARTED))))
except Exception:
    status['reconciliation'] = {'ok': False, 'delivery_ok': False, 'error': 'reconciliation_failed'}
if not status['reconciliation'].get('ok'):
    status['exit_code'] = 1
status['legacy_sync_scope'] = 'Local legacy snapshot only. Authoritative source coverage is in reconciliation.'
temporary.write_text(json.dumps(status, indent=2), encoding='utf-8')
temporary.replace(PRIVATE / 'last-run.json')

# SEO has its own daily receipt; its failure never changes the lead-sync receipt or exit.
try:
    from collect_seo import collect
    # Keep the existing three-minute task limit, including a slow lead-sync attempt.
    collect(PRIVATE, timeout_seconds=max(5, min(75, 170 - (monotonic() - RUN_STARTED))))
except Exception:
    pass
sys.exit(status['exit_code'])
