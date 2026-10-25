"""Synthetic runner-to-archive metadata boundary; no provider or live receiver."""
import json
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock
import beside_refresh_runner as R
from test_beside_runner_reliability import Fixture

class ReviewBridgeTests(unittest.TestCase):
    def test_review_flag_reaches_archive_without_promoting_the_conversation(self):
        with tempfile.TemporaryDirectory() as root:
            fixture=Fixture(root)
            fixture.database=lambda:SimpleNamespace(backup=lambda other:None,close=lambda:None,
                execute=lambda query,*args:SimpleNamespace(fetchone=lambda:{'classification':'spam'} if 'SELECT classification' in query else None))
            flag={'requires_review':True,'reason':'changed_undated_contact_context','event_at':None,
                  'direction':'unknown','classification_preserved':'spam','content_sha256':'a'*64,
                  'content_comparison':'changed','basis':'rendered_source_not_owner_qualification'}
            with mock.patch.object(R,'suppressed_review_needed',return_value=flag):
                outcome=fixture.run()
            self.assertTrue(outcome['ok'])
            paths=list(fixture.runs.glob('*/canonical-snapshot.json'))
            self.assertEqual(len(paths),1)
            snapshot=json.loads(paths[0].read_text())
            self.assertEqual(snapshot['conversations'][0]['manual_review'],flag)
            decision=next(iter(json.loads(paths[0].with_name('review.json').read_text())['classifications'].values()))
            self.assertEqual(decision['classification'],'spam')
            self.assertFalse(decision['include_in_dashboard'])
            self.assertEqual(fixture.imports,0)

if __name__=='__main__':unittest.main()
