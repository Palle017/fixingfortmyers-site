"""Synthetic acquisition failures cannot be reported as completed refreshes."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import beside_refresh_runner as R
from test_beside_runner_reliability import Fixture, CID, REQUESTED

OTHER = 'prv_' + 'B' * 26
ROWS = [{'conversation_id': CID}, {'conversation_id': OTHER}]


class AcquisitionIntegrityTests(unittest.TestCase):
    def test_partial_acquisition_failure_is_incomplete_even_with_saved_capture(self):
        with self.assertRaisesRegex(R.ScanError, 'CAPTURE_INCOMPLETE'):
            R.require_captured_changes(ROWS, [{'conversation_id': CID}], failures=[OTHER])

    def test_normalization_failure_is_incomplete_even_with_another_parsed_item(self):
        with self.assertRaisesRegex(R.ScanError, 'CAPTURE_INCOMPLETE'):
            R.require_captured_changes(ROWS, [{'id': CID}], held=[OTHER])

    def test_sparse_genuine_capture_is_not_rejected_for_missing_optional_fields(self):
        R.require_captured_changes([ROWS[0]], [{'id': CID, 'name': '', 'vehicle': '', 'concern': 'Can you check my car?'}],
                                   failures=[], held=[])

    def test_bounded_unattempted_rows_are_distinct_from_a_failed_source_read(self):
        R.require_captured_changes(ROWS, [{'conversation_id': CID}], failures=[], held=[])

    def test_partial_failure_never_imports_completes_or_advances_checkpoint(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = Fixture(root)
            original_sub = fixture.sub

            def capture_sub(args, **kwargs):
                result = original_sub(args, **kwargs)
                if args[0] == 'synthetic-capture' and args[1] == 'inventory':
                    output = Path(args[2])
                    value = json.loads(output.read_text())
                    value['records'].append({'conversation_id': OTHER, 'label': 'Second synthetic activity'})
                    output.write_text(json.dumps(value))
                return result

            fixture.sub = capture_sub

            def partial_read(selected, read_one, *args, **kwargs):
                saved = read_one(CID)
                return [saved], [OTHER]

            with mock.patch.object(R, 'read_threads', side_effect=partial_read):
                result = fixture.run()
            self.assertFalse(result['ok'], result)
            self.assertFalse(result['fresh_scan_performed'], result)
            self.assertEqual(result['error'], 'CAPTURE_INCOMPLETE')
            self.assertEqual(fixture.imports, 0)
            self.assertNotIn('complete', fixture.actions)
            self.assertIn('fail', fixture.actions)
            self.assertFalse((fixture.refresh / 'uia-checkpoint.json').exists())
            self.assertTrue(list(fixture.runs.glob('*/thread-' + CID + '.json')))
            self.assertTrue(list(fixture.runs.glob('*/selection-attempts.json')))
            self.assertEqual(result['coverage']['thread_read_failures'], 1)
            self.assertEqual(result['coverage']['rendered_thread_captures'], 1)


if __name__ == '__main__':
    unittest.main()
