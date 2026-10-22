import copy
import inspect
import unittest
from unittest import mock

from beside_extract import apply
from beside_refresh_runner import FINISH_RESERVE_SECONDS, READBACK_RESERVE_SECONDS, ScanError, begin_import, capture_change_count, capture_fields_fingerprint, capture_timeout, preserve_known_fields, read_threads, require_captured_changes, run, sample_when_unchanged, selected_changes, source_review
from beside_uia import SHOP_AUTOTEXTS, SHOP_SIGNATURE, generic_review

CID='prv_'+'A'*26
AT='2026-10-22T04:00:00.000Z'

def decision(text):
    return generic_review({'conversation_id':CID},AT,item={'concern':text})

def inventory(label,at=AT):
    return {'captured_at':at,'records':[{'conversation_id':CID,'label':label}]}

def checkpoint(label,at='2026-10-22T03:55:00.000Z'):
    return {'records':{CID:{'label':label,'checked_at':at}}}

class ReviewClarityTests(unittest.TestCase):
    def test_captured_repair_details_replace_repetitive_placeholder(self):
        out=decision('10:05 PM\nAI recap\nVehicle: 2014 Honda Accord\nIssue: brakes grinding\nToday')
        self.assertEqual(out['summary'],'Captured text: Vehicle: 2014 Honda Accord Issue: brakes grinding')
        self.assertTrue(out['include_in_dashboard'])
        self.assertEqual(out['classification'],'uncertain')
        self.assertNotIn('outcome',out)

    def test_shop_automatic_reply_and_call_controls_do_not_hide_customer_request(self):
        text='\n'.join(['Audio Call','No Answer','00:00','Thu, Oct 22, 2026','10:05 PM',SHOP_AUTOTEXTS[0],SHOP_SIGNATURE,
                        'Message','Ask Beside AI','My brakes are grinding.'])
        out=decision(text)
        self.assertEqual(out['summary'],'Captured text: My brakes are grinding.')
        self.assertTrue(out['include_in_dashboard'])

    def test_only_shop_reply_and_metadata_produces_honest_callback_review(self):
        for template in SHOP_AUTOTEXTS:
            out=decision('\n'.join(['AudioCall','NoAnswer','00:00','Yesterday',template,SHOP_SIGNATURE,'Message','AskBesideAI']))
            self.assertEqual(out['summary'],'Call captured; name and repair details still needed. Check the original conversation before following up.')
            self.assertTrue(out['include_in_dashboard'])

    def test_no_name_silent_missed_and_callback_requests_stay_in_review(self):
        for text in ['', 'Missed call', 'Incoming call\n00:00', 'Please call me back', 'Google told me you repair brakes']:
            with self.subTest(text=text):
                self.assertTrue(decision(text)['include_in_dashboard'])
                self.assertEqual(decision(text)['classification'],'uncertain')
        self.assertTrue(decision('')['summary'].startswith('Conversation captured;'))
        self.assertTrue(decision('Message\nAsk Beside AI')['summary'].startswith('Conversation captured;'))
        self.assertTrue(decision('Missed call')['summary'].startswith('Call captured;'))
        known=generic_review({'conversation_id':CID},AT,item={'name':'Known Customer','concern':'Missed call'})
        self.assertTrue(known['summary'].startswith('Call captured; repair details still needed.'))

    def test_only_complete_otp_templates_are_archived_without_an_inquiry(self):
        out=decision('10:05 PM\nYour ExampleApp verification code is: 123456.\nDo not share this code with anyone.\nToday')
        self.assertFalse(out['include_in_dashboard'])
        self.assertEqual(out['classification'],'uncertain')
        self.assertNotIn('123456',out['summary'])
        for text in ['The security code on my car is 123456', 'Your BMW security code is 1234.', 'Your ExampleApp verification code is 123456.\nI also need my brakes checked.',
                     'Your ExampleApp verification code is 123456.\nMissed call']:
            with self.subTest(text=text):self.assertTrue(decision(text)['include_in_dashboard'])

    def test_customer_request_with_otp_remains_visible_without_displaying_code(self):
        out=decision('Your ExampleApp verification code is 123456.\nMy car will not start.')
        self.assertTrue(out['include_in_dashboard'])
        self.assertIn('My car will not start.',out['summary'])
        self.assertNotIn('123456',out['summary'])

    def test_summary_is_bounded_and_does_not_repeat_identical_rendered_lines(self):
        self.assertEqual(decision('Brakes grinding\nBrakes grinding')['summary'],'Captured text: Brakes grinding')
        self.assertEqual(len(decision('Repair details '*200)['summary']),500)

    def test_update_path_no_longer_prefixes_old_owner_desk_concern(self):
        old={'concern':'New or changed Beside conversation captured for review. Check the original thread before following up.'}
        item={'concern':'My brakes are grinding.'}
        out=source_review({'conversation_id':CID},AT,item,old)
        self.assertEqual(out['summary'],'Captured text: My brakes are grinding.')
        repeat=source_review({'conversation_id':CID},AT,item,{'concern':out['summary']})
        self.assertEqual(repeat['summary'],'Earlier saved context: My brakes are grinding.')

    def test_periodic_identical_capture_archives_without_churning_existing_card(self):
        item={'concern':'10:05 PM\nMissed call\nToday','name':'Name not provided'}
        fingerprint=capture_fields_fingerprint(item)
        out=source_review({'conversation_id':CID},AT,item,{'concern':'Saved source'},'repair',fingerprint)
        self.assertFalse(out['include_in_dashboard'])
        self.assertEqual(out['classification'],'repair')
        changed={**item,'concern':'10:06 PM\nMissed call\nToday'}
        self.assertTrue(source_review({'conversation_id':CID},AT,changed,{'concern':'Saved source'},'repair',fingerprint)['include_in_dashboard'])

    def test_previous_repair_is_retained_even_when_latest_capture_is_only_otp(self):
        out=source_review({'conversation_id':CID},AT,{'concern':'Your ExampleApp verification code is 123456.'},{'concern':'2014 Honda Accord: brakes grinding.','vehicle':'2014 Honda Accord'},'repair')
        self.assertTrue(out['include_in_dashboard'])
        self.assertEqual(out['classification'],'repair')
        self.assertIn('2014 Honda Accord: brakes grinding.',out['summary'])
        self.assertNotIn('Automated verification message only',out['summary'])

    def test_known_repair_context_survives_silent_or_shop_reply_without_growth(self):
        for text in ['', 'Audio Call\nNo Answer', SHOP_AUTOTEXTS[0]+'\n'+SHOP_SIGNATURE]:
            with self.subTest(text=text):
                old={'concern':'2014 Honda Accord: brakes grinding.\n\nCategory: Repair inquiry\n\nConversation excerpt: original evidence',
                     'vehicle':'2014 Honda Accord','source_updated_at':'2026-10-20T12:00:00Z'}
                first=source_review({'conversation_id':CID},AT,{'concern':text},old,'repair')
                projected={'concern':first['summary']+'\n\nCategory: Repair inquiry\n\nConversation excerpt: current source',
                           'source_updated_at':AT,'vehicle':old['vehicle']}
                again=source_review({'conversation_id':CID},AT,{'concern':text},projected,'repair')
                self.assertEqual(again['summary'],first['summary'])
                self.assertEqual(again['summary'].count('2014 Honda Accord: brakes grinding.'),1)
                self.assertIn('source observed 2026-10-20',again['summary'])
                self.assertNotIn('original evidence',again['summary'])

    def test_meaningful_new_facts_are_dated_while_earlier_context_is_retained_once(self):
        old={'concern':'2014 Honda Accord: brakes grinding.','source_updated_at':'2026-10-20T12:00:00Z'}
        first=source_review({'conversation_id':CID},AT,{'concern':'Now the brake pedal feels soft.'},old,'repair')
        self.assertIn('2014 Honda Accord: brakes grinding.',first['summary'])
        self.assertIn('Latest capture (2026-10-22): Now the brake pedal feels soft.',first['summary'])
        again=source_review({'conversation_id':CID},AT,{'concern':'The pedal now goes to the floor.'},{'concern':first['summary']},'repair')
        self.assertEqual(again['summary'].count('2014 Honda Accord: brakes grinding.'),1)
        self.assertIn('The pedal now goes to the floor.',again['summary'])
        self.assertNotIn('Now the brake pedal feels soft.',again['summary'])
        self.assertLess(len(again['summary']),800)

    def test_all_native_call_markers_prevent_otp_only_auto_exclusion(self):
        for marker in ['Audio Call','AudioCall','Receptionist Call','ReceptionistCall','Missed call','Incoming call','Outgoing call','NoAnswer']:
            with self.subTest(marker=marker):
                self.assertTrue(decision(marker+'\nYour ExampleApp verification code is 123456.')['include_in_dashboard'])

    def test_previous_archive_only_classifications_are_preserved(self):
        for previous in ('spam','operational','personal'):
            out=source_review({'conversation_id':CID},AT,{'concern':'Captured words'},{},previous)
            self.assertFalse(out['include_in_dashboard'])
            self.assertEqual(out['classification'],previous)

