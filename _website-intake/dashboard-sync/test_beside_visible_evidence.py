"""Anonymized visible-window selection and suppressed-review regressions."""
import copy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import beside_refresh_runner as R
from test_beside_runner_reliability import Fixture

NOW = '2026-10-23T12:00:00Z'


def row(number, label=None):
    return {'conversation_id': 'prv_' + str(number).zfill(26),
            'label': label or 'Synthetic item ' + str(number)}


def choose(inventory, checkpoint, maximum, history=None):
    return R.fair_visible_selection(inventory, checkpoint, maximum, history or {})


def save_run(root, observed, records, attempts=None, number=0):
    date = datetime.fromisoformat(observed.replace('Z', '+00:00')) + timedelta(microseconds=number)
    folder = Path(root) / ('queued-uia-' + date.strftime('%Y%m%dT%H%M%S%fZ'))
    folder.mkdir()
    (folder / 'inventory.json').write_text(json.dumps({'captured_at': observed, 'records': records}))
    if attempts is not None:
        (folder / 'selection-attempts.json').write_text(json.dumps({
            'format': 'beside-selection-attempts/v1', 'attempts': attempts}))
    return folder


class VisibleFairnessTests(unittest.TestCase):
    def test_oldest_due_visible_sample_gets_slot_with_25_changed_previews(self):
        changed = [row(i) for i in range(25)]
        old = row(90, 'Synthetic older 3d Same preview')
        checkpoint = {'records': {old['conversation_id']: {**old, 'checked_at': '2026-10-20T12:00:00Z'}}}
        inventory = {'captured_at': NOW, 'records': changed + [old]}
        selected, _ = choose(inventory, checkpoint, 25)
        self.assertEqual(len(selected), 25)
        self.assertEqual(selected[0]['conversation_id'], old['conversation_id'])

    def test_persistent_front_failure_rotates_next_job_to_older_valid_visible_row(self):
        bad, valid = row(80, 'Synthetic failed 3d Same'), row(90, 'Synthetic valid 2d Same')
        checkpoint = {'records': {
            bad['conversation_id']: {**bad, 'checked_at': '2026-10-19T12:00:00Z'},
            valid['conversation_id']: {**valid, 'checked_at': '2026-10-20T12:00:00Z'},
        }}
        history = {}
        inspected = []
        for job in range(2):
            changed = [row(i + job * 25) for i in range(25)]
            inventory = {'captured_at': NOW, 'records': changed + [bad, valid]}
            selected, _ = choose(inventory, checkpoint, 25, history)
            def read(cid):
                history.setdefault(cid, {})['attempted_at'] = NOW
                if cid != valid['conversation_id']:
                    raise R.ScanError('BROWSER_UNAVAILABLE')
                inspected.append(cid)
                return {'conversation_id': cid}
            R.read_threads(selected, read, lambda: 600, lambda: None)
        self.assertIn(valid['conversation_id'], inspected)
        self.assertEqual(checkpoint['records'][bad['conversation_id']]['checked_at'], '2026-10-19T12:00:00Z')

    def test_previously_unchecked_visible_row_does_not_lose_to_continuous_new_arrivals(self):
        old = row(90)
        history = {old['conversation_id']: {'first_seen_at': '2026-10-20T12:00:00Z'}}
        selected, _ = choose({'captured_at': NOW, 'records': [row(i) for i in range(25)] + [old]}, {}, 25, history)
        self.assertEqual(selected[0], old)

    def test_unchanged_sampling_capture_does_not_reduce_unread_changed_preview_count(self):
        changed = [row(i) for i in range(25)]
        old = row(90, 'Synthetic stable preview')
        checkpoint = {'records': {old['conversation_id']: {**old, 'checked_at': '2026-10-20T12:00:00Z'}}}
        inventory = {'captured_at': NOW, 'records': changed + [old]}
        self.assertEqual(R.uninspected_preview_count(inventory, checkpoint,
                         [{'conversation_id': old['conversation_id']}]), 25)

    def test_unknown_or_malformed_history_stays_bounded_and_never_changes_checkpoint(self):
        checkpoint = {'records': {}}
        before = copy.deepcopy(checkpoint)
        records = [row(i) for i in range(30)]
        for history in ({}, None, {'ignored': 'invalid'}, {records[0]['conversation_id']: {'attempted_at': 'not a date'}}):
            selected, _ = choose({'records': records}, checkpoint, 25, history)
            self.assertEqual(len(selected), 25)
            self.assertEqual(len({item['conversation_id'] for item in selected}), 25)
            self.assertEqual(checkpoint, before)

    def test_selection_does_not_change_per_thread_failure_policy_or_global_errors(self):
        with self.assertRaises(RuntimeError):
            R.read_threads([row(1)], lambda cid: (_ for _ in ()).throw(RuntimeError('synthetic')), lambda: 600, lambda: None)
        captured, failures = R.read_threads([row(1), row(2)],
            lambda cid: (_ for _ in ()).throw(R.ScanError('SOURCE_IDENTITY_MISMATCH')), lambda: 600, lambda: None)
        self.assertEqual(captured, [])
        self.assertEqual(failures, [row(1)['conversation_id']])


