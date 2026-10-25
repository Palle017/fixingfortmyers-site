"""Synthetic regressions for the owner's bounded receptionist wording."""
import copy
import unittest

from beside_evidence import is_shop_reply, rendered_provenance, sparse_contact_candidate
from beside_uia import generic_review, review_content

OPENING = "Thanks for calling Perfect Timing. Please share your name and car model so Tony can be better prepared when he calls or texts back. Feel free to include a good time to reach you; otherwise, he'll call as soon as he gets a minute."
ACK = 'Thanks, that helps Tony be prepared.'
AT = '2026-10-25T06:00:00.000Z'
CID = 'prv_' + 'A' * 26


class ReceptionCopyTests(unittest.TestCase):
    def test_exact_opening_ack_and_signature_variants_are_shop_copy(self):
        for text in [OPENING, ACK]:
            for suffix in ['', '\n- Perfect Timing Reception', ' — Perfect Timing Reception', ' – Perfect Timing Reception', ' Perfect Timing Reception']:
                with self.subTest(text=text, suffix=suffix):
                    self.assertTrue(is_shop_reply((text + suffix).replace("'", '’')))
        for signature in ['Perfect Timing Reception', '- Perfect Timing Reception', '— Perfect Timing Reception', '– Tony - Perfect Timing']:
            self.assertTrue(is_shop_reply(signature))

    def test_name_car_only_survives_template_filter_and_remains_reviewable(self):
        item = {'concern': OPENING + '\n- Perfect Timing Reception\nMy name is Morgan. Car: Honda Civic.\n' + ACK}
        before = copy.deepcopy(item)
        self.assertEqual(review_content(item), ['My name is Morgan. Car: Honda Civic.'])
        result = generic_review({'conversation_id': CID}, AT, item=item)
        self.assertTrue(result['include_in_dashboard'])
        self.assertEqual(result['classification'], 'uncertain')
        self.assertIn('Morgan', result['summary'])
        self.assertNotIn(OPENING, result['summary'])
        self.assertEqual(item, before)

    def test_shop_only_activity_has_no_customer_priority_evidence(self):
        item = {'messages': [{'body': OPENING + '\n– Perfect Timing Reception', 'direction': 'outbound', 'at': AT}]}
        event = rendered_provenance(item, AT)['events'][0]
        self.assertEqual(event['kind'], 'shop_reply')
        self.assertEqual(event['text'], '')
        self.assertFalse(event['repair_candidate'])
        self.assertFalse(sparse_contact_candidate(event))

    def test_near_matches_and_customer_additions_are_not_discarded(self):
        for text in [OPENING + ' My car is a Civic.', 'Customer quoted: ' + OPENING,
                     'Perfect Timing Reception called me; please call back.',
                     'My name is Morgan. Car: Honda Civic. Call me after 3.']:
            self.assertFalse(is_shop_reply(text))
            self.assertIn(text, review_content({'concern': text}))

    def test_shop_only_and_unknown_callers_still_reach_manual_review(self):
        for text in [OPENING + '\n- Perfect Timing Reception', ACK, 'Missed call', 'Name unavailable. Car model unknown.']:
            result = generic_review({'conversation_id': CID}, AT, item={'concern': text})
            self.assertTrue(result['include_in_dashboard'])
            self.assertEqual(result['classification'], 'uncertain')


if __name__ == '__main__':
    unittest.main()
