"""Synthetic sparse-contact review regressions; no provider or database writes."""
import unittest
import beside_evidence as E
import beside_refresh_runner as R

NOW = '2026-10-25T14:00:00Z'
SINCE = '2026-10-24T14:00:00Z'


def item(text, direction='inbound', at=NOW):
    return {'name': 'Name not provided', 'concern': text,
            'messages': [{'body': text, 'direction': direction, 'at': at}]}


class SparseContactReviewTests(unittest.TestCase):
    def test_name_model_and_callback_do_not_require_year_or_problem(self):
        for text in ('My name is Morgan.', 'Car: Honda Civic', 'Model: Civic',
                     'My car is a Civic.', 'My car is Civic.', 'Please call me after 3.',
                     "I'm available after 3.", 'Callback time: tomorrow afternoon'):
            with self.subTest(text=text):
                result = E.review_needed(item(text), NOW, since=SINCE)
                self.assertTrue(result['requires_review'])
                self.assertEqual(result['reason'], 'changed_inbound_contact_evidence')
                self.assertNotIn('classification', result)
                self.assertNotIn('text', result)

    def test_archived_decision_is_preserved_and_identical_content_is_ignored(self):
        value = item('My name is Morgan. Car: Honda Civic. Call me after 3.')
        for prior in ('spam', 'personal', 'operational'):
            flag = R.suppressed_review_needed(value, NOW, prior, 'old', since=SINCE)
            self.assertEqual(flag['classification_preserved'], prior)
            decision = R.source_review({'conversation_id': 'prv_' + '0' * 26}, NOW,
                                       value, None, prior, 'old')
            self.assertEqual(decision['classification'], prior)
            self.assertFalse(decision['include_in_dashboard'])
            self.assertIsNone(R.suppressed_review_needed(value, NOW, prior,
                              R.capture_fields_fingerprint(value), since=SINCE))

    def test_old_contact_or_outbound_prompt_does_not_become_new_lead(self):
        for value in (item('My name is Morgan.', at=SINCE),
                      item('Please call me after 3.', direction='outbound'),
                      item('Please text your name and car model.'),
                      item('Text me your name. For example: My name is Morgan.'),
                      item('Missed call'), item('Your verification code is 123456.'),
                      item('Thanks! ' * 1000)):
            self.assertFalse(E.review_needed(value, NOW, since=SINCE)['requires_review'])

    def test_unknown_direction_or_time_stays_qualified(self):
        value = item('Car: Honda Civic', direction='unknown', at=None)
        result = E.review_needed(value, NOW, since=SINCE)
        self.assertTrue(result['requires_review'])
        self.assertEqual(result['reason'], 'changed_undated_contact_context')
        self.assertEqual(result['direction'], 'unknown')
        self.assertIsNone(result['event_at'])

    def test_saved_identity_does_not_make_empty_activity_substantive(self):
        value = item('Missed call')
        value.update(name='Morgan', vehicle='Honda Civic')
        self.assertFalse(E.review_needed(value, NOW, since=SINCE)['requires_review'])


if __name__ == '__main__':
    unittest.main()
