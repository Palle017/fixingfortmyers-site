import copy
import json
from pathlib import Path
import tempfile
import unittest
import reconcile_dashboard as check


def row(source, key):
    return {'id':source+':'+key,'source':source,'source_id':key,'name':'Synthetic','phone':'2395550100','email':'',
        'vehicle':'Synthetic vehicle','concern':'Synthetic repair problem','source_status':'new',
        'source_updated_at':'2026-10-15T10:00:00Z','received_at':'2026-10-15T09:00:00Z',
        'stage':'current_review','notes':'Owner note stays private'}

def baseline(rows):
    return {'complete':True,'limit':1000,'leads':rows,'sources':[]}

class ReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.rows=[row('website','web1'),row('beside','chat:b1'),row('beside-history','hist1')]
        self.events=[{'id':'web1','root_id':'web1','payload':{'name':'Synthetic','phone':'2395550100','vehicle':'Synthetic vehicle','details':'Synthetic repair problem','ownerTest':True}}]
        self.before=baseline(copy.deepcopy(self.rows))
    def check(self,rows=None,events=None):
        return check.compare(self.events if events is None else events,baseline(self.rows if rows is None else rows),self.before)
    def test_exact_ids_and_fields(self):
        result=self.check();self.assertTrue(result['delivery_ok']);self.assertEqual(result['website']['matched'],1)
        self.assertEqual(result['website']['owner_tests'],1);self.assertEqual(result['beside']['saved_cards'],1)
    def test_missing_website_fails(self):
        result=self.check(self.rows[1:]);self.assertFalse(result['delivery_ok']);self.assertEqual(result['website']['missing_ids'],['website:web1'])
    def test_missing_beside_fails(self):
        result=self.check([self.rows[0],self.rows[2]]);self.assertFalse(result['delivery_ok']);self.assertEqual(result['beside']['missing_ids'],['beside:chat:b1'])
    def test_duplicate_ids_rejected(self):
        with self.assertRaises(check.CheckError):self.check(self.rows+[self.rows[0]])
    def test_wrong_identity_rejected(self):
        self.rows[0]['id']='website:wrong'
        with self.assertRaises(check.CheckError):self.check()
    def test_truncated_baseline_rejected(self):
        self.before['complete']=False
        with self.assertRaises(check.CheckError):self.check()
    def test_limit_baseline_rejected(self):
        self.before['limit']=3
        with self.assertRaises(check.CheckError):self.check()
    def test_linked_voice_is_not_second_request(self):
        result=self.check(events=self.events+[{'id':'voice1','root_id':'web1','payload':{}}])
        self.assertEqual(result['website']['source_requests'],1);self.assertEqual(result['website']['linked_events'],1)
    def test_orphan_linked_event_rejected(self):
        with self.assertRaises(check.CheckError):self.check(events=self.events+[{'id':'voice1','root_id':'wrong','payload':{}}])
    def test_problem_loss_detected(self):
        self.rows[0]['concern']='';self.assertFalse(self.check()['delivery_ok'])
    def test_beside_source_regression_detected(self):
        self.rows[1]['vehicle']='';self.assertFalse(self.check()['delivery_ok'])
    def test_newer_enrichment_allowed_but_blank_loss_not(self):
        self.rows[1]['source_updated_at']='2026-10-16T10:00:00Z';self.rows[1]['concern']='Newer verified details'
        self.assertTrue(self.check()['delivery_ok']);self.rows[1]['phone']='';self.assertFalse(self.check()['delivery_ok'])
    def test_owner_decisions_not_compared_or_mutated(self):
        self.rows[1]['stage']='completed';self.rows[1]['notes']='New owner note'
        before=copy.deepcopy(self.rows);self.assertTrue(self.check()['delivery_ok']);self.assertEqual(before,self.rows)
    def test_compare_does_not_modify_source_data(self):
        before=copy.deepcopy((self.rows,self.events,self.before));self.check()
        self.assertEqual(before,(self.rows,self.events,self.before))

