import re
import unittest
import beside_uia as uia
from test_beside_uia import capture, node, bind_samples

def two_message_capture(second='Can you look at my brakes?'):
    value=capture()
    nodes=value['nodes']
    # header, 9:40 PM (Yesterday) call recap, then 11:05 PM text, day separator after both.
    nodes[2:2]=[node('ControlType.Text','9:40 PM'),node('ControlType.Text','Missed call - Voicemail transcribed')]
    nodes[5]=node('ControlType.Text',second)
    return bind_samples(value)

class MessageTimeTests(unittest.TestCase):
    def test_default_output_unchanged(self):
        out=uia.conversation(two_message_capture(),'a'*64)
        self.assertNotIn('source',out);self.assertNotIn('messages',out)
    def test_earliest_message_time_and_call_kind(self):
        out=uia.conversation(two_message_capture(),'a'*64,details=True)
        self.assertEqual(out['received_at'],'2026-10-17T01:40:00.000Z')
        self.assertEqual(out['updated_at'],'2026-10-17T03:05:00.000Z')
        self.assertEqual(out['source'],'beside_call')
        self.assertEqual([m['kind'] for m in out['messages']],['call','text'])
    def test_text_only_thread(self):
        out=uia.conversation(capture(),'a'*64,details=True)
        self.assertEqual(out['source'],'beside_text');self.assertEqual(len(out['messages']),1)
        self.assertIsNone(out['updated_at'])
    def test_custom_markers(self):
        out=uia.conversation(capture(),'a'*64,details=True,call_markers=re.compile('brakes',re.I))
        self.assertEqual(out['source'],'beside_call')

if __name__=='__main__':unittest.main()
