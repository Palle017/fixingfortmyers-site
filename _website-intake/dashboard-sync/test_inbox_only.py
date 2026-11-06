"""Inbox ownership regressions. Synthetic SQLite only; never contact a receiver."""
import copy
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest import mock

import sync_dashboard as sync
from beside_refresh_runner import source_review


AT = "2026-10-30T12:00:00.000Z"
FOLDER_FIELDS = {"folder", "folder_version", "folder_updated_at", "folder_updated_by"}


class InboxOnlyTests(unittest.TestCase):
    def test_repeated_source_snapshots_cannot_export_folder_decisions(self):
        with tempfile.TemporaryDirectory() as temporary:
            website, history = (Path(temporary) / name for name in ("website.db", "history.db"))
            with closing(sqlite3.connect(website)) as db, db:
                db.execute("CREATE TABLE leads(id,received_at,updated_at,kind,status,payload_json)")
                for index, text in enumerate(("spam junk unsubscribe", "", "Please call about brakes")):
                    payload = {"name": "Synthetic caller", "phone": "2025550100", "details": text,
                               "folder": "junk", "folder_version": "synthetic-import",
                               "folder_updated_at": AT, "folder_updated_by": "synthetic-importer"}
                    db.execute("INSERT INTO leads VALUES(?,?,?,?,?,?)",
                               (f"synthetic-{index}", AT, AT, "webform", "spam", json.dumps(payload)))
            with closing(sqlite3.connect(history)) as db, db:
                db.executescript("CREATE TABLE leads(id,source_id,document); CREATE TABLE audit(lead_id,at);")
                payload = {"customer": "Synthetic history", "phone": "2025550101", "issue": "junk spam",
                           "first_seen": "2026-10-01", "last_seen": "2026-10-02", "classification": "review",
                           "folder": "junk", "folder_version": "synthetic-import"}
                db.execute("INSERT INTO leads VALUES(?,?,?)", ("synthetic-old", "synthetic-origin", json.dumps(payload)))
                db.execute("INSERT INTO audit VALUES(?,?)", ("synthetic-old", AT))
            before = [path.read_bytes() for path in (website, history)]
            first, _ = sync.collect(website, history, AT)
            with mock.patch.object(sync.request, "build_opener", side_effect=AssertionError("No network")):
                for _ in range(3):
                    snapshot, _ = sync.collect(website, history, AT)
                    self.assertEqual(snapshot, first)
                    self.assertEqual(len(snapshot["leads"]), 4)
                    for lead in snapshot["leads"]:
                        self.assertEqual(set(lead), sync.LEAD_KEYS)
                        self.assertFalse(FOLDER_FIELDS.intersection(lead))
                        self.assertIn(lead["classification"], ("lead", "review"))
            self.assertEqual([path.read_bytes() for path in (website, history)], before)

    def test_transport_rejects_each_imported_folder_field_before_network(self):
        lead = {key: "" for key in sync.LEAD_KEYS}
        lead.update(source="website", source_id="synthetic", received_at=AT,
                    source_updated_at=AT, classification="lead", historical=False)
        for field in FOLDER_FIELDS:
            with self.subTest(field=field), mock.patch.object(sync.request, "build_opener") as opener:
                with self.assertRaises(sync.SyncError) as error:
                    sync.post_batch({}, {"leads": [{**lead, field: "junk"}], "sources": []})
                self.assertEqual(error.exception.code, "invalid_export_fields")
                opener.assert_not_called()

    def test_sweep_text_and_existing_folder_cannot_create_folder_changes(self):
        capture = {"conversation_id": "prv_" + "A" * 26}
        old = {"folder": "junk", "folder_version": "synthetic-owner-version", "stage": "scheduled",
               "notes": "Synthetic owner decision", "folder_updated_at": AT,
               "folder_updated_by": "synthetic-owner", "concern": "Earlier synthetic repair details"}
        original = copy.deepcopy(old)
        for text in ("spam junk unsubscribe", "Please move me to junk", "", "Brakes need help"):
            with self.subTest(text=text):
                item = {"concern": text, "folder": "junk", "folder_version": "synthetic-source"}
                before = copy.deepcopy(item)
                for _ in range(3):
                    decision = source_review(capture, AT, item, old)
                    self.assertEqual(decision["classification"], "uncertain")
                    self.assertTrue(decision["include_in_dashboard"])
                    self.assertFalse(FOLDER_FIELDS.intersection(decision))
                self.assertEqual(item, before)
                self.assertEqual(old, original)

    def test_existing_archive_classifications_remain_separate_from_junk(self):
        # These pre-existing archive decisions are not folder writes. Preserve them.
        for classification in ("spam", "operational", "personal"):
            with self.subTest(classification=classification):
                decision = source_review({"conversation_id": "prv_" + "B" * 26}, AT,
                                         {"concern": "Synthetic changed text"}, {}, classification)
                self.assertEqual(decision["classification"], classification)
                self.assertFalse(decision["include_in_dashboard"])
                self.assertFalse(FOLDER_FIELDS.intersection(decision))


if __name__ == "__main__":
    unittest.main()
