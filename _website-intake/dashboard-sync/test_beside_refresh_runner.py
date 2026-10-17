import copy
import unittest
from beside_refresh_runner import ScanError, selected_changes, preserve_known_fields

class SelectionTests(unittest.TestCase):
    def setUp(self):
        self.rows=[{'conversation_id':'prv_'+c*26,'label':'Exact preview '+c} for c in 'ABC']
        self.inventory={'records':self.rows}
    def test_changed_and_new_are_selected_without_hiding_unchanged(self):
        checkpoint={'records':{self.rows[0]['conversation_id']:self.rows[0],self.rows[1]['conversation_id']:{'label':'Old'}}}
        chosen,total=selected_changes(self.inventory,checkpoint,8)
        self.assertEqual(total,2);self.assertEqual(chosen,self.rows[1:])
    def test_bounded_pass_reports_total_unprocessed(self):
        chosen,total=selected_changes(self.inventory,{'records':{}},1)
        self.assertEqual(len(chosen),1);self.assertEqual(total,3)
    def test_empty_capture_is_not_success(self):
        with self.assertRaises(ScanError):selected_changes({'records':[]},{},8)
    def test_duplicate_ids_refused(self):
        with self.assertRaises(ScanError):selected_changes({'records':self.rows+[self.rows[0]]},{},8)
    def test_capture_does_not_mutate_checkpoint(self):
        checkpoint={'records':{}};before=copy.deepcopy(checkpoint)
        selected_changes(self.inventory,checkpoint,8);self.assertEqual(before,checkpoint)

class PreservationTests(unittest.TestCase):
    def test_unknown_capture_fields_preserve_known_contact_and_vehicle(self):
        old={'name':'Verified Name','phone':'+12395550100','email':'owner@example.invalid','vehicle':'Known vehicle','received_at':'2026-10-01T12:00:00Z','notes':'Private owner decision','stage':'completed'}
        incoming={'name':'Name not provided','phone':'','email':'','vehicle':'','received_at':'2026-10-17T04:00:00Z','concern':'New exact evidence'}
        out=preserve_known_fields(incoming,old)
        for key in ('name','phone','email','vehicle','received_at'):self.assertEqual(out[key],old[key])
        self.assertNotIn('stage',out);self.assertNotIn('notes',out)
        self.assertEqual(incoming['phone'],'')
    def test_explicit_native_observation_can_update_source_fact(self):
        old={'name':'Old name','phone':'+12395550100','received_at':'2026-10-01T12:00:00Z'}
        out=preserve_known_fields({'name':'New native label','phone':'+12395550200'},old)
        self.assertEqual(out['phone'],'+12395550200');self.assertEqual(out['name'],'New native label')
    def test_new_record_keeps_observed_activity_date(self):
        value={'name':'Native','received_at':'2026-10-17T00:00:00Z'}
        self.assertEqual(preserve_known_fields(value,None),value)

if __name__=='__main__':unittest.main()