class SelectionHistoryTests(unittest.TestCase):
    def test_failed_attempt_rotates_using_only_approved_per_run_artifacts(self):
        bad, valid = row(1), row(2)
        with tempfile.TemporaryDirectory() as root:
            folder = save_run(root, '2026-10-22T12:00:00Z', [bad, valid], [{
                'conversation_id': bad['conversation_id'], 'attempted_at': '2026-10-23T11:00:00Z',
                'outcome': 'source_read_failed'}])
            (folder / 'settings-before.json').write_text('DO NOT READ')
            (folder / 'lease.json').write_text('DO NOT READ')
            original = R.load
            def safe_load(path):
                self.assertIn(Path(path).name, ('inventory.json', 'selection-attempts.json'))
                return original(path)
            with mock.patch.object(R, 'load', side_effect=safe_load):
                history, info = R.selection_history(root, NOW)
            selected, _ = choose({'captured_at': NOW, 'records': [bad, valid]}, {}, 1, history)
            self.assertEqual(selected[0], valid)
            self.assertEqual(info['ignored_artifacts'], 0)

    def test_two_new_jobs_persist_failure_rotation_and_never_promote_failed_checkpoint(self):
        bad, valid = row(80, 'Synthetic failed 3d Same'), row(90, 'Synthetic valid 2d Same')
        checkpoint = {'records': {
            bad['conversation_id']: {**bad, 'checked_at': '2026-10-19T12:00:00Z'},
            valid['conversation_id']: {**valid, 'checked_at': '2026-10-20T12:00:00Z'}}}
        before = copy.deepcopy(checkpoint)
        with tempfile.TemporaryDirectory() as root:
            first_records = [row(i) for i in range(25)] + [bad, valid]
            first = save_run(root, '2026-10-23T11:00:00Z', first_records)
            inventory = {'captured_at': '2026-10-23T11:00:00Z', 'records': first_records}
            selected, _ = choose(inventory, checkpoint, 25)
            self.assertEqual(selected[0], bad)
            evidence = {'format': 'beside-selection-attempts/v1', 'attempts': []}
            def persist(value):
                (first / 'selection-attempts.json').write_text(json.dumps(value))
            def failed(cid):
                raise R.ScanError('BROWSER_UNAVAILABLE')
            with mock.patch.object(R, 'stamp', return_value=NOW):
                captures, failures = R.read_threads(selected,
                    lambda cid: R.read_with_selection_evidence(cid, failed, evidence, persist), lambda: 600, lambda: None)
            self.assertEqual(captures, [])
            self.assertEqual(failures, [bad['conversation_id']])
            second_records = [row(i + 100) for i in range(25)] + [bad, valid]
            second = save_run(root, NOW, second_records)
            history, _ = R.selection_history(root, NOW, exclude=second)
            selected, _ = choose({'captured_at': NOW, 'records': second_records}, checkpoint, 25, history)
            self.assertEqual(selected[0], valid)
            self.assertEqual(checkpoint, before)
            saved = json.loads((first / 'selection-attempts.json').read_text())
            self.assertEqual(saved['attempts'][0]['outcome'], 'source_read_failed')

    def test_inventory_observation_or_validated_run_utc_supplies_first_seen(self):
        with tempfile.TemporaryDirectory() as root:
            item = row(1, 'Synthetic customer activity January 1, 1900')
            folder = save_run(root, '2026-10-22T12:00:00Z', [item])
            (folder / 'inventory.json').write_text(json.dumps({'records': [item]}))
            history, _ = R.selection_history(root, NOW)
            self.assertEqual(R.selection_time(history[item['conversation_id']]['first_seen_at']),
                             R.selection_time('2026-10-22T12:00:00Z'))

    def test_bounded_history_ignores_malformed_or_future_attempts_without_success(self):
        with tempfile.TemporaryDirectory() as root:
            item = row(1)
            save_run(root, '2026-10-22T12:00:00Z', [item], [
                {'conversation_id': item['conversation_id'], 'attempted_at': '2026-10-24T00:00:00Z', 'outcome': 'rendered_capture_saved'}])
            malformed = Path(root) / 'queued-uia-20261022T130000000000Z'
            malformed.mkdir()
            (malformed / 'inventory.json').write_text('not-json')
            history, info = R.selection_history(root, NOW)
            self.assertEqual(info['ignored_artifacts'], 2)
            self.assertNotIn('attempted_at', history[item['conversation_id']])
            self.assertNotIn('checked_at', history[item['conversation_id']])

    def test_only_32_recent_run_inventories_are_read_and_current_run_is_excluded(self):
        with tempfile.TemporaryDirectory() as root:
            for index in range(35):
                date = (datetime(2026, 10, 21, tzinfo=timezone.utc) + timedelta(minutes=index)).isoformat()
                save_run(root, date, [row(index)])
            excluded = save_run(root, '2026-10-23T11:00:00Z', [row(99)])
            history, info = R.selection_history(root, NOW, exclude=excluded)
            self.assertEqual(info['runs_inspected'], 32)
            self.assertNotIn(row(0)['conversation_id'], history)
            self.assertNotIn(row(99)['conversation_id'], history)
            self.assertIn(row(34)['conversation_id'], history)

    def test_request_outcome_is_persisted_before_read_and_failure_never_changes_checkpoint(self):
        evidence = {'format': 'beside-selection-attempts/v1', 'attempts': []}
        snapshots = []
        checkpoint = {'records': {}}
        def persist(value):
            snapshots.append(copy.deepcopy(value))
        def fail(cid):
            self.assertEqual(snapshots[-1]['attempts'][0]['outcome'], 'started')
            raise R.ScanError('BROWSER_UNAVAILABLE')
        with self.assertRaises(R.ScanError), mock.patch.object(R, 'stamp', return_value=NOW):
            R.read_with_selection_evidence(row(1)['conversation_id'], fail, evidence, persist)
        self.assertEqual(snapshots[-1]['attempts'][0]['outcome'], 'source_read_failed')
        self.assertEqual(checkpoint, {'records': {}})


