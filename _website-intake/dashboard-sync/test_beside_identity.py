"""Independent synthetic acceptance tests for the wrong-conversation incident.
The intended contact and the rendered contact are separate fixture inputs.
No browser, network, customer records, or production writes are used.
"""
import copy
import unittest
import beside_uia as uia

CID = 'prv_' + 'A' * 26
OTHER = 'prv_' + 'B' * 26
URL = 'https://app.beside.com/chats/' + CID

def text_node(name):
    return {'role': 'ControlType.Text', 'name': name, 'left': 240, 'width': 400}

def sample(header='(202) 555-0101', at='2026-10-17T16:00:00.600Z',
           intended='(202) 555-0101', body='Customer asks about brakes.'):
    return {'observed_at': at, 'observed_url_before': URL, 'observed_url_after': URL,
            'nodes': [
                {'role': 'ControlType.Hyperlink', 'name': intended + ' 2h Request',
                 'value': URL, 'left': 0, 'width': 200},
                text_node(header), text_node('10:00 AM'),
                text_node(body), text_node('Today')]}

def capture(header='(202) 555-0101', intended='(202) 555-0101'):
    value = sample(header=header, intended=intended)
    value.update(format='beside-uia-thread/v1', conversation_id=CID, source_url=URL,
                 inventory_label=intended + ' 2h Request',
                 identity_format='beside-uia-identity/v1',
                 prior_samples=[sample(header=header, intended=intended, at=at) for at in
                                ['2026-10-17T16:00:00.000Z', '2026-10-17T16:00:00.300Z']])
    return value

class IdentityAcceptanceTests(unittest.TestCase):
    def normalize(self, value):
        return uia.conversation(value, 'a' * 64)

    def assert_rejected(self, value):
        with self.assertRaises(uia.CaptureError):
            self.normalize(value)

    def test_target_a_url_with_customer_b_header_is_rejected(self):
        self.assert_rejected(capture(header='(202) 555-0102'))

    def test_phone_target_with_previous_named_thread_is_rejected(self):
        self.assert_rejected(capture(header='Maybe: Different Person'))

    def test_valid_phone_preserves_source_identity_and_contact(self):
        result = self.normalize(capture())
        self.assertEqual(result['id'], CID)
        self.assertEqual(result['phone'], '+12025550101')
        self.assertIn('brakes', result['concern'])
        self.assertNotIn('stage', result)
        self.assertNotIn('notes', result)

    def test_equivalent_native_phone_format_is_accepted(self):
        result = self.normalize(capture(header='+1 202-555-0101'))
        self.assertEqual(result['phone'], '+12025550101')

    def test_unique_matching_name_is_accepted_without_inferred_phone(self):
        result = self.normalize(capture(header='Maybe: Example', intended='Maybe: Example'))
        self.assertEqual(result['name'], 'Maybe: Example')
        self.assertEqual(result['phone'], '')

    def test_matching_header_with_changing_message_pane_is_rejected(self):
        value = capture()
        value['prior_samples'][1]['nodes'][3]['name'] = 'Previous customer has an oil leak.'
        self.assert_rejected(value)

    def test_url_changed_during_tree_read_is_rejected(self):
        value = capture()
        value['observed_url_after'] = 'https://app.beside.com/chats/' + OTHER
        self.assert_rejected(value)

    def test_previous_sample_was_different_conversation_is_rejected(self):
        value = capture()
        value['prior_samples'][0]['observed_url_before'] = 'https://app.beside.com/chats/' + OTHER
        self.assert_rejected(value)

    def test_legacy_capture_without_identity_evidence_is_rejected(self):
        value = capture()
        value.pop('prior_samples')
        value.pop('identity_format')
        self.assert_rejected(value)

    def test_single_matching_frame_is_not_stability_proof(self):
        value = capture()
        value['prior_samples'] = []
        self.assert_rejected(value)

    def test_identical_timestamps_are_not_independent_observations(self):
        value = capture()
        for previous in value['prior_samples']:
            previous['observed_at'] = value['observed_at']
        self.assert_rejected(value)

    def test_inventory_caption_must_have_an_unambiguous_title(self):
        value = capture()
        value['inventory_label'] = 'No activity separator or contact identity'
        self.assert_rejected(value)

    def test_requested_native_link_must_be_in_each_observation(self):
        value = capture()
        value['prior_samples'][0]['nodes'][0]['value'] = 'https://app.beside.com/chats/' + OTHER
        self.assert_rejected(value)

    def test_duplicate_visible_contact_name_requires_manual_review(self):
        value = capture(header='Maybe: Example', intended='Maybe: Example')
        duplicate = {'role': 'ControlType.Hyperlink', 'name': 'Maybe: Example 1d Other job',
                     'value': 'https://app.beside.com/chats/' + OTHER, 'left': 0, 'width': 200}
        for observation in [*value['prior_samples'], value]:
            observation['nodes'].insert(1, copy.deepcopy(duplicate))
        self.assert_rejected(value)

    def test_loading_pane_is_not_complete_source_evidence(self):
        value = capture()
        for observation in [*value['prior_samples'], value]:
            observation['nodes'][3]['name'] = 'Loading...'
        self.assert_rejected(value)

    def test_rejection_does_not_mutate_input_evidence(self):
        value = capture(header='(202) 555-0102')
        original = copy.deepcopy(value)
        self.assert_rejected(value)
        self.assertEqual(value, original)

if __name__ == '__main__':
    unittest.main()