class ExplicitFieldsTests(unittest.TestCase):
    def test_flattened_or_shop_name_cannot_be_assigned_to_customer(self):
        for item in [{'concern':'My name is Shop Person.'},
                     {'messages':[{'direction':'outbound','body':'My name is Shop Person.'}]}]:
            self.assertNotIn('name',apply(item,explicit_only=True))

    def test_only_one_explicit_inbound_introduction_fills_unknown_name(self):
        item={'name':'Name not provided','messages':[{'direction':'inbound','body':'Hi. My name is Alex Example, and I need help.'}]}
        before=copy.deepcopy(item)
        self.assertEqual(apply(item,explicit_only=True)['name'],'Alex Example')
        self.assertEqual(item,before)
        item['messages'].append({'direction':'inbound','body':'My name is Other Person.'})
        self.assertEqual(apply(item,explicit_only=True)['name'],'Name not provided')

    def test_known_positive_fields_and_original_receipt_are_preserved(self):
        old={'name':'Known Customer','vehicle':'Known vehicle','phone':'+12395550100','email':'customer@example.invalid','received_at':AT}
        incoming={'name':'Name not provided','vehicle':'','phone':'','email':'','concern':'Vehicle: Different vehicle',
                  'messages':[{'direction':'inbound','body':'My name is Other Person.'}]}
        out=apply(preserve_known_fields(incoming,old),explicit_only=True)
        for field in old:self.assertEqual(out[field],old[field])

    def test_unflagged_extraction_requires_explicit_vehicle_label(self):
        self.assertEqual(apply({'concern':'Vehicle: 2014 Honda Accord'},explicit_only=True)['vehicle'],'2014 Honda Accord')
        self.assertNotIn('vehicle',apply({'concern':'I saw a 2014 Honda Accord'},explicit_only=True))
        self.assertNotIn('vehicle',apply({'concern':'Vehicle: Not provided'},explicit_only=True))

