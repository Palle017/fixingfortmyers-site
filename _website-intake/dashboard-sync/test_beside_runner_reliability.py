"""Synthetic-only runner checks. No installed settings, browser, queue, or network."""
import copy
import hashlib
import io
import json
import subprocess
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from types import SimpleNamespace
from unittest import mock
from urllib import error

import beside_attempt as A
import beside_refresh_runner as R

JOB = '11111111-1111-4111-8111-111111111111'
LATER_JOB = '22222222-2222-4222-8222-222222222222'
REQUESTED = '2026-10-22T00:00:00Z'
SENTINEL = 'SECRET_customer_text_must_not_escape'
CID = 'prv_' + 'A' * 26
COUNTS = {'conversationsRead': 1, 'conversationsChanged': 1, 'archivedObservations': 1,
          'newCards': 0, 'updatedCards': 0, 'heldCards': 0, 'skippedConversations': 0, 'confirmedBatches': 0}


def queued(job=JOB, at=REQUESTED):
    return {'status': 'queued', 'phase': 'queued', 'jobId': job, 'requestedAt': at}


def winner(state):
    return {'ok': True, 'claimed': True, 'claimToken': 'a' * 64,
            'state': {**state, 'status': 'running', 'phase': 'reading', 'startedAt': REQUESTED}}


def completed():
    return {**queued(), 'status': 'complete', 'phase': 'complete',
            'startedAt': '2026-10-22T00:00:01Z', 'finishedAt': '2026-10-22T00:00:05Z',
            'receipt': {'planSha256': 'a' * 64, 'beforeSha256': 'b' * 64, 'afterSha256': 'c' * 64,
                        'capturedAt': '2026-10-22T00:00:02Z', 'readbackAt': '2026-10-22T00:00:04Z',
                        'readbackVerified': True, 'counts': dict(COUNTS)}}


class Clock:
    def __init__(self):
        self.now = 0.0
    def __call__(self):
        return self.now
    def advance(self, seconds):
        self.now += seconds


