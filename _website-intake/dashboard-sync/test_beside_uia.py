import copy
import math
import unittest
import beside_uia as uia

CID='prv_'+'A'*26

def node(role,name,left=800,width=120,value=None):
    return {'role':role,'name':name,'left':left,'width':width,'value':value}

def capture(title='(239) 555-0100',day='Yesterday',clock='11:05 PM'):
    return {'format':'beside-uia-thread/v1','conversation_id':CID,
        'source_url':'https://app.beside.com/chats/'+CID,
        'observed_at':'2026-10-17T04:32:00.123Z','nodes':[
          node('ControlType.Hyperlink','Sidebar data must not leak',left=10,width=500,value='https://app.beside.com/chats/'+CID),
          node('ControlType.Text',title),node('ControlType.Text',clock),
          node('ControlType.Text','Customer asks about brakes.'),
          node('ControlType.Text',day),node('ControlType.Edit','UNSENT PRIVATE DRAFT'),
          node('ControlType.Text','Hidden source',left=float('inf'))]}

class CaptureTests(unittest.TestCase):
    def test_exact_context_and_native_phone(self):
        out=uia.conversation(capture(),'a'*64)
        self.assertEqual(out['phone'],'+12395550100')
        self.assertEqual(out['name'],'Name not provided')
        self.assertEqual(out['received_at'],'2026-10-17T03:05:00.000Z')
        self.assertNotIn('Sidebar',out['concern'])
        self.assertNotIn('UNSENT',out['concern'])
        self.assertNotIn('Hidden source',out['concern'])
        self.assertIsNone(out['updated_at'])
    def test_named_person_does_not_get_phone_from_ai_recap(self):
        value=capture('Maybe: Example')
        value['nodes'].insert(4,node('ControlType.Text','AI recap: Phone Number: +12395550999'))
        out=uia.conversation(value,'b'*64)
        self.assertEqual(out['phone'],'')
        self.assertEqual(out['name'],'Maybe: Example')
    def test_provider_contact_url_does_not_become_conversation_id(self):
        value=capture();value['source_url']='https://app.beside.com/contacts'
        with self.assertRaises(uia.CaptureError):uia.conversation(value,'c'*64)
    def test_missing_sidebar_refuses_guessing_content(self):
        value=capture();value['nodes']=value['nodes'][1:]
        with self.assertRaises(uia.CaptureError):uia.conversation(value,'c'*64)
    def test_incomplete_date_is_not_capture_time(self):
        with self.assertRaises(uia.CaptureError):uia.conversation(capture(day='Recent'),'c'*64)
    def test_clock_without_offset_capture_is_rejected(self):
        value=capture();value['observed_at']='2026-10-17T04:32:00'
        with self.assertRaises(uia.CaptureError):uia.conversation(value,'c'*64)
    def test_october_date_is_in_current_year(self):
        out=uia.conversation(capture(day='Oct 15',clock='10:12 PM'),'c'*64)
        self.assertEqual(out['received_at'],'2026-10-16T02:12:00.000Z')
    def test_future_clock_is_rejected(self):
        with self.assertRaises(uia.CaptureError):uia.conversation(capture(day='Today'),'c'*64)
    def test_raw_nonfinite_bounds_sanitized_without_mutation(self):
        before=capture();out=uia.conversation(before,'d'*64)
        self.assertIsNone(out['raw']['capture']['nodes'][-1]['left'])
        self.assertTrue(math.isinf(before['nodes'][-1]['left']))
    def test_automatic_projection_is_always_uncertain_review(self):
        decision=uia.generic_review(capture(),'2026-10-17T04:32:00.123Z')
        self.assertEqual(decision['classification'],'uncertain')
        self.assertTrue(decision['include_in_dashboard'])
        self.assertNotIn('outcome',decision)
        self.assertNotIn('stage',decision)
    def test_no_unrecognized_conversation_identity(self):
        value=capture();value['conversation_id']='invented'
        with self.assertRaises(uia.CaptureError):uia.conversation(value,'c'*64)

if __name__=='__main__':unittest.main()
