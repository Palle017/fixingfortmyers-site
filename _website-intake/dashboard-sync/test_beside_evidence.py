"""Anonymized rendered-evidence regressions; no browser, API or private settings."""
import unittest
import beside_uia as uia
import beside_extract

OBSERVED = '2026-10-23T14:00:00Z'
CID = 'prv_00000000000000000000000000'
OLD_AND_RECENT = '\n'.join([
    '12:14 PM', 'AI recap',
    'The caller requested pricing to diagnose an engine issue in a 2017 Ford F-150.',
    'Jun 7, 2026', '10:22 AM', 'Receptionist Call',
    '10:25 AM', 'Receptionist Call',
    "Hey, it's Tony at Perfect Timing. Text me your name and your vehicle's year, make and model. I'll give you a call back as soon as I can.",
    'Yesterday',
])


def review(body, **extra):
    item = {'name': 'Example Caller', 'concern': body, **extra}
    return uia.generic_review({'conversation_id': CID}, OBSERVED, item=item)


class RenderedEvidenceRegressionTests(unittest.TestCase):
    def test_old_recap_date_survives_recent_calls(self):
        result = review(OLD_AND_RECENT)
        self.assertIn('2026-06-07', result['summary'])
        self.assertIn('2026-10-22', result['summary'])
        self.assertIn('not proof of a new request', result['summary'])
        self.assertEqual(result['classification'], 'uncertain')
        self.assertTrue(result['include_in_dashboard'])

    def test_current_shop_reply_does_not_assert_customer_intent(self):
        result = review("Hey, it's Tony at Perfect Timing. Text me your name and your vehicle's year, make and model. I'll give you a call back as soon as I can.")
        self.assertIn('Shop automated reply', result['summary'])
        self.assertIn('no customer repair details', result['summary'])
        self.assertTrue(result['include_in_dashboard'])

    def test_empty_missed_call_stays_review_without_request_claim(self):
        result = review('10:22 AM\nMissed call\nYesterday')
        self.assertIn('no customer repair details', result['summary'])
        self.assertEqual(result['classification'], 'uncertain')
        self.assertTrue(result['include_in_dashboard'])

    def test_first_person_vehicle_is_preserved_with_candidate_provenance(self):
        result = beside_extract.apply({'name': 'Example Caller',
            'concern': 'I have a 2007 Subaru Impreza and it will not start.'}, explicit_only=True)
        self.assertEqual(result['vehicle'], '2007 Subaru Impreza')
        self.assertEqual(result['field_evidence']['vehicle']['basis'], 'rendered_first_person_vehicle')
        self.assertEqual(result['field_evidence']['vehicle']['direction'], 'unknown')

    def test_prompt_example_does_not_fill_vehicle(self):
        result = beside_extract.apply({'name': 'Example Caller',
            'concern': 'Please text your vehicle, for example a 2007 Subaru Impreza.'}, explicit_only=True)
        self.assertFalse(result.get('vehicle'))