class SuppressedReviewTests(unittest.TestCase):
    def item(self, *, direction='unknown', at=NOW, body='Can you diagnose this engine problem?'):
        return {'id': row(1)['conversation_id'], 'name': 'Synthetic', 'received_at': NOW,
                'concern': body, 'messages': [{'body': body, 'at': at, 'direction': direction}]}

    def test_changed_inbound_context_flags_review_and_preserves_all_prior_nonrepair_classes(self):
        item = self.item(direction='inbound')
        old = {'concern': 'Earlier synthetic context', 'stage': 'junk', 'notes': 'Owner decision', 'received_at': NOW}
        before = copy.deepcopy(old)
        for prior in ('spam', 'operational', 'personal'):
            decision = R.source_review({'conversation_id': item['id']}, NOW, item, old, prior, 'a' * 64)
            flag = R.suppressed_review_needed(item, NOW, prior, 'a' * 64, since='2026-10-22T00:00:00Z')
            self.assertTrue(flag['requires_review'])
            self.assertEqual(flag['reason'], 'changed_inbound_repair_evidence')
            self.assertEqual(flag['classification_preserved'], prior)
            self.assertEqual(decision['classification'], prior)
            self.assertFalse(decision['include_in_dashboard'])
            self.assertEqual(old, before)
            self.assertNotIn('engine', json.dumps(flag))

    def test_saved_context_keeps_old_recap_and_latest_call_dates_qualified(self):
        from test_beside_evidence import OLD_AND_RECENT, OBSERVED
        item = self.item(body=OLD_AND_RECENT)
        item.pop('messages')
        old = {'concern': 'Earlier synthetic diagnosis context', 'received_at': NOW,
               'source_updated_at': '2026-10-01T00:00:00Z'}
        decision = R.source_review({'conversation_id': item['id']}, OBSERVED, item, old, 'repair')
        self.assertIn('2026-06-07', decision['summary'])
        self.assertIn('2026-10-22', decision['summary'])
        self.assertIn('not proof of a new request', decision['summary'])
        self.assertIn('Earlier synthetic diagnosis context', decision['summary'])
        self.assertNotIn('Latest capture (2026-10-23)', decision['summary'])

    def test_prior_manual_junk_unchanged_stays_archived_and_has_no_new_review_flag(self):
        item = self.item(direction='inbound')
        old = {'concern': 'Earlier synthetic context', 'stage': 'junk', 'notes': 'Owner decision', 'received_at': NOW}
        fingerprint = R.capture_fields_fingerprint(item)
        decision = R.source_review({'conversation_id': item['id']}, NOW, item, old, 'spam', fingerprint)
        self.assertEqual(decision['classification'], 'spam')
        self.assertFalse(decision['include_in_dashboard'])
        self.assertIsNone(R.suppressed_review_needed(item, NOW, 'spam', fingerprint))
        self.assertEqual(old['stage'], 'junk')
        self.assertEqual(old['notes'], 'Owner decision')

    def test_unknown_direction_can_flag_review_without_claiming_inbound_or_new_lead(self):
        flag = R.suppressed_review_needed(self.item(), NOW, 'spam', None)
        self.assertEqual(flag['direction'], 'unknown')
        self.assertEqual(flag['content_comparison'], 'unbaselined')
        self.assertNotIn('inbound', flag['reason'])

    def test_identical_source_does_not_reflag_or_promote(self):
        item = self.item(direction='inbound')
        self.assertIsNone(R.suppressed_review_needed(item, NOW, 'spam', R.capture_fields_fingerprint(item)))
        self.assertIsNone(R.suppressed_review_needed(item, NOW, 'repair', None))

    def test_old_dated_repair_recap_or_explicit_outbound_does_not_flag_new_customer_evidence(self):
        self.assertIsNone(R.suppressed_review_needed(self.item(at='2026-10-20T00:00:00Z'), NOW, 'spam', 'a' * 64, since='2026-10-22T00:00:00Z'))
        self.assertIsNone(R.suppressed_review_needed(self.item(direction='outbound'), NOW, 'personal', None))

    def test_shop_autotext_or_empty_call_does_not_flag_repair(self):
        for body in ('No Answer', "Sorry we missed your call. Feel free to text us here, or we'll follow up shortly."):
            self.assertIsNone(R.suppressed_review_needed(self.item(body=body), NOW, 'operational', None))