class Fixture:
    def __init__(self, root, *, linux=False):
        self.root = Path(root)
        self.refresh = self.root / 'refresh'
        self.runs = self.refresh / 'runs'
        self.runs.mkdir(parents=True)
        self.settings = self.refresh / 'settings.json'
        self.config = self.root / 'synthetic-config.json'
        self.config.write_text(json.dumps({'url': 'https://dashboard.fixingfortmyers.com',
                                          'service_token': 'x' * 20, 'sync_token': 'y' * 20}))
        self.values = {'private_archive_root': str(self.root), 'runs_directory': str(self.runs),
                       'source_checkout': str(self.root / 'synthetic-src'),
                       'private_sync_config': str(self.config),
                       'persistent_archive': str(self.root / 'synthetic.sqlite3'), 'mailbox_id': 'synthetic'}
        if linux:
            self.values['beside_capture_backend'] = 'linux'
        self.save()
        self.clock = Clock()
        self.actions = []
        self.bodies = []
        self.capture_calls = []
        self.claim_behavior = None
        self.worker_behavior = None
        self.state = queued()
        self.baseline = {'leads': []}
        self.inventory_cost = 0.0
        self.thread_cost = 0.0
        self.thread_failure = False
        self.thread_timeout = False
        self.inventory_failures = 0
        self.http_cost = 0.0
        self.import_cost = 0.0
        self.imports = 0
        self.with_import = False
        self.plan = {'plan_sha256': 'd' * 64, 'batches': [], 'proposed': {'new': [], 'updated': []}, 'gaps': []}
        canonical = lambda value: json.dumps(value, sort_keys=True, separators=(',', ':'))
        self.archive = SimpleNamespace(canonical=canonical,
            digest=lambda value: hashlib.sha256(value if isinstance(value, bytes) else canonical(value).encode()).hexdigest(),
            validate_baseline=lambda value: None, connect=lambda path: self.database(),
            ingest=lambda *args: {'ok': True}, plan_import=lambda *args: copy.deepcopy(self.plan),
            verify_after=lambda before, after, plan: {'ok': True})
        self.queue = SimpleNamespace(completion=lambda *args: {'readbackVerified': True})

    def save(self):
        self.settings.write_text(json.dumps(self.values))

    def database(self):
        return SimpleNamespace(backup=lambda other: None, close=lambda: None,
                               execute=lambda *args: SimpleNamespace(fetchone=lambda: None))

    def opener(self):
        fixture = self
        class Response:
            status = 200
            def __init__(self, value):
                self.raw = value if isinstance(value, bytes) else json.dumps(value).encode()
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self, limit):
                return self.raw
        class Opener:
            def open(self, req, timeout):
                body = json.loads(req.data)
                action = body['action']
                fixture.actions.append(action)
                fixture.bodies.append(body)
                fixture.clock.advance(fixture.http_cost)
                if fixture.worker_behavior:
                    value = fixture.worker_behavior(action, body)
                    if value is not None:
                        return Response(value)
                if action == 'claim':
                    if fixture.claim_behavior:
                        return Response(fixture.claim_behavior())
                    fixture.state = winner(fixture.state)['state']
                    return Response({'ok': True, 'claimed': True, 'claimToken': 'a' * 64,
                                     'state': copy.deepcopy(fixture.state)})
                if action == 'fail':
                    fixture.state = {**fixture.state, 'status': 'attention' if fixture.state.get('phase') in ('importing', 'verifying') else 'failed'}
                if action == 'progress':
                    fixture.state = {**fixture.state, 'phase': body['phase']}
                if action == 'complete':
                    fixture.state = {**fixture.state, 'status': 'complete', 'phase': 'complete'}
                return Response({'ok': True, 'state': copy.deepcopy(fixture.state),
                                 'baseline': copy.deepcopy(fixture.baseline)})
        return Opener()

    def sub(self, args, *, timeout, **kwargs):
        if args[0] != 'synthetic-capture':
            if not self.with_import:
                raise AssertionError('Unexpected import')
            self.imports += 1
            self.clock.advance(self.import_cost)
            journal = Path(args[args.index('--journal') + 1])
            journal.write_text('{}')
            self.baseline = {'leads': [{'id': 'beside:chat:' + CID}]}
            return SimpleNamespace(returncode=0, stderr='')
        mode, output = args[1], Path(args[2])
        self.capture_calls.append((mode, timeout, self.clock()))
        cost = self.inventory_cost if mode == 'inventory' else self.thread_cost
        self.clock.advance(min(cost, timeout))
        if cost > timeout or (mode == 'thread' and self.thread_timeout):
            raise subprocess.TimeoutExpired(args, timeout, stderr=SENTINEL)
        if mode == 'thread' and self.thread_failure:
            return SimpleNamespace(returncode=1, stderr=SENTINEL)
        if mode == 'inventory' and self.inventory_failures:
            self.inventory_failures -= 1
            return SimpleNamespace(returncode=1, stderr='Visible inventory not rendered')
        value = {'records': [{'conversation_id': CID, 'label': 'Synthetic activity'}]} if mode == 'inventory' else {'conversation_id': CID}
        output.write_text(json.dumps(value))
        return SimpleNamespace(returncode=0, stderr='')

    def run(self, budget=600, manual=False):
        original_import = R.importlib.import_module
        def dependency(name, *args):
            if name == 'beside_archive':
                return self.archive
            if name == 'refresh_worker':
                return self.queue
            return original_import(name, *args)
        with ExitStack() as stack:
            stack.enter_context(mock.patch.object(R.importlib, 'import_module', side_effect=dependency))
            stack.enter_context(mock.patch.object(R.request, 'build_opener', return_value=self.opener()))
            stack.enter_context(mock.patch.object(R, 'capture_command', side_effect=lambda s, m, o, p: ['synthetic-capture', m, str(o)]))
            stack.enter_context(mock.patch.object(R.subprocess, 'run', side_effect=self.sub))
            stack.enter_context(mock.patch.object(R.time, 'monotonic', side_effect=self.clock))
            stack.enter_context(mock.patch.object(R.time, 'sleep', side_effect=self.clock.advance))
            stack.enter_context(mock.patch.object(R, 'conversation', side_effect=lambda cap, digest, **kw: {
                'id': CID, 'received_at': REQUESTED, 'name': 'Synthetic', 'phone': '', 'email': '', 'vehicle': ''}))
            stack.enter_context(mock.patch.object(R, 'generic_review', return_value={'classification': 'repair'}))
            stack.enter_context(mock.patch.object(R.beside_intake, 'post_new', return_value={'enabled': False}))
            return R.run(settings_path=self.settings, budget_seconds=budget, manual=manual)

    def attempts(self):
        return [json.loads(path.read_text()) for path in (self.refresh / 'uia-attempts').glob('*.json')
                if not path.name.endswith('.failure.json')]


