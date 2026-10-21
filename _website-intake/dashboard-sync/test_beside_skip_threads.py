import unittest
from beside_refresh_runner import ScanError, read_threads

ROWS=[{'conversation_id':'prv_'+c*26} for c in 'ABCDE']
def reader(bad):
    def read(cid):
        if cid in bad:raise ScanError('BROWSER_UNAVAILABLE')
        return {'conversation_id':cid}
    return read

class SkipTests(unittest.TestCase):
    def test_default_stops_at_first_failure(self):
        caps,fails=read_threads(ROWS,reader({ROWS[1]['conversation_id']}),lambda:100,lambda:None,sleep=lambda d:None)
        self.assertEqual(len(caps),1);self.assertEqual(fails,[ROWS[1]['conversation_id']])
    def test_skip_and_continue_with_backoff(self):
        delays=[]
        bad={ROWS[1]['conversation_id'],ROWS[3]['conversation_id']}
        caps,fails=read_threads(ROWS,reader(bad),lambda:100,lambda:None,skip_failed=True,sleep=delays.append)
        self.assertEqual([c['conversation_id'] for c in caps],[ROWS[i]['conversation_id'] for i in (0,2,4)])
        self.assertEqual(len(fails),2);self.assertEqual(delays,[0.5,1.0])
    def test_failure_cap(self):
        caps,fails=read_threads(ROWS,reader({r['conversation_id'] for r in ROWS}),lambda:100,lambda:None,skip_failed=True,max_failures=2,sleep=lambda d:None)
        self.assertEqual(caps,[]);self.assertEqual(len(fails),2)
    def test_budget_respected(self):
        caps,fails=read_threads(ROWS,reader({ROWS[0]['conversation_id']}),lambda:35.2,lambda:None,skip_failed=True,sleep=lambda d:None)
        self.assertEqual(caps,[]);self.assertEqual(len(fails),1)

if __name__=='__main__':unittest.main()