class CoverageIntegrationTests(unittest.TestCase):
    def test_local_coverage_separates_rows_attempts_excerpts_and_unattempted_selection(self):
        inventory = {'records': [row(i) for i in range(7)]}
        evidence = {'attempts': [{}, {}, {}]}
        coverage = R.visible_coverage(inventory, inventory['records'][:4], [{}, {}], ['failed'], evidence, {})
        self.assertEqual(coverage['visible_rows_inventoried'], 7)
        self.assertEqual(coverage['thread_read_requests'], 3)
        self.assertEqual(coverage['rendered_thread_captures'], 2)
        self.assertEqual(coverage['selected_not_attempted'], 1)
        self.assertEqual(coverage['visible_rows_without_rendered_capture'], 5)
        self.assertFalse(coverage['full_thread_history_verified'])
        self.assertFalse(coverage['account_export_complete'])

    def test_complete_proof_adds_coverage_without_changing_legacy_receipt_count_keys(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            received = {}
            def completion(before, after, plan, counts, journal, lease, proof, raw, snapshot):
                expected = {'conversationsRead', 'conversationsChanged', 'archivedObservations', 'newCards',
                            'updatedCards', 'heldCards', 'skippedConversations', 'confirmedBatches'}
                self.assertEqual(set(counts), expected)
                self.assertEqual(proof['full_threads_read'], 1)
                self.assertFalse(proof['coverage']['full_thread_history_verified'])
                received.update(proof=proof, counts=counts)
                return {'readbackVerified': True}
            fixture.queue.completion = completion
            out = fixture.run()
            self.assertTrue(out['ok'], out)
            self.assertEqual(out['coverage']['rendered_thread_captures'], 1)
            self.assertEqual(out['coverage'], received['proof']['coverage'])
            folder = next(fixture.runs.iterdir())
            self.assertEqual(json.loads((folder / 'review-needed.json').read_text())['items'], [])
            self.assertEqual(json.loads((folder / 'selection-attempts.json').read_text())['attempts'][0]['outcome'], 'rendered_capture_saved')

    def test_failed_capture_produces_coverage_and_attempt_metadata_without_success_checkpoint(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root, linux=True)
            fixture.thread_failure = True
            out = fixture.run()
            self.assertFalse(out['ok'])
            self.assertEqual(out['coverage']['rendered_thread_captures'], 0)
            self.assertEqual(out['coverage']['thread_read_failures'], 1)
            self.assertFalse((fixture.refresh / 'uia-checkpoint.json').exists())
            folder = next(fixture.runs.iterdir())
            self.assertEqual(json.loads((folder / 'selection-attempts.json').read_text())['attempts'][0]['outcome'], 'source_read_failed')


if __name__ == '__main__':
    unittest.main()
