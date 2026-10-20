import tempfile
import unittest
from datetime import datetime, timezone
import beside_alerts as A

NOW=datetime(2026,10,19,15,0,tzinfo=timezone.utc)
CFG={'followup':{'enabled':True,'tony_push_url':'https://ntfy.example/t','raj_push_url':'https://ntfy.example/r','start_at':'2026-10-01T00:00:00Z'},
     'beside_alerts':{'enabled':True}}

class AlertTests(unittest.TestCase):
    def test_off_by_default(self):
        sent=[]
        out=A.run({'followup':CFG['followup']},{'ok':False,'error':'BROWSER_UNAVAILABLE'},tempfile.mkdtemp(),NOW,lambda u,m:sent.append(u) or True)
        self.assertFalse(out['enabled']);self.assertEqual(sent,[])
    def test_classify(self):
        self.assertEqual(A.classify({'ok':False,'error':'BROWSER_UNAVAILABLE','source_read_failure':'Beside window unavailable'}),'beside_window_unavailable')
        self.assertEqual(A.classify({'ok':False,'source_read_failure':'Expected signed-in Beside account/mailbox unavailable'}),'beside_signed_out')
        self.assertEqual(A.classify({'ok':False,'source_read_failure':'Visible inventory absent or exceeds bound'}),'beside_inventory_unavailable')
        self.assertIsNone(A.classify({'enabled':False,'fresh_scan_performed':False}))
        self.assertIsNone(A.classify({'ok':True}))
    def test_one_push_per_episode_and_rearm(self):
        d=tempfile.mkdtemp();sent=[];post=lambda u,m:sent.append((u,m['body'])) or True
        bad={'ok':False,'error':'BROWSER_UNAVAILABLE','source_read_failure':'Beside window unavailable'}
        A.run(CFG,bad,d,NOW,post);A.run(CFG,bad,d,NOW,post)
        self.assertEqual(len(sent),1);self.assertEqual(sent[0][0],'https://ntfy.example/r')
        A.run(CFG,{'ok':True},d,NOW,post);A.run(CFG,bad,d,NOW,post)
        self.assertEqual(len(sent),2)
    def test_validation_failures_need_repeats(self):
        state={};s={'validation_failures_before_alert':3}
        bad={'ok':False,'error':'CAPTURE_INCOMPLETE'}
        for i in range(2):
            alerts,state=A.plan(bad,state,NOW,s);self.assertEqual(alerts,[])
        alerts,state=A.plan(bad,state,NOW,s);self.assertEqual([c for c,_ in alerts],['beside_validation_failed'])
    def test_zero_new_business_hours(self):
        s={'zero_new_business_hours':4,'shop_hours':{'mon':['08:00','17:00']}}
        state={'last_new_at':'2026-10-19T12:00:00+00:00'}   # 08:00 ET Monday
        alerts,state=A.plan({'ok':True,'fresh_scan_performed':True,'counts':{}},state,datetime(2026,10,19,15,30,tzinfo=timezone.utc),s)
        self.assertEqual(alerts,[])
        alerts,state=A.plan({'ok':True,'fresh_scan_performed':True,'counts':{}},state,datetime(2026,10,19,16,30,tzinfo=timezone.utc),s)
        self.assertEqual([c for c,_ in alerts],['beside_zero_new'])
        alerts,_=A.plan({'ok':True},state,datetime(2026,10,19,17,0,tzinfo=timezone.utc),s)
        self.assertEqual(alerts,[])
    def test_business_hours_skip_closed_days(self):
        h={'mon':['08:00','17:00']}
        self.assertAlmostEqual(A.business_hours_between(datetime(2026,10,17,12,tzinfo=timezone.utc),datetime(2026,10,19,14,tzinfo=timezone.utc),h),2.0)
    def test_no_customer_data_in_message(self):
        m=A.message('beside_signed_out','x');self.assertNotIn('phone',m['body'].lower())

if __name__=='__main__':unittest.main()
