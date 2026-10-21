import unittest
from datetime import datetime, timezone
from beside_schedule import attention_scan_allowed, auto_scan_reason, in_shop_hours, newest_unseen

HOURS={'mon':['08:00','17:00'],'sat':['09:00','13:00']}
MON_10ET=datetime(2026,10,19,14,0,tzinfo=timezone.utc)   # 10:00 EDT Monday
MON_18ET=datetime(2026,10,19,22,0,tzinfo=timezone.utc)
SUN=datetime(2026,10,18,15,0,tzinfo=timezone.utc)
INV={'records':[{'conversation_id':'prv_'+'A'*26,'label':'Caller 5m new'}]}

class ScheduleTests(unittest.TestCase):
    def test_off_by_default(self):
        self.assertIsNone(auto_scan_reason(MON_10ET,{},{}, INV,{}))
        self.assertIsNone(auto_scan_reason(MON_10ET,{'beside_auto_scan_minutes':0,'beside_shop_hours':HOURS},{}))
    def test_unset_shop_hours_means_any_hour(self):
        s={'beside_auto_scan_minutes':15}
        self.assertEqual(auto_scan_reason(MON_10ET,s,{}),'interval')
        self.assertEqual(auto_scan_reason(SUN,s,{}),'interval')
        self.assertEqual(auto_scan_reason(MON_18ET,{**s,'beside_shop_hours':None},{}),'interval')
    def test_shop_hours_limit_when_set(self):
        s={'beside_auto_scan_minutes':15}
        s['beside_shop_hours']=HOURS
        self.assertEqual(auto_scan_reason(MON_10ET,s,{}),'interval')
        self.assertIsNone(auto_scan_reason(MON_18ET,s,{}))
        self.assertIsNone(auto_scan_reason(SUN,s,{}))
    def test_interval(self):
        s={'beside_auto_scan_minutes':15,'beside_shop_hours':HOURS}
        self.assertIsNone(auto_scan_reason(MON_10ET,s,{'last_requested_at':'2026-10-19T13:50:00Z'}))
        self.assertEqual(auto_scan_reason(MON_10ET,s,{'last_requested_at':'2026-10-19T13:45:00Z'}),'interval')
    def test_newest_unseen_triggers_early_but_not_every_run(self):
        s={'beside_auto_scan_minutes':15,'beside_shop_hours':HOURS}
        self.assertEqual(auto_scan_reason(MON_10ET,s,{'last_requested_at':'2026-10-19T13:55:00Z'},INV,{'records':{}}),'newest_unseen')
        self.assertIsNone(auto_scan_reason(MON_10ET,s,{'last_requested_at':'2026-10-19T13:59:30Z'},INV,{'records':{}}))
        seen={'records':{INV['records'][0]['conversation_id']:INV['records'][0]}}
        self.assertIsNone(auto_scan_reason(MON_10ET,s,{'last_requested_at':'2026-10-19T13:55:00Z'},INV,seen))
    def test_helpers(self):
        self.assertTrue(in_shop_hours(MON_10ET,HOURS));self.assertFalse(in_shop_hours(MON_10ET,None))
        self.assertFalse(newest_unseen({'records':[]},{}))
        self.assertTrue(newest_unseen(INV,{'records':{INV['records'][0]['conversation_id']:{'label':'old'}}}))

class AttentionRuleTests(unittest.TestCase):
    ST={'status':'attention','jobId':'job-1'}
    OLD={'attention_job':'job-1','attention_since':'2026-10-19T12:00:00Z'}
    def test_stale_attention_without_import_allows_scan(self):
        self.assertEqual(attention_scan_allowed(MON_10ET,self.ST,self.OLD,{'found':True,'import_attempted':False}),(True,'attention_stale_no_import'))
    def test_recent_attention_blocks(self):
        recent={'attention_job':'job-1','attention_since':'2026-10-19T13:30:00Z'}
        self.assertEqual(attention_scan_allowed(MON_10ET,self.ST,recent,{'found':True,'import_attempted':False})[1],'attention_recent')
        self.assertEqual(attention_scan_allowed(MON_10ET,self.ST,{},{'found':True})[1],'attention_recent')
        other={'attention_job':'job-0','attention_since':'2026-10-19T00:00:00Z'}
        self.assertEqual(attention_scan_allowed(MON_10ET,self.ST,other,{'found':True})[1],'attention_recent')
    def test_import_attempt_or_unknown_job_stays_blocked(self):
        self.assertEqual(attention_scan_allowed(MON_10ET,self.ST,self.OLD,{'found':True,'import_attempted':True}),(False,'attention_import_needs_review'))
        self.assertEqual(attention_scan_allowed(MON_10ET,self.ST,self.OLD,{'found':False}),(False,'attention_job_not_local'))
    def test_threshold_and_non_attention(self):
        self.assertFalse(attention_scan_allowed(MON_10ET,self.ST,self.OLD,{'found':True},stale_minutes=600)[0])
        self.assertEqual(attention_scan_allowed(MON_10ET,{'status':'idle'},self.OLD,{'found':True})[1],'not_attention')

if __name__=='__main__':unittest.main()