class AuthorityTests(unittest.TestCase):
    def test_browser_refresh_owns_beside_status(self):
        import sync_dashboard as sync
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'config.json'
            path.write_text(json.dumps({'url':'https://example.invalid','service_token':'synthetic-service-token','sync_token':'synthetic-sync-token','website_source_authority':'cloud','beside_source_authority':'browser_refresh'}))
            config=sync.read_config(path)
            snapshot={'leads':[{'id':'preserved'}],'sources':[{'id':x} for x in ['website','beside','beside-history','zoho']]}
            result=sync.apply_source_authorities(snapshot,config)
            self.assertEqual(result['leads'],snapshot['leads']);self.assertEqual([x['id'] for x in result['sources']],['beside-history','zoho'])
    def test_existing_zoho_authority_kept(self):
        import sync_dashboard as sync
        data={'leads':[],'sources':[{'id':'beside'}]}
        self.assertEqual(sync.apply_source_authorities(data,{'beside_source_authority':'zoho_adapter'})['sources'],[])

class TimestampTests(unittest.TestCase):
    def test_published_timestamp_roundtrips_javascript_milliseconds(self):
        value=check.utc_millis()
        self.assertRegex(value,r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$')
        instant=check.instant(value)
        self.assertEqual(instant.microsecond % 1000,0)
        saved=instant.isoformat(timespec='milliseconds').replace('+00:00','Z')
        expected={'name':'Beside saved scans','status':'historical','record_count':19,'detail':'Synthetic','observed_at':value}
        self.assertTrue(check.metadata_matches({**expected,'observed_at':saved},expected))
    def test_true_millisecond_difference_is_still_rejected(self):
        expected={'name':'Beside saved scans','status':'historical','record_count':19,'detail':'Synthetic','observed_at':'2026-10-17T04:08:09.798Z'}
        self.assertFalse(check.metadata_matches({**expected,'observed_at':'2026-10-17T04:08:09.799Z'},expected))

    def test_equivalent_utc_spellings_match(self):
        expected={'name':'Beside saved scans','status':'historical','record_count':19,'detail':'Synthetic','observed_at':'2026-10-16T12:00:00+00:00'}
        saved={**expected,'observed_at':'2026-10-16T12:00:00.000Z'}
        self.assertTrue(check.metadata_matches(saved,expected))
    def test_different_instants_do_not_match(self):
        self.assertNotEqual(check.instant('2026-10-16T12:00:00Z'),check.instant('2026-10-16T12:01:00Z'))
    def test_offsets_are_compared_chronologically(self):
        self.assertLess(check.instant('2026-10-16T13:00:00+02:00'),check.instant('2026-10-16T12:00:00Z'))
    def test_historical_dates_remain_supported(self):
        self.assertEqual(check.instant('2026-09-26'),check.instant('2026-09-26T00:00:00Z'))
    def test_ambiguous_datetime_rejected(self):
        with self.assertRaises(check.CheckError):check.instant('2026-10-16T12:00:00')

class ActiveScanTests(unittest.TestCase):
    def test_active_scan_owns_source_descriptor(self):
        for status in ('queued','running'):
            self.assertFalse(check.metadata_publish_allowed(True,{'status':status}))
    def test_completed_scan_can_publish(self):
        self.assertTrue(check.metadata_publish_allowed(True,{'status':'complete'}))
        self.assertFalse(check.metadata_publish_allowed(False,{'status':'complete'}))


class CompletedProofOwnerTests(unittest.TestCase):
    PROOF={'plan_sha256':'a'*64,'after_sha256':'b'*64,'captured_at':'2026-10-21T09:02:40.000Z'}
    def test_matching_receipt_is_local(self):
        r={'planSha256':'a'*64,'afterSha256':'b'*64,'capturedAt':'2026-10-21T09:02:40.000Z'}
        self.assertEqual(check.completed_proof_owner(r,self.PROOF,True),'local')
    def test_windows_refresh_disabled_accepts_other_worker(self):
        r={'planSha256':'c'*64,'afterSha256':'d'*64,'capturedAt':'2026-10-22T00:17:56.069Z'}
        self.assertEqual(check.completed_proof_owner(r,self.PROOF,False),'other_worker')
    def test_enabled_accepts_only_a_newer_other_job(self):
        newer={'planSha256':'c'*64,'afterSha256':'d'*64,'capturedAt':'2026-10-22T00:17:56.069Z'}
        self.assertEqual(check.completed_proof_owner(newer,self.PROOF,True),'other_worker')
        same_time={'planSha256':'c'*64,'afterSha256':'d'*64,'capturedAt':'2026-10-21T09:02:40.000Z'}
        with self.assertRaises(check.CheckError):check.completed_proof_owner(same_time,self.PROOF,True)
        with self.assertRaises(check.CheckError):check.completed_proof_owner({},self.PROOF,True)

if __name__=='__main__':unittest.main()