class BudgetTests(unittest.TestCase):
    def test_minimum_and_defaults_are_explicit(self):
        self.assertEqual(R.minimum_claim_budget({}), 185)
        self.assertEqual(R.minimum_claim_budget({'beside_capture_backend': 'linux'}), 315)
        self.assertEqual(R.run.__kwdefaults__['budget_seconds'], 240)
        self.assertEqual(R.capture_timeout({'beside_capture_backend': 'linux'}, 100, 63), 34)
        for value in (float('nan'), float('inf'), 2, -1):
            with self.subTest(value=value), self.assertRaises(R.ScanError):
                R.capture_ceiling({'beside_capture_backend': 'linux', 'beside_linux_capture_timeout_seconds': value})

    def test_initial_insufficient_budget_never_claims(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            out = fixture.run(budget=60)
            self.assertTrue(out['readiness_deferred'])
            self.assertEqual(out['deferred_reason'], 'INSUFFICIENT_CAPTURE_BUDGET')
            self.assertTrue(out['worker_ready'])
            self.assertFalse(out['fresh_scan_performed'])
            self.assertNotIn('claim', fixture.actions)
            self.assertFalse(list(fixture.runs.iterdir()))

    def test_readiness_and_network_erosion_checked_again_before_claim(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            fixture.inventory_cost = 10
            fixture.http_cost = 6
            out = fixture.run(budget=205)
            self.assertEqual(out['minimum_remaining_seconds'], 185)
            self.assertEqual(out['remaining_seconds'], 183)
            self.assertEqual(fixture.actions, ['heartbeat', 'baseline'])
            self.assertFalse(out['fresh_scan_performed'])

    def test_linux_captures_preserve_first_thread_and_finalization(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root, linux=True)
            fixture.inventory_cost = 90
            fixture.thread_cost = 90
            out = fixture.run(budget=405)
            self.assertTrue(out['ok'], out)
            self.assertEqual([call[0] for call in fixture.capture_calls], ['inventory', 'inventory', 'thread'])
            self.assertEqual(fixture.capture_calls[1][1], 90)
            self.assertEqual(fixture.capture_calls[2][1], 90)
            self.assertGreaterEqual(405 - fixture.clock(), 123)

    def test_bounded_final_http_and_apply_sequence_fits_preserved_reserve(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root, linux=True)
            fixture.inventory_cost = fixture.thread_cost = 90
            fixture.http_cost = 12
            fixture.import_cost = 30
            fixture.with_import = True
            fixture.plan['batches'] = [{'synthetic': True}]
            fixture.plan['proposed']['new'] = [{'id': 'beside:chat:' + CID}]
            # Readiness90+heartbeat12+baseline12 leave the exact315 preclaim minimum.
            out = fixture.run(budget=429)
            self.assertTrue(out['ok'], out)
            self.assertEqual(fixture.imports, 1)
            self.assertEqual(429 - fixture.clock(), 9)

    def test_known_no_post_budget_erosion_does_not_create_an_automatic_hold(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            original = A.Attempt.claim
            def slow_pending(attempt, state, candidate=None):
                original(attempt, state, candidate)
                if state == 'pending':
                    fixture.clock.advance(60)
            with mock.patch.object(A.Attempt, 'claim', slow_pending):
                out = fixture.run(budget=240)
            self.assertEqual(out['deferred_reason'], 'INSUFFICIENT_CAPTURE_BUDGET')
            self.assertNotIn('claim', fixture.actions)
            self.assertEqual(fixture.attempts()[0]['claim_state'], 'refused')
            out = fixture.run()
            self.assertTrue(out['ok'], out)
            self.assertEqual(fixture.actions.count('claim'), 1)

    def test_slow_claim_event_defers_at_post_boundary_without_releasing_old_hold(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            old = A.Attempt(fixture.refresh, fixture.clock)
            old.claim('uncertain', queued())
            original = A.Attempt.event
            def slow_claim_event(attempt, operation, **extra):
                original(attempt, operation, **extra)
                if operation == 'worker.claim' and 'elapsed' not in extra:
                    fixture.clock.advance(60)
            with mock.patch.object(A.Attempt, 'event', slow_claim_event):
                out = fixture.run(budget=240, manual=True)
            self.assertTrue(out['ok'], out)
            self.assertEqual(out['deferred_reason'], 'INSUFFICIENT_CAPTURE_BUDGET')
            self.assertNotIn('claim', fixture.actions)
            self.assertNotIn('fail', fixture.actions)
            self.assertEqual(fixture.imports, 0)
            self.assertEqual(json.loads(old.path.read_text())['claim_state'], 'uncertain')
            other = [row for row in fixture.attempts() if row['attempt_id'] != old.path.stem]
            self.assertEqual(other[0]['claim_state'], 'refused')
            out = fixture.run()
            self.assertEqual(out['deferred_reason'], 'CLAIM_REVIEW_REQUIRED')
            self.assertNotIn('claim', fixture.actions)

    def test_read_retry_cannot_spend_runner_finalization_reserve(self):
        body = {'action': 'baseline'}
        req = R.request.Request('https://dashboard.fixingfortmyers.com/api/beside-refresh/worker',
                                data=json.dumps(body).encode())
        remaining = [132]
        opened = []
        def lost(*args, **extra):
            opened.append(extra['timeout'])
            remaining[0] -= 12
            raise TimeoutError(SENTINEL)
        with self.assertRaisesRegex(R.ScanError, 'WORKER_UNREACHABLE'):
            R.worker_response(mock.Mock(open=lost), req, body, lambda: remaining[0],
                              {}, 'checking', finish_reserve=R.FINALIZATION_RESERVE_SECONDS)
        self.assertEqual(len(opened), 1)
        self.assertEqual(remaining[0], R.FINALIZATION_RESERVE_SECONDS)

    def test_inventory_retry_pauses_about_three_seconds(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root, linux=True)
            fixture.inventory_failures = 1
            out = fixture.run(budget=600)
            self.assertTrue(out['ok'], out)
            self.assertEqual([call[0] for call in fixture.capture_calls[:2]], ['inventory', 'inventory'])
            gap = fixture.capture_calls[1][2] - fixture.capture_calls[0][2]
            self.assertGreaterEqual(gap, 3)
            self.assertLess(gap, 4)

    def test_linux_internal_stability_retry_is_not_multiplied(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root, linux=True)
            fixture.thread_failure = True
            out = fixture.run()
            self.assertEqual(out['error'], 'CAPTURE_INCOMPLETE')
            self.assertEqual(sum(mode == 'thread' for mode, *_ in fixture.capture_calls), 1)

    def test_timeout_retains_reserve_without_stderr(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root, linux=True)
            fixture.thread_cost = 100
            out = fixture.run(budget=315)
            self.assertFalse(out['ok'])
            self.assertEqual(out['source_read_failure'], 'source_read_timeout')
            self.assertGreaterEqual(315 - fixture.clock(), 120)
            self.assertNotIn(SENTINEL, json.dumps(out))


class ClaimTests(unittest.TestCase):
    def test_valid_refusal_and_winner_are_distinct(self):
        self.assertIsNone(R.validate_claim({'claimed': False, 'state': queued()}, queued()))
        self.assertTrue(R.validate_claim(winner(queued()), queued())['claimed'])

    def test_missing_malformed_and_mismatched_grants_never_authorize(self):
        invalid = [None, [], {}, {'state': queued()}, {'claimed': 1, 'state': queued()},
                   {'claimed': False, 'state': queued(), 'claimToken': 'a' * 64},
                   {'claimed': True, 'state': queued()}, {**winner(queued()), 'claimToken': SENTINEL},
                   {**winner(queued()), 'state': {**winner(queued())['state'], 'jobId': LATER_JOB}},
                   {**winner(queued()), 'state': {**winner(queued())['state'], 'requestedAt': '2026-10-22T00:01:00Z'}},
                   {**winner(queued()), 'state': {**winner(queued())['state'], 'phase': 'importing'}},
                   {**winner(queued()), 'state': {**winner(queued())['state'], 'startedAt': None}},
                   {**winner(queued()), 'state': {**winner(queued())['state'], 'startedAt': '2026-10-21T00:00:00Z'}}]
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(R.ScanError):
                R.validate_claim(value, queued())

    def test_refusal_does_not_capture_or_fail(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            fixture.claim_behavior = lambda: {'ok': True, 'claimed': False, 'state': copy.deepcopy(fixture.state)}
            out = fixture.run()
            self.assertTrue(out['claim_not_acquired'])
            self.assertEqual(fixture.actions.count('claim'), 1)
            self.assertNotIn('fail', fixture.actions)
            self.assertEqual(len(fixture.capture_calls), 1)
            self.assertEqual(fixture.attempts()[0]['claim_state'], 'refused')

    def test_lost_reply_is_journaled_before_post_and_survives_restart(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            def lost():
                self.assertEqual(fixture.attempts()[0]['claim_state'], 'pending')
                fixture.clock.advance(12)
                raise TimeoutError(SENTINEL)
            fixture.claim_behavior = lost
            out = fixture.run()
            self.assertEqual(out['error'], 'WORKER_UNREACHABLE')
            self.assertEqual(out['worker_action'], 'claim')
            self.assertEqual(out['worker_exception'], 'TimeoutError')
            self.assertEqual(out['claim_reconciliation'], 'readback_only')
            self.assertEqual(fixture.actions.count('claim'), 1)
            self.assertFalse(list(fixture.runs.iterdir()))
            self.assertEqual(fixture.attempts()[0]['claim_state'], 'uncertain')
            failure = next((fixture.refresh / 'uia-attempts').glob('*.failure.json'))
            evidence = json.loads(failure.read_text())['events'][-1]
            self.assertEqual(evidence['operation'], 'worker.claim')
            self.assertEqual(evidence['exception'], 'TimeoutError')
            self.assertEqual(evidence['operation_seconds'], 12)
            fixture.claim_behavior = None
            out = fixture.run()
            self.assertEqual(out['deferred_reason'], 'CLAIM_REVIEW_REQUIRED')
            self.assertEqual(fixture.actions.count('claim'), 1)
            self.assertFalse(out['fresh_scan_performed'])

    def test_malformed_reply_is_uncertain_without_import_or_second_claim(self):
        for reply in ([SENTINEL], {'ok': True}, {**winner(queued()), 'state': winner(queued(LATER_JOB))['state']}):
            with self.subTest(reply=reply), tempfile.TemporaryDirectory() as root:
                fixture = Fixture(root)
                fixture.claim_behavior = lambda: reply
                out = fixture.run()
                self.assertEqual(out['error'], 'WORKER_RESPONSE_INVALID')
                self.assertEqual(fixture.actions.count('claim'), 1)
                self.assertNotIn('fail', fixture.actions)
                self.assertEqual(fixture.imports, 0)
                self.assertEqual(len(fixture.capture_calls), 1)
                self.assertEqual(fixture.attempts()[0]['claim_state'], 'uncertain')

    def test_manual_low_budget_does_not_release_previous_automatic_hold(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            old = A.Attempt(fixture.refresh, fixture.clock)
            old.claim('uncertain', queued())
            out = fixture.run(budget=60, manual=True)
            self.assertEqual(out['deferred_reason'], 'INSUFFICIENT_CAPTURE_BUDGET')
            self.assertEqual(json.loads(old.path.read_text())['claim_state'], 'uncertain')
            out = fixture.run()
            self.assertEqual(out['deferred_reason'], 'CLAIM_REVIEW_REQUIRED')
            self.assertNotIn('claim', fixture.actions)

    def test_manual_known_no_post_erosion_preserves_original_uncertainty(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            old = A.Attempt(fixture.refresh, fixture.clock)
            old.claim('uncertain', queued())
            original = A.Attempt.claim
            def slow_pending(attempt, state, candidate=None):
                original(attempt, state, candidate)
                if state == 'pending':
                    fixture.clock.advance(60)
            with mock.patch.object(A.Attempt, 'claim', slow_pending):
                out = fixture.run(budget=240, manual=True)
            self.assertEqual(out['deferred_reason'], 'INSUFFICIENT_CAPTURE_BUDGET')
            self.assertEqual(json.loads(old.path.read_text())['claim_state'], 'uncertain')
            self.assertNotIn('claim', fixture.actions)
            out = fixture.run()
            self.assertEqual(out['deferred_reason'], 'CLAIM_REVIEW_REQUIRED')
            self.assertNotIn('claim', fixture.actions)

    def test_malformed_queued_baseline_never_submits_claim(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            fixture.state = {'status': 'queued', 'phase': 'queued', 'jobId': SENTINEL}
            out = fixture.run()
            self.assertEqual(out['error'], 'WORKER_RESPONSE_INVALID')
            self.assertNotIn('claim', fixture.actions)
            self.assertFalse(list(fixture.runs.iterdir()))
            self.assertNotIn(SENTINEL, json.dumps(out))

    def test_manual_reconciliation_uses_one_cas_and_delayed_old_claim_can_win(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            old = A.Attempt(fixture.refresh, fixture.clock)
            old.claim('pending', queued())
            accepted = []
            def old_wins():
                # The old delayed POST wins the atomic queued->running transition just before ours.
                fixture.state = winner(fixture.state)['state']
                accepted.append('old')
                return {'ok': True, 'claimed': False, 'state': copy.deepcopy(fixture.state)}
            fixture.claim_behavior = old_wins
            out = fixture.run(manual=True)
            self.assertEqual(accepted, ['old'])
            self.assertTrue(out['claim_not_acquired'])
            self.assertEqual(fixture.actions.count('claim'), 1)
            self.assertEqual(fixture.imports, 0)
            self.assertEqual(len(fixture.capture_calls), 1)
            self.assertEqual(json.loads(old.path.read_text())['claim_state'], 'reconciled')

    def test_uncertain_completion_after_import_cannot_be_reimported(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            fixture.with_import = True
            fixture.plan['batches'] = [{'synthetic': True}]
            fixture.plan['proposed']['new'] = [{'id': 'beside:chat:' + CID}]
            def lost_complete(action, body):
                if action == 'complete':
                    raise TimeoutError(SENTINEL)
            fixture.worker_behavior = lost_complete
            out = fixture.run()
            self.assertFalse(out['ok'])
            self.assertTrue(out['requires_review'])
            self.assertEqual(fixture.imports, 1)
            self.assertEqual(fixture.attempts()[0]['claim_state'], 'write_uncertain')
            # Even an unexpected same-job queued readback cannot release uncertain imports.
            fixture.state = queued()
            fixture.worker_behavior = None
            out = fixture.run(manual=True)
            self.assertEqual(out['deferred_reason'], 'CLAIM_REVIEW_REQUIRED')
            self.assertEqual(fixture.imports, 1)
            self.assertEqual(fixture.actions.count('claim'), 1)

    def test_valid_winner_can_import_once_and_subsequent_poll_does_not_duplicate(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            fixture.with_import = True
            fixture.plan['batches'] = [{'synthetic': True}]
            fixture.plan['proposed']['new'] = [{'id': 'beside:chat:' + CID}]
            out = fixture.run()
            self.assertTrue(out['ok'], out)
            self.assertEqual(fixture.imports, 1)
            self.assertEqual(fixture.attempts()[0]['claim_state'], 'complete')
            out = fixture.run()
            self.assertTrue(out['ok'], out)
            self.assertFalse(out['fresh_scan_performed'])
            self.assertEqual(fixture.imports, 1)
            self.assertEqual(fixture.actions.count('claim'), 1)


class ReconciliationTests(unittest.TestCase):
    def fixture(self, root, kind='uncertain'):
        clock = Clock()
        old = A.Attempt(root, clock)
        old.claim(kind, queued())
        new = A.Attempt(root, clock)
        return old, new

    def test_only_current_same_job_valid_receipt_closes_uncertainty(self):
        with tempfile.TemporaryDirectory() as root:
            old, new = self.fixture(root)
            self.assertEqual(new.held_claims(completed()), [])
            saved = json.loads(old.path.read_text())
            self.assertEqual(saved['claim_state'], 'reconciled')
            self.assertEqual(saved['reconciliation']['reason'], 'server_completed')
            self.assertEqual(saved['job_id'], JOB)

    def test_heartbeat_unrelated_success_and_invalid_receipt_do_not_clear(self):
        values = [
            {**queued(), 'worker': {'online': True}, 'lastSuccessAt': '2026-10-23T00:00:00Z'},
            {**queued(), 'status': 'complete', 'lastSuccessReceipt': completed()['receipt']},
            {**completed(), 'jobId': LATER_JOB},
            {**completed(), 'requestedAt': '2026-10-21T00:00:00Z'},
            queued(SENTINEL, '2026-10-22T00:01:00Z'),
            {**completed(), 'receipt': {**completed()['receipt'], 'counts': {}}},
            {**completed(), 'receipt': {**completed()['receipt'], 'capturedAt': '2026-10-21T00:00:00Z'}},
            {**completed(), 'receipt': {**completed()['receipt'], 'readbackVerified': False}},
            {**queued(), 'status': 'attention', 'errorCode': 'ATTENTION_RESOLVED', 'resolutionCode': 'unknown'},
            {**queued(), 'status': 'attention', 'errorCode': 'ATTENTION_RESOLVED', 'resolutionCode': 'readback_verified'},
            {**queued(), 'status': 'running', 'errorCode': 'ATTENTION_RESOLVED', 'resolutionCode': 'readback_verified'},
            {**queued(), 'status': 'failed', 'requestedAt': '2026-10-21T00:00:00Z', 'errorCode': 'ATTENTION_RESOLVED', 'resolutionCode': 'readback_verified'},
        ]
        for value in values:
            with self.subTest(value=value), tempfile.TemporaryDirectory() as root:
                old, new = self.fixture(root)
                self.assertEqual(new.held_claims(value), [old.path.stem])
                self.assertEqual(json.loads(old.path.read_text())['claim_state'], 'uncertain')

    def test_explicit_review_or_later_server_queued_job_closes(self):
        values = [
            {**queued(), 'status': 'failed', 'errorCode': 'ATTENTION_RESOLVED', 'resolutionCode': 'readback_checked_no_retry'},
            {**queued(), 'status': 'failed', 'errorCode': 'ATTENTION_RESOLVED', 'resolutionCode': 'readback_verified'},
            queued(LATER_JOB, '2026-10-22T00:01:00Z'),
        ]
        for value in values:
            with self.subTest(value=value), tempfile.TemporaryDirectory() as root:
                old, new = self.fixture(root)
                self.assertEqual(new.held_claims(value), [])
                self.assertTrue(old.path.exists())

    def test_automatic_same_job_queued_hold_but_manual_claim_uncertainty_can_clear(self):
        with tempfile.TemporaryDirectory() as root:
            old, new = self.fixture(root)
            self.assertEqual(new.held_claims(queued()), [old.path.stem])
            self.assertEqual(new.held_claims(queued(), manual=True), [])

    def test_manual_does_not_clear_uncertain_import(self):
        with tempfile.TemporaryDirectory() as root:
            old, new = self.fixture(root, 'write_uncertain')
            self.assertEqual(new.held_claims(queued(), manual=True), [old.path.stem])


class DiagnosticTests(unittest.TestCase):
    def test_server_codes_and_source_reasons_are_fixed_not_regex_only(self):
        self.assertIsNone(R.server_code({'code': SENTINEL}))
        self.assertIsNone(R.server_code({'code': 'secret123'}))
        self.assertEqual(A.source_reason(SENTINEL), 'source_read_nonzero')
        self.assertEqual(A.source_reason('Selected conversation identity or stable content could not be verified (conversation_pane_not_stable). ' + SENTINEL),
                         'conversation_pane_not_stable')
        self.assertEqual(R.failure_code('WORKER_HTTP_503'), 'WORKER_FAILED')
        self.assertEqual(R.failure_code('WORKER_UNREACHABLE'), 'WORKER_FAILED')
        self.assertEqual(R.failure_code('WORKER_RESPONSE_INVALID'), 'WORKER_FAILED')
        self.assertEqual(R.failure_code('CAPTURE_INCOMPLETE'), 'CAPTURE_INCOMPLETE')

    def test_original_http_error_survives_failed_fail_request(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            def errors(action, body):
                if action == 'baseline' and fixture.state['status'] == 'running':
                    raise error.HTTPError('https://synthetic.invalid/' + SENTINEL, 503, SENTINEL, {},
                                          io.BytesIO(json.dumps({'code': SENTINEL, 'message': SENTINEL}).encode()))
                if action == 'fail':
                    self.assertEqual(body['errorCode'], 'WORKER_FAILED')
                    raise error.HTTPError('https://synthetic.invalid', 401, SENTINEL, {},
                                          io.BytesIO(b'{"code":"INVALID_ACTION"}'))
            fixture.worker_behavior = errors
            out = fixture.run()
            self.assertEqual(out['worker_action'], 'baseline')
            self.assertEqual(out['worker_http_status'], 503)
            self.assertEqual(out['worker_exception'], 'HTTPError')
            self.assertNotIn('worker_error_code', out)
            self.assertTrue(out['queue_failure_unconfirmed'])
            failure = next((fixture.refresh / 'uia-attempts').glob('*.failure.json'))
            primary = json.loads(failure.read_text())['events'][-1]
            self.assertEqual((primary['operation'], primary['http_status']), ('worker.baseline', 503))
            self.assertNotIn(SENTINEL, json.dumps(out))
            for path in (fixture.refresh / 'uia-attempts').glob('*.json'):
                self.assertNotIn(SENTINEL, path.read_text())
                self.assertNotIn('https://', path.read_text())
                self.assertNotIn('a' * 64, path.read_text())

    def test_source_stderr_and_exception_message_never_enter_attempt_evidence(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root, linux=True)
            fixture.thread_failure = True
            out = fixture.run()
            self.assertEqual(out['source_read_failure'], 'source_read_nonzero')
            self.assertNotIn(SENTINEL, json.dumps(out))
            for path in (fixture.refresh / 'uia-attempts').glob('*.json'):
                self.assertNotIn(SENTINEL, path.read_text())


if __name__ == '__main__':
    unittest.main()
