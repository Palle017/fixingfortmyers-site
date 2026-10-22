"""Private, bounded diagnostics and claim uncertainty; never store transport payloads."""
from __future__ import annotations
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import re
import uuid

SERVER_CODES = frozenset({
    'INVALID_ACTION', 'INVALID_REQUEST', 'CLAIM_CONFLICT', 'REFRESH_STATE_CHANGED',
    'WORKER_UNAVAILABLE', 'WORKER_OFFLINE', 'LEASE_EXPIRED', 'ATTENTION_RESOLVED',
    'BASELINE_UNAVAILABLE', 'CAPTURE_INCOMPLETE', 'SOURCE_IDENTITY_MISMATCH',
    'BROWSER_UNAVAILABLE', 'LOCAL_STORAGE_UNAVAILABLE', 'WORKER_FAILED',
    'IMPORT_RESULT_UNCERTAIN', 'READBACK_MISMATCH', 'VERIFICATION_REQUIRED',
    'not_requestable', 'BESIDE_SIGN_IN_REQUIRED', 'REVIEW_REQUIRED',
    'VALIDATION_FAILED', 'IMPORT_REJECTED',
})
FAILURE_CODES = frozenset({
    'BROWSER_UNAVAILABLE', 'BESIDE_SIGN_IN_REQUIRED', 'SOURCE_IDENTITY_MISMATCH',
    'CAPTURE_INCOMPLETE', 'REVIEW_REQUIRED', 'VERIFICATION_REQUIRED',
    'VALIDATION_FAILED', 'BASELINE_UNAVAILABLE', 'IMPORT_REJECTED',
    'IMPORT_RESULT_UNCERTAIN', 'READBACK_MISMATCH', 'LOCAL_STORAGE_UNAVAILABLE',
    'WORKER_FAILED',
})
ERROR_CODES = SERVER_CODES | frozenset({
    'WORKER_UNREACHABLE', 'WORKER_RESPONSE_INVALID', 'CLAIM_REVIEW_REQUIRED',
    'INSUFFICIENT_CAPTURE_BUDGET', 'SOURCE_READ_TIMEOUT', 'SOURCE_READ_NONZERO',
})
EXCEPTION_TYPES = frozenset({
    'TimeoutError', 'TimeoutExpired', 'HTTPError', 'URLError', 'JSONDecodeError',
    'OSError', 'PermissionError', 'FileNotFoundError', 'ValueError', 'TypeError',
    'KeyError', 'AttributeError', 'ScanError', 'RuntimeError',
})
SOURCE_REASONS = frozenset({
    'no_observation', 'observe_failed', 'page_not_on_thread', 'capture_error',
    'ambiguous_visible_contact_identity', 'capture_identity_mismatch',
    'capture_identity_unverified', 'capture_timezone_missing', 'capture_too_large',
    'contact_identity_missing', 'conversation_pane_not_stable',
    'conversation_still_loading', 'displayed_activity_day_missing',
    'displayed_activity_time_missing', 'future_displayed_activity', 'invalid_capture',
    'invalid_capture_nodes', 'invalid_capture_observation', 'invalid_observation_timestamp',
    'inventory_identity_missing', 'inventory_identity_unreadable', 'inventory_target_changed',
    'navigation_changed_during_capture', 'observations_not_independent',
    'rendered_contact_does_not_match_target', 'selected_thread_not_substantive',
    'target_link_not_unique', 'three_observations_required', 'unrecognized_activity_month',
})
OPERATIONS = frozenset({
    'start', 'worker.heartbeat', 'worker.baseline', 'worker.claim', 'worker.progress',
    'worker.complete', 'worker.fail', 'capture.inventory', 'capture.thread',
    'claim.pending', 'claim.acquired', 'claim.refused', 'claim.uncertain',
    'claim.reconciled', 'mkdir', 'budget.deferred', 'held', 'failure', 'complete',
    'archive.plan', 'import.apply', 'readback.verify', 'checkpoint',
})
PENDING = frozenset({'pending', 'acquired', 'uncertain', 'write_uncertain'})
RESOLUTIONS = frozenset({'readback_checked_no_retry', 'readback_verified'})