class LabelChurnTests(unittest.TestCase):
    def test_relative_age_progression_does_not_reimport_same_preview(self):
        prior=checkpoint('Example 2h Missed call')
        before=copy.deepcopy(prior)
        self.assertEqual(selected_changes(inventory('Example 3h Missed call'),prior,25),([],0))
        self.assertEqual(prior,before)

    def test_age_reset_and_changed_preview_are_selected(self):
        for label in ['Example 1m Missed call','Example 3h New message','Other 3h Missed call']:
            with self.subTest(label=label):
                chosen,total=selected_changes(inventory(label),checkpoint('Example 2h Missed call'),25)
                self.assertEqual(total,1);self.assertEqual(chosen[0]['label'],label)

    def test_identical_preview_is_rechecked_after_fifteen_minutes(self):
        for label in ['Example 2h Missed call','Example 3h Missed call']:
            chosen,total=selected_changes(inventory(label),checkpoint('Example 2h Missed call','2026-10-22T03:45:00.000Z'),25)
            self.assertEqual(total,1);self.assertEqual(chosen[0]['label'],label)

    def test_legacy_relative_checkpoints_get_one_safe_refresh(self):
        prior={'records':{CID:{'label':'Example 2h Missed call'}}}
        self.assertEqual(selected_changes(inventory('Example 3h Missed call'),prior,25)[1],1)

    def test_new_activity_precedes_periodic_rechecks(self):
        old=checkpoint('Example 2h Missed call','2026-10-22T03:00:00.000Z')
        fresh={'conversation_id':'prv_'+'B'*26,'label':'New caller 1m Incoming call'}
        inv=inventory('Example 3h Missed call');inv['records'].append(fresh)
        chosen,total=selected_changes(inv,old,1)
        self.assertEqual(total,2);self.assertEqual(chosen,[fresh])

