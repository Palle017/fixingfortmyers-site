import unittest
from datetime import datetime, timezone
from beside_schedule import auto_scan_reason, in_shop_hours, newest_unseen

HOURS={'mon':['08:00','17:00'],'sat':['09:00','13:00']}
MON_10ET=datetime(2026,10,19,14,0,tzinfo=timezone.utc)   # 10:00 EDT Monday
MON_18ET=datetime(2026,10,19,22,0,tzinfo=timezone.utc)
SUN=datetime(2026,10,18,15,0,tzinfo=timezone.utc)
INV={'records':[{'conversation_id':'prv_'+'A'*26,'label':'Caller 5m new'}]}

class ScheduleTests(unittest.TestCase):
    def test_off_by_default(self):
        self.assertIsNone(auto_scan_reason(MON_10ET,{},{}, INV,{}))
        self.assertIsNone(auto_scan_reason(MON_10ET,{'beside_auto_scan_minutes':0,'beside_shop_hours':HOURS},{}))
    def test_requires_shop_hours(self):
        s={'beside_auto_scan_minutes':15}
        self.assertIsNone(auto_scan_reason(MON_10ET,s,{}))
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

if __name__=='__main__':unittest.main()