class ProvenanceBoundaryTests(unittest.TestCase):
    def test_flat_text_direction_stays_unknown(self):
        from beside_evidence import rendered_provenance
        result = rendered_provenance({'concern': '10:22 AM\nEngine diagnosis requested.\nYesterday'}, OBSERVED)
        self.assertTrue(all(event['direction'] == 'unknown' for event in result['events']))
        self.assertIn('direction_unknown', result['qualifiers'])

    def test_explicit_outbound_custom_text_is_not_inbound_evidence(self):
        from beside_evidence import rendered_provenance, review_needed
        item = {'concern': 'Shop custom repair wording.', 'messages': [
            {'body': 'I can diagnose the engine tomorrow.', 'direction': 'outbound', 'at': '2026-10-22T14:22:00Z'}]}
        item['provenance'] = rendered_provenance(item, OBSERVED)
        self.assertFalse(review_needed(item, OBSERVED)['requires_review'])
        result = uia.generic_review({'conversation_id': CID}, OBSERVED, item=item)
        self.assertIn('Outbound shop activity', result['summary'])
        self.assertEqual(result['classification'], 'uncertain')

    def test_old_recap_does_not_become_new_repair_review(self):
        from beside_evidence import review_needed
        self.assertFalse(review_needed({'concern': OLD_AND_RECENT}, OBSERVED,
                                      since='2026-10-13T12:00:00Z')['requires_review'])

    def test_new_inbound_repair_flags_review_without_promotion(self):
        from beside_evidence import review_needed
        result = review_needed({'messages': [{'body': 'My engine will not start.',
            'direction': 'inbound', 'at': '2026-10-23T12:00:00Z'}]}, OBSERVED,
            since='2026-10-13T12:00:00Z')
        self.assertTrue(result['requires_review'])
        self.assertEqual(result['reason'], 'changed_inbound_repair_evidence')
        self.assertNotIn('classification', result)
        self.assertNotIn('include_in_dashboard', result)
        self.assertNotIn('text', result)

    def test_undated_event_gets_no_capture_timestamp(self):
        from beside_evidence import rendered_provenance
        result = rendered_provenance({'concern': '10:22 AM\nEngine diagnosis requested.'}, OBSERVED)
        self.assertIsNone(result['latest_activity_at'])
        self.assertIsNone(result['events'][0]['at'])

    def test_future_structured_time_is_not_accepted_as_current(self):
        from beside_evidence import rendered_provenance
        result = rendered_provenance({'messages': [{'body': 'Engine diagnosis requested.',
            'direction': 'inbound', 'at': '2027-01-01T12:00:00Z'}]}, OBSERVED)
        self.assertIsNone(result['latest_activity_at'])

    def test_offset_instants_are_compared_in_utc(self):
        from beside_evidence import rendered_provenance
        result = rendered_provenance({'messages': [
            {'body': 'Older engine diagnosis.', 'at': '2026-10-22T23:00:00-04:00'},
            {'body': 'Missed call', 'at': '2026-10-23T04:00:00Z'}]}, OBSERVED)
        self.assertEqual(result['events'][0]['at'], '2026-10-23T03:00:00.000Z')
        self.assertEqual(result['latest_activity_at'], '2026-10-23T04:00:00.000Z')
        self.assertIn('older_repair_context', result['qualifiers'])

    def test_existing_vehicle_survives_different_candidate(self):
        result = beside_extract.apply({'vehicle': 'Known vehicle',
            'concern': 'I have a 2007 Subaru Impreza.'}, explicit_only=True)
        self.assertEqual(result['vehicle'], 'Known vehicle')

    def test_conversation_to_default_extraction_preserves_provenance(self):
        from test_beside_uia import capture, bind_samples
        value = capture(title='Example Caller')
        value['nodes'][3]['name'] = 'I have a 2007 Subaru Impreza and it will not start.'
        item = uia.conversation(bind_samples(value), 'a' * 64)
        out = beside_extract.apply(item, explicit_only=True)
        self.assertEqual(out['vehicle'], '2007 Subaru Impreza')
        self.assertIn('provenance', out)
        self.assertFalse(out['field_evidence']['vehicle']['new_request_established'])
        self.assertEqual(out['field_evidence']['vehicle']['event_at'], '2026-10-17T03:05:00.000Z')
        self.assertNotIn('messages', out)

    def test_duration_is_not_customer_repair_details(self):
        result = review('10:22 AM\nAudio Call\n3 seconds\nYesterday')
        self.assertIn('no customer repair details', result['summary'])

    def test_shop_business_name_is_not_repair_intent(self):
        from beside_evidence import review_needed
        result = review_needed({'concern': 'Perfect Timing Auto Repair'}, OBSERVED)
        self.assertFalse(result['requires_review'])

    def test_differing_date_separators_are_not_guessed_for_old_recap(self):
        from beside_evidence import rendered_provenance
        result = rendered_provenance({'concern': '\n'.join([
            'Jun 7, 2026', '12:14 PM', 'AI recap', 'Engine diagnosis requested.',
            'Yesterday', '10:22 AM', 'Receptionist Call'])}, OBSERVED)
        repair = next(event for event in result['events'] if event['repair_candidate'])
        self.assertIsNone(repair['at'])
        self.assertTrue(repair['date_ambiguous'])
        self.assertIn('2026-06-07', result['displayed_days'])
        self.assertIn('2026-10-22', result['displayed_days'])

    def test_following_separator_order_keeps_old_recap_and_uncertain_recent_clock(self):
        from beside_evidence import rendered_provenance
        result = rendered_provenance({'concern': OLD_AND_RECENT}, OBSERVED)
        self.assertEqual(result['events'][0]['at'], '2026-06-07T16:14:00.000Z')
        self.assertIsNone(result['events'][1]['at'])
        self.assertTrue(result['events'][1]['date_ambiguous'])

    def test_invalid_or_future_separator_does_not_inherit_older_day(self):
        from beside_evidence import rendered_provenance
        for separator in ('December 31, 2027', 'Feb 30, 2026'):
            result = rendered_provenance({'concern': '\n'.join([
                'Jun 7, 2026', '12:14 PM', 'Engine diagnosis requested.',
                separator, '10:22 AM', 'Receptionist Call'])}, OBSERVED)
            call = next(event for event in result['events'] if event['kind'] == 'call')
            self.assertIsNone(call['at'])
            self.assertTrue(call['date_ambiguous'])
            self.assertIn(separator, call['date_context'])

    def test_optional_rendered_groups_retain_explicit_roles_and_media(self):
        from beside_evidence import rendered_provenance
        result = rendered_provenance({'raw': {'capture': {'groups': [{
            'direction': 'inbound', 'text': 'Engine diagnosis requested.',
            'times': [{'display': 'Jun 7 12:12 PM', 'datetime': '2026-06-07T16:12:00Z'}],
            'has_audio': True, 'has_image': False, 'links': ['https://synthetic.invalid/source'],
            'reverse_dom_ordinal': 3}]}}}, OBSERVED)
        event = result['events'][0]
        self.assertEqual(event['direction'], 'inbound')
        self.assertEqual(event['at'], '2026-06-07T16:12:00.000Z')
        self.assertTrue(event['has_audio'])
        self.assertEqual(event['source_link_count'], 1)
        self.assertNotIn('id', event)
        self.assertNotIn('links', event)

    def test_displayed_group_date_without_offset_is_not_provider_time(self):
        from beside_evidence import rendered_provenance
        result = rendered_provenance({'groups': [{'direction': 'inbound',
            'text': 'Engine diagnosis requested.', 'times': [
                {'display': 'Jun 7 12:12 PM', 'datetime': 'Sun Jun 7 2026'}]}]}, OBSERVED)
        event = result['events'][0]
        self.assertIsNone(event['at'])
        self.assertEqual(event['displayed_times'][0]['datetime'], 'Sun Jun 7 2026')
        self.assertEqual(event['basis'], 'rendered_group_metadata')

    def test_malformed_group_times_remain_unknown(self):
        from beside_evidence import rendered_provenance
        for times in ({'datetime': 'bad'}, 17):
            result = rendered_provenance({'groups': [{'direction': 'inbound',
                'text': 'Engine diagnosis requested.', 'times': times}]}, OBSERVED)
            self.assertIsNone(result['events'][0]['at'])
            self.assertEqual(result['events'][0]['displayed_times'], [])

    def test_duplicate_visible_names_remain_fail_closed(self):
        from test_beside_uia import capture, bind_samples, node
        value = capture(title='Example Caller')
        value['nodes'].insert(1, node('ControlType.Hyperlink',
            'Example Caller 2h Second conversation', left=10, width=500,
            value='https://app.beside.com/chats/prv_' + 'B' * 26))
        with self.assertRaisesRegex(uia.CaptureError, 'ambiguous_visible_contact_identity'):
            uia.conversation(bind_samples(value), 'a' * 64)

    def test_duplicate_names_keep_distinct_conversation_evidence(self):
        one = uia.generic_review({'conversation_id': 'prv_' + 'A' * 26}, OBSERVED,
                                item={'name': 'Example Caller', 'concern': 'Engine diagnosis.'})
        two = uia.generic_review({'conversation_id': 'prv_' + 'B' * 26}, OBSERVED,
                                item={'name': 'Example Caller', 'concern': 'Engine diagnosis.'})
        self.assertNotEqual(one['evidence'], two['evidence'])


if __name__ == '__main__':
    unittest.main()