class FinishBudgetTests(unittest.TestCase):
    def test_capture_budget_includes_preparation_before_import_and_readback(self):
        # A real 150-second Linux pass had ~97 seconds after one 21-second
        # thread, then spent the finishing reserve trying another slow thread.
        # Model the calls/SQLite work that still occur before begin_import.
        for budget in (145,150):
            with self.subTest(budget=budget):
                remaining=[budget-32.0]
                attempted=[]
                def read_one(cid):
                    attempted.append(cid)
                    timeout=capture_timeout({'beside_capture_backend':'linux'},remaining[0],reserve_seconds=FINISH_RESERVE_SECONDS)
                    if len(attempted)==1:
                        remaining[0]-=21.2
                        return {'conversation_id':cid}
                    remaining[0]-=timeout
                    raise ScanError('CAPTURE_INCOMPLETE')
                captures,failures=read_threads([{'conversation_id':'prv_'+letter*26} for letter in 'AB'],
                    read_one,lambda:remaining[0],lambda:None,reserve_seconds=FINISH_RESERVE_SECONDS)
                # checking progress, first baseline, archive/plan and latest baseline
                for seconds in (3,3,6,3):remaining[0]-=seconds
                def importing_progress():remaining[0]-=12
                timeout=begin_import(lambda:remaining[0],importing_progress)
                self.assertEqual(len(captures),1)
                self.assertEqual(failures,[])
                self.assertEqual(len(attempted),1)
                self.assertGreater(timeout,0)
                remaining[0]-=timeout
                self.assertGreaterEqual(remaining[0],READBACK_RESERVE_SECONDS)
                # verifying progress, complete baseline, completion and proof writes
                for seconds in (12,12,12,2):remaining[0]-=seconds
                self.assertGreaterEqual(remaining[0],0)

    def test_no_changed_previews_still_sample_one_oldest_thread_without_card_write(self):
        other='prv_'+'B'*26
        inv={'records':[{'conversation_id':CID,'label':'Example 2h Missed call'},
                        {'conversation_id':other,'label':'Other 3h Missed call'}]}
        prior={'records':{CID:{'checked_at':'2026-10-22T03:59:00Z'},other:{'checked_at':'2026-10-22T03:55:00Z'}}}
        chosen=sample_when_unchanged(inv,prior,[])
        self.assertEqual(chosen,[inv['records'][1]])
        item={'concern':'Missed call'}
        projected=source_review({'conversation_id':other},AT,item,{'concern':'Earlier source'},None,capture_fields_fingerprint(item))
        self.assertFalse(projected['include_in_dashboard'])
        self.assertEqual(sample_when_unchanged(inv,prior,[inv['records'][0]]),[inv['records'][0]])
        self.assertEqual(capture_change_count(chosen,{'proposed':{'new':[],'updated':[]}},True),0)
        # Same preview may conceal new thread facts; completion must cover a real update.
        self.assertEqual(capture_change_count(chosen,{'proposed':{'new':[],'updated':['one updated card']}},True),1)

    def test_default_runner_budget_can_finish_after_observed_setup(self):
        # The measured readiness/inventory setup took ~32 seconds. Reserving
        # preparation too makes a 40-second setup + 35-second read infeasible
        # under the standalone 145-second budget; that case must defer below.
        remaining=[inspect.signature(run).parameters['budget_seconds'].default-32]
        def read_one(cid):remaining[0]-=30;return {'conversation_id':cid}
        captures,failures=read_threads([{'conversation_id':CID}],read_one,lambda:remaining[0],lambda:None,reserve_seconds=FINISH_RESERVE_SECONDS)
        self.assertEqual(len(captures),1);self.assertEqual(failures,[])
        self.assertGreater(begin_import(lambda:remaining[0],lambda:None),0)

    def test_long_setup_does_not_start_an_unfinishable_standalone_read(self):
        remaining=[145-40]
        read_one=mock.Mock();progress=mock.Mock()
        selected=[{'conversation_id':CID}]
        captures,failures=read_threads(selected,read_one,lambda:remaining[0],progress,reserve_seconds=FINISH_RESERVE_SECONDS)
        self.assertEqual(captures,[]);self.assertEqual(failures,[])
        read_one.assert_not_called();progress.assert_not_called()
        with self.assertRaisesRegex(ScanError,'CAPTURE_INCOMPLETE'):
            require_captured_changes(selected,captures)

    def test_stops_new_thread_reads_with_finishing_reserve_intact(self):
        remaining=[110.0]
        rows=[{'conversation_id':'prv_'+letter*26} for letter in 'ABC']
        def read_one(cid):remaining[0]-=30;return {'conversation_id':cid}
        captures,failures=read_threads(rows,read_one,lambda:remaining[0],lambda:None,reserve_seconds=FINISH_RESERVE_SECONDS)
        self.assertEqual(len(captures),1)
        self.assertEqual(failures,[])
        self.assertGreaterEqual(remaining[0],FINISH_RESERVE_SECONDS)
        self.assertEqual(len(rows)-len(captures),2)

    def test_long_linux_read_timeout_cannot_consume_finishing_reserve(self):
        timeout=capture_timeout({'beside_capture_backend':'linux'},110,reserve_seconds=FINISH_RESERVE_SECONDS)
        self.assertEqual(timeout,32)
        self.assertGreaterEqual(110-timeout,FINISH_RESERVE_SECONDS)

    def test_preparation_allowance_does_not_raise_the_import_gate(self):
        remaining=[60.0]
        def progress():remaining[0]-=12
        timeout=begin_import(lambda:remaining[0],progress)
        self.assertEqual(timeout,10)
        self.assertEqual(remaining[0]-timeout,READBACK_RESERVE_SECONDS)

    def test_low_budget_refuses_before_import_phase_or_sender(self):
        progress=mock.Mock();sender=mock.Mock()
        phase='checking'
        with self.assertRaisesRegex(ScanError,'CAPTURE_INCOMPLETE'):
            begin_import(lambda:59,progress)
            phase='importing';sender()
        self.assertEqual(phase,'checking');progress.assert_not_called();sender.assert_not_called()

    def test_import_timeout_preserves_readback_budget_after_progress(self):
        remaining=[80.0]
        def progress():remaining[0]-=12
        timeout=begin_import(lambda:remaining[0],progress)
        self.assertGreater(timeout,0)
        self.assertGreaterEqual(remaining[0]-timeout,READBACK_RESERVE_SECONDS)

    def test_zero_captured_changed_threads_cannot_complete(self):
        complete=mock.Mock()
        with self.assertRaisesRegex(ScanError,'CAPTURE_INCOMPLETE'):
            require_captured_changes([{'conversation_id':CID}],[])
            complete()
        complete.assert_not_called()

if __name__=='__main__':unittest.main()
