import io
import json
import tempfile
import unittest
from pathlib import Path
from urllib import error
import beside_intake as I

URL='https://intake.example/hooks/lead/beside/'+'t'*32
ITEM={'id':'prv_'+'A'*26,'name':'Name not provided','phone':'+12395550100','vehicle':'','concern':'Brakes grinding','received_at':'2026-10-17T03:05:00.000Z'}

class Resp(io.BytesIO):
    status=200
    def __enter__(self):return self
    def __exit__(self,*a):return False
class Opener:
    def __init__(self,fail=None):self.sent=[];self.fail=fail
    def open(self,req,timeout=None):
        self.sent.append(json.loads(req.data))
        if self.fail:raise self.fail
        return Resp(b'{"ok":true}')

class IntakeTests(unittest.TestCase):
    def setUp(self):self.state=Path(tempfile.mkdtemp())/'posted.json'
    def test_off_by_default(self):
        o=Opener();self.assertEqual(I.post_new([ITEM],set(),{},self.state,o),{'enabled':False});self.assertEqual(o.sent,[])
    def test_rejects_bad_url(self):
        with self.assertRaises(ValueError):I.hook_url({'beside_intake_post_enabled':True,'beside_intake_hook_url':'http://x/hooks/lead/beside/short'})
    def test_payload_and_once_only(self):
        o=Opener();s={'beside_intake_post_enabled':True,'beside_intake_hook_url':URL}
        out=I.post_new([ITEM],set(),s,self.state,o)
        self.assertEqual(out['posted'],1)
        p=o.sent[0]
        self.assertEqual((p['source'],p['event_id'],p['occurred_at'],p['type'],p['name']),('beside',ITEM['id'],ITEM['received_at'],'call','Beside caller'))
        I.post_new([ITEM],set(),s,self.state,o);self.assertEqual(len(o.sent),1)
    def test_text_kind_and_known_skipped(self):
        o=Opener();s={'beside_intake_post_enabled':True,'beside_intake_hook_url':URL}
        I.post_new([dict(ITEM,source='beside_text')],set(),s,self.state,o);self.assertEqual(o.sent[0]['type'],'text')
        o2=Opener();I.post_new([dict(ITEM,id='prv_'+'B'*26)],{'beside:chat:prv_'+'B'*26},s,self.state,o2);self.assertEqual(o2.sent,[])
    def test_failure_stays_pending_and_409_is_final(self):
        s={'beside_intake_post_enabled':True,'beside_intake_hook_url':URL}
        out=I.post_new([ITEM],set(),s,self.state,Opener(error.URLError('down')));self.assertEqual(out['failed'],1)
        out=I.post_new([ITEM],set(),s,self.state,Opener(error.HTTPError(URL,409,'conflict',{},None)));self.assertEqual(out['posted'],1)

if __name__=='__main__':unittest.main()
