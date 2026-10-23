"""Synthetic message-source proof; no current selector or live capture is asserted."""
import copy
import unittest
from unittest import mock
import tempfile

import beside_message_evidence as M
import beside_refresh_runner as R
import beside_uia as U
from test_beside_uia import capture
from test_beside_runner_reliability import Fixture


def message(**changes):
    value = {'id': 'msg_synthetic_1', 'id_basis': 'provider',
             'at': '2026-10-17T03:05:00Z', 'time_basis': 'provider_timestamp',
             'direction': 'inbound', 'kind': 'message',
             'text': 'My brakes need checking. Call after four.',
             'facts': {'repair_request': 'brakes need checking', 'callback_availability': 'after four'}}
    return {**value, **changes}


def proven(records=None, **proof_changes):
    value = capture()
    for sample in [*value['prior_samples'], value]:
        sample['message_evidence'] = {
            'format': 'beside-message-evidence/v1', 'source_url': value['source_url'],
            'observed_at': sample['observed_at'],
            'surface': {'kind': 'messages', 'role': 'Tab', 'name': 'Synthetic verified message surface',
                        'selected': True, 'verification': 'rendered_selected_control'},
            'messages': copy.deepcopy([message()] if records is None else records),
            **proof_changes}
    return value


class MessageEvidenceTests(unittest.TestCase):
    def test_legacy_rendered_thread_is_explicitly_not_verified_messages(self):
        result = U.conversation(capture(), 'a' * 64)
        self.assertFalse(result['acquisition']['messages_verified'])
        self.assertEqual(result['acquisition']['acquired_surface'], 'rendered_thread')
        self.assertIsNone(result['source_event_at'])
        self.assertEqual(result['source_captured_at'], capture()['observed_at'])

    def test_requested_messages_rejects_recap_only_thread(self):
        with self.assertRaisesRegex(U.CaptureError, 'message_surface_unverified'):
            U.conversation(capture(), 'a' * 64, requested_surface='messages')

    def test_composer_message_button_is_not_a_verified_tab(self):
        value = proven()
        for sample in [*value['prior_samples'], value]:
            sample['message_evidence']['surface'].update(role='Button', name='Message')
        with self.assertRaisesRegex(U.CaptureError, 'message_surface_unverified'):
            U.conversation(value, 'a' * 64, requested_surface='messages')

    def test_three_stable_surface_observations_are_required(self):
        value = proven()
        value['prior_samples'][0]['message_evidence']['messages'][0]['text'] = 'Earlier stale text'
        with self.assertRaisesRegex(U.CaptureError, 'message_evidence_not_stable'):
            U.conversation(value, 'a' * 64, requested_surface='messages')

    def test_missing_observation_proof_and_wrong_identity_are_rejected(self):
        for mutation in ('missing', 'wrong_source', 'wrong_capture_time', 'unselected'):
            with self.subTest(mutation=mutation):
                value = proven()
                proof = value['prior_samples'][0]['message_evidence']
                if mutation == 'missing':
                    del value['prior_samples'][0]['message_evidence']
                elif mutation == 'wrong_source':
                    proof['source_url'] += '/wrong'
                elif mutation == 'wrong_capture_time':
                    proof['observed_at'] = value['observed_at']
                else:
                    proof['surface']['selected'] = False
                with self.assertRaises(U.CaptureError):
                    U.conversation(value, 'a' * 64, requested_surface='messages')

    def test_actual_messages_keep_source_event_and_capture_time_separate(self):
        value = proven()
        result = U.conversation(value, 'a' * 64, requested_surface='messages')
        self.assertTrue(result['acquisition']['messages_verified'])
        self.assertEqual(result['source_event_at'], '2026-10-17T03:05:00.000Z')
        self.assertEqual(result['source_event_id'], 'msg_synthetic_1')
        self.assertEqual(result['source_captured_at'], value['observed_at'])
        self.assertEqual(result['priority_evidence']['callback_availability']['direction'], 'inbound')
        self.assertNotIn('Customer asks about brakes.', result['concern'])

    def test_outbound_verbosity_never_establishes_customer_fields_or_event_freshness(self):
        result = U.conversation(proven([message(direction='outbound', text='Please provide name, car year/model and callback time.' * 20)]),
                                'a' * 64, requested_surface='messages')
        self.assertIsNone(result['source_event_at'])
        self.assertIsNone(result['received_at'])
        self.assertIsNone(result['updated_at'])
        self.assertTrue(all(not field['value'] for field in result['priority_evidence'].values()))
        self.assertIn('outbound_only', result['provenance']['qualifiers'])

    def test_unknown_direction_and_displayed_clock_are_preserved_without_qualification(self):
        result = U.conversation(proven([message(direction='unknown', id_basis='rendered',
                                                time_basis='rendered_clock_day')]),
                                'a' * 64, requested_surface='messages')
        self.assertIsNone(result['source_event_at'])
        self.assertIsNone(result['source_event_id'])
        self.assertIsNone(result['messages'][0]['at'])
        self.assertEqual(result['priority_evidence']['repair_request']['uncertainty'], 'direction_unknown')

    def test_no_provider_id_is_invented(self):
        result = U.conversation(proven([message(id=None, id_basis='unknown')]), 'a' * 64, requested_surface='messages')
        self.assertIsNone(result['source_event_id'])
        self.assertIsNone(result['source_event_at'])
        self.assertIsNone(result['messages'][0]['id'])
        self.assertEqual(result['priority_evidence']['repair_request']['uncertainty'], 'event_identity_unknown')

    def test_recaps_and_unobserved_empty_panes_do_not_satisfy_requested_messages(self):
        for value in (proven([message(kind='recap')]), proven([])):
            with self.assertRaises(U.CaptureError):
                U.conversation(value, 'a' * 64, requested_surface='messages')

    def test_verified_empty_message_pane_remains_uncertain_not_rejected_as_spam(self):
        result = U.conversation(proven([], empty_state_observed=True), 'a' * 64, requested_surface='messages')
        self.assertTrue(result['acquisition']['messages_verified'])
        self.assertIsNone(result['source_event_at'])
        self.assertEqual(result['messages'], [])
        self.assertEqual(U.generic_review(proven([], empty_state_observed=True), result['source_captured_at'],
                                         item=result)['classification'], 'uncertain')

    def test_future_timestamp_or_unbounded_body_is_refused(self):
        for record in (message(at='2027-01-01T00:00:00Z'), message(text='x' * 4001)):
            with self.assertRaises(U.CaptureError):
                U.conversation(proven([record]), 'a' * 64, requested_surface='messages')

    def test_duplicate_refresh_keeps_source_fingerprint_despite_new_capture_time(self):
        first = U.conversation(proven(), 'a' * 64, requested_surface='messages')
        later = proven()
        for sample in [*later['prior_samples'], later]:
            sample['observed_at'] = sample['observed_at'].replace('2026-10-17', '2026-10-18')
            sample['message_evidence']['observed_at'] = sample['observed_at']
        second = U.conversation(later, 'b' * 64, requested_surface='messages')
        self.assertNotEqual(first['source_captured_at'], second['source_captured_at'])
        self.assertEqual(R.capture_fields_fingerprint(first), R.capture_fields_fingerprint(second))

    def test_fresh_provider_message_changes_fingerprint_without_reusing_old_recap(self):
        first = U.conversation(proven(), 'a' * 64, requested_surface='messages')
        second = U.conversation(proven([message(id='msg_synthetic_2', at='2026-10-17T03:15:00Z')]),
                                'b' * 64, requested_surface='messages')
        self.assertNotEqual(R.capture_fields_fingerprint(first), R.capture_fields_fingerprint(second))
        self.assertEqual(second['source_event_at'], '2026-10-17T03:15:00.000Z')
        self.assertNotIn('Customer asks about brakes.', second['concern'])

    def test_requested_message_guard_does_not_complete_an_unproven_fixture(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            original_run = R.run
            with mock.patch.object(R, 'run', side_effect=lambda **kwargs: original_run(**kwargs, requested_surface='messages')):
                result = fixture.run()
            self.assertFalse(result['ok'], result)
            self.assertEqual(result['error'], 'CAPTURE_INCOMPLETE')
            self.assertFalse(result['message_surface_verified'])
            self.assertEqual(result['messages_observed'], 0)
            self.assertNotIn('fresh_messages_acquired', result)
            self.assertNotIn('complete', fixture.actions)
            self.assertEqual(fixture.imports, 0)
            self.assertFalse((fixture.refresh / 'uia-checkpoint.json').exists())

    def test_reverse_dom_order_does_not_overwrite_newer_customer_facts(self):
        fresh = message(id='msg_fresh', at='2026-10-17T03:15:00Z',
                        facts={'vehicle_year': '2019', 'vehicle_model': 'Ford F-Series'})
        old = message(id='msg_old', at='2026-01-01T00:00:00Z',
                      facts={'vehicle_year': '2016', 'vehicle_model': 'Honda Pilot'})
        result = U.conversation(proven([fresh, old]), 'a' * 64, requested_surface='messages')
        self.assertEqual(result['priority_evidence']['vehicle_year']['value'], '2019')
        self.assertEqual(result['priority_evidence']['vehicle_model']['value'], 'Ford F-Series')
        self.assertEqual(result['source_event_id'], 'msg_fresh')
        self.assertEqual(result['priority_evidence']['vehicle_year']['uncertainty'], '')

    def test_cli_messages_flag_passes_explicit_request_without_persistent_setting(self):
        with mock.patch.object(R, 'run', return_value={'ok': True}) as run:
            self.assertEqual(R.main(['--require-messages']), 0)
        self.assertEqual(run.call_args.kwargs['requested_surface'], 'messages')


if __name__ == '__main__':
    unittest.main()