def stamp():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def safe_error(value):
    if isinstance(value, str) and (value in ERROR_CODES or re.fullmatch(r'WORKER_HTTP_[1-5][0-9]{2}', value)):
        return value
    return 'WORKER_FAILED'


def source_reason(stderr):
    # Recognize fixed validator reasons, not arbitrary stderr or exception messages.
    match = re.search(r'could not be verified \(([a-z_]+)\)', stderr or '')
    if match and match.group(1) in SOURCE_REASONS:
        return match.group(1)
    if 'Expected signed-in Beside account/mailbox unavailable' in (stderr or ''):
        return 'source_account_unavailable'
    return 'source_read_nonzero'


def _date(value):
    if not isinstance(value, str):
        return None
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return result if result.utcoffset() is not None else None
    except ValueError:
        return None


def _identifier(value):
    return value if isinstance(value, str) and re.fullmatch(r'[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}', value) else None


def _atomic(path, value):
    raw = (json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()
    temporary = path.with_name(path.name + '.tmp')
    with temporary.open('wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


class Attempt:
    def __init__(self, refresh, clock):
        self.directory = Path(refresh) / 'uia-attempts'
        self.directory.mkdir(exist_ok=True)
        self.path = self.directory / (str(uuid.uuid4()) + '.json')
        self.clock = clock
        self.started = clock()
        self.data = {
            'format': 'beside-attempt/v1', 'attempt_id': self.path.stem,
            'started_at': stamp(),
            'claim_state': 'none', 'events': [],
        }
        self.event('start')

    def event(self, operation, *, phase='reading', error=None, exception=None,
              http_status=None, server_code=None, source=None, elapsed=None, remaining=None, stage=None, exception_type=None):
        event = {'operation': operation if operation in OPERATIONS else 'failure',
                 'at': stamp(), 'elapsed_seconds': round(self.clock() - self.started, 3),
                 'phase': phase if phase in ('reading', 'checking', 'importing', 'verifying') else 'reading'}
        if error is not None:
            event['error'] = safe_error(error)
        if exception is not None or exception_type is not None:
            name = exception_type if exception_type is not None else type(exception).__name__
            event['exception'] = name if name in EXCEPTION_TYPES else 'Exception'
        if isinstance(http_status, int) and 100 <= http_status <= 599:
            event['http_status'] = http_status
        if stage in ('request', 'response_read', 'response_decode', 'response_validate', 'claim_validate', 'capture_process', 'capture_output'):
            event['stage'] = stage
        if isinstance(server_code, str) and server_code in SERVER_CODES:
            event['server_code'] = server_code
        if isinstance(source, str) and (source in SOURCE_REASONS or source in ('source_account_unavailable', 'source_read_nonzero', 'source_read_timeout')):
            event['source_reason'] = source
        for key, value in (('operation_seconds', elapsed), ('remaining_seconds', remaining)):
            if isinstance(value, (int, float)) and math.isfinite(value):
                event[key] = round(value, 3)
        # Bounded runs do not produce unbounded logs, even when page reads repeatedly fail.
        self.data['events'] = (self.data['events'] + [event])[-200:]
        _atomic(self.path, self.data)

    def claim(self, state, candidate=None):
        if state not in ('pending', 'acquired', 'refused', 'uncertain', 'write_uncertain',
                         'failed', 'complete', 'reconciled'):
            raise ValueError('invalid_attempt_state')
        if candidate is not None:
            self.data['job_id'] = _identifier(candidate.get('jobId'))
            self.data['requested_at'] = candidate.get('requestedAt') if _date(candidate.get('requestedAt')) else None
        self.data['claim_state'] = state
        _atomic(self.path, self.data)

    def failure(self, operation, code, exc, *, phase, report):
        self.event(operation, phase=phase, error=code, exception=exc,
                   http_status=report.get('worker_http_status'),
                   server_code=report.get('worker_error_code'),
                   source=report.get('source_read_failure') if operation.startswith('capture.') else None,
                   stage=report.get('worker_step'),
                   exception_type=report.get('worker_exception'),
                   elapsed=report.get('failure_operation_seconds'))
        # Create-only original failure evidence; secondary fail/report calls cannot replace it.
        path = self.path.with_suffix('.failure.json')
        with path.open('x', encoding='utf-8') as stream:
            json.dump(self.data, stream, sort_keys=True, indent=2, allow_nan=False)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())

    def held_claims(self, state, *, manual=False, include_current=False, persist=True):
        """Reconcile only claim uncertainty; never replay an uncertain import."""
        held = []
        for path in sorted(self.directory.glob('*.json')):
            if (path == self.path and not include_current) or path.name.endswith('.failure.json'):
                continue
            value = json.loads(path.read_text(encoding='utf-8'))
            if value.get('format') != 'beside-attempt/v1':
                raise ValueError('invalid_attempt_record')
            kind = value.get('claim_state')
            if kind not in PENDING:
                continue
            job = value.get('job_id')
            requested = _date(value.get('requested_at'))
            same = bool(job) and state.get('jobId') == job
            resolution = None
            if same and state.get('status') == 'complete' and _current_receipt(state, requested):
                resolution = 'server_completed'
            elif (same and state.get('status') == 'failed' and _date(state.get('requestedAt')) == requested
                  and state.get('errorCode') == 'ATTENTION_RESOLVED' and state.get('resolutionCode') in RESOLUTIONS):
                resolution = 'server_reviewed'
            elif (job and _identifier(state.get('jobId')) and state.get('jobId') != job and state.get('status') == 'queued'
                  and requested and _date(state.get('requestedAt')) and _date(state['requestedAt']) > requested):
                resolution = 'superseded_by_server_job'
            elif same and state.get('status') == 'queued' and manual and kind in ('pending', 'uncertain'):
                # Existing --scan-now is explicit operator intent. Normal timers remain held.
                # The server's atomic queued->running claim decides the single winner.
                resolution = 'operator_reconciled_queued'
            if resolution:
                if persist:
                    value['claim_state'] = 'reconciled'
                    value['reconciliation'] = {'at': stamp(), 'reason': resolution}
                    _atomic(path, value)
            else:
                held.append(path.stem)
        return held


def _current_receipt(state, requested):
    receipt = state.get('receipt')
    if not isinstance(receipt, dict) or receipt.get('readbackVerified') is not True:
        return False
    if any(not isinstance(receipt.get(key), str) or not re.fullmatch(r'[a-f0-9]{64}', receipt[key])
           for key in ('planSha256', 'beforeSha256', 'afterSha256')):
        return False
    counts = receipt.get('counts')
    keys = {'conversationsRead', 'conversationsChanged', 'archivedObservations', 'newCards',
            'updatedCards', 'heldCards', 'skippedConversations', 'confirmedBatches'}
    if (not isinstance(counts, dict) or set(counts) != keys
        or any(type(value) is not int or not 0 <= value <= 1_000_000 for value in counts.values())
        or counts['conversationsChanged'] > counts['conversationsRead']
        or counts['newCards'] + counts['updatedCards'] > counts['conversationsChanged']
        or (counts['newCards'] + counts['updatedCards'] > 0 and counts['confirmedBatches'] == 0)):
        return False
    start = _date(state.get('startedAt'))
    finish = _date(state.get('finishedAt'))
    captured = _date(receipt.get('capturedAt'))
    readback = _date(receipt.get('readbackAt'))
    return bool(requested and _date(state.get('requestedAt')) == requested and start and finish and captured and readback
                and requested <= start <= captured <= readback <= finish)
