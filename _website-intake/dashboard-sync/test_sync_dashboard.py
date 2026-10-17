"""Synthetic-only tests. No live databases, credentials or network requests."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from urllib import error

import sync_dashboard as sync

NOW = "2026-09-29T20:00:00.000Z"
PRIVATE_SENTINEL = "PRIVATE_SOURCE_VALUE_MUST_NOT_BE_LOGGED"


class Fixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pt-dashboard-sync-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.website = self.root / "website.sqlite3"
        self.history = self.root / "history.sqlite3"
        with contextlib.closing(sqlite3.connect(self.website)) as db, db:
            db.executescript("""CREATE TABLE leads(id TEXT PRIMARY KEY,received_at TEXT,updated_at TEXT,
                kind TEXT,status TEXT,payload_json TEXT,audio BLOB);
                CREATE TABLE lead_pipeline(lead_id TEXT PRIMARY KEY,stage TEXT,updated_at TEXT);""")
        with contextlib.closing(sqlite3.connect(self.history)) as db, db:
            db.executescript("""CREATE TABLE leads(id TEXT PRIMARY KEY,source_id TEXT,document TEXT);
                CREATE TABLE audit(id INTEGER PRIMARY KEY,lead_id TEXT,at TEXT);""")

    def website_row(self, record_id="website-1", *, kind="webform", status="new", **payload):
        data = {"name": PRIVATE_SENTINEL, "phone": "2395550100", "vehicle": "Synthetic vehicle",
                "details": "Synthetic concern", "email": "fixture@example.invalid", **payload}
        with contextlib.closing(sqlite3.connect(self.website)) as db, db:
            db.execute("INSERT INTO leads VALUES(?,?,?,?,?,?,?)", (record_id, "2026-09-29T18:00:00.000Z",
                       "2026-09-29T18:01:00.000Z", kind, status, json.dumps(data), b"PRIVATE_AUDIO"))

    def history_row(self, record_id="history-1", **fields):
        data = {"customer": PRIVATE_SENTINEL, "phone": "2395550101", "vehicle": "Synthetic old vehicle",
                "issue": "Synthetic historical concern", "first_seen": "2026-08-01", "last_seen": "2026-09-01",
                "classification": "lead", "status": "history_review", "history_only": True,
                "evidence": "RAW_PRIVATE_TRANSCRIPT", "historical_quote_note": "PRIVATE_FINANCIAL_NOTE",
                "received_at": None, **fields}
        with contextlib.closing(sqlite3.connect(self.history)) as db, db:
            db.execute("INSERT INTO leads VALUES(?,?,?)", (record_id, "older-origin-id", json.dumps(data)))
            db.execute("INSERT INTO audit(lead_id,at) VALUES(?,?)", (record_id, "2026-09-27T19:42:41.112301+00:00"))

    def collect(self):
        return sync.collect(self.website, self.history, NOW)

    def test_history_mapping_preserves_date_precision_and_excludes_private_evidence(self):
        self.history_row()
        self.history_row("history-2", classification="review", status="completed", job_value=9999)
        snapshot, _ = self.collect()
        self.assertEqual(len(snapshot["leads"]), 2)
        lead, review = snapshot["leads"]
        self.assertEqual(set(lead), sync.LEAD_KEYS)
        self.assertEqual(lead["source_id"], "history-1")
        self.assertEqual(lead["received_at"], "2026-08-01")
        self.assertEqual(lead["source_updated_at"], "2026-09-27T19:42:41.112Z")
        self.assertEqual(lead["source_status"], "history_review")
        self.assertEqual(review["source_status"], "history_review")
        self.assertTrue(review["historical"])
        self.assertEqual(review["classification"], "review")
        encoded = json.dumps(snapshot)
        self.assertNotIn("RAW_PRIVATE_TRANSCRIPT", encoded)
        self.assertNotIn("PRIVATE_FINANCIAL_NOTE", encoded)
        self.assertNotIn("job_value", encoded)
        self.assertEqual(snapshot["sources"][1]["status"], "historical")
        self.assertEqual(snapshot["sources"][1]["observed_at"], "2026-09-27T19:42:41.112Z")
        self.assertEqual(snapshot["sources"][1]["latest_record_at"], "2026-09-01")

    def test_website_mapping_uses_pipeline_date_and_exact_allowlist(self):
        self.website_row(media=[{"file": "C:/private/customer-photo.jpg", "token": "PRIVATE_TOKEN"}],
                         smsConsentDisclosure="PRIVATE_CONSENT", source="ai", reviewRequired=True)
        with contextlib.closing(sqlite3.connect(self.website)) as db, db:
            db.execute("INSERT INTO lead_pipeline VALUES(?,?,?)", ("website-1", "contacted", "2026-09-29T19:00:00Z"))
        snapshot, _ = self.collect()
        lead = snapshot["leads"][0]
        self.assertEqual(set(lead), sync.LEAD_KEYS)
        self.assertEqual(lead["source"], "website")
        self.assertEqual(lead["source_status"], "contacted")
        self.assertEqual(lead["source_updated_at"], "2026-09-29T19:00:00.000Z")
        self.assertEqual(lead["classification"], "review")
        self.assertFalse(lead["historical"])
        for forbidden in ("customer-photo", "PRIVATE_TOKEN", "PRIVATE_CONSENT", "PRIVATE_AUDIO"):
            self.assertNotIn(forbidden, json.dumps(snapshot))

    def test_linked_recording_is_not_another_lead_but_orphan_remains(self):
        self.website_row()
        self.website_row("linked-voice", kind="voicenote", requestId="website-1")
        self.website_row("orphan-voice", kind="voicenote", requestId="missing-parent")
        snapshot, adjustments = self.collect()
        self.assertEqual({lead["source_id"] for lead in snapshot["leads"]}, {"website-1", "orphan-voice"})
        self.assertEqual(adjustments["website"]["linked_recordings"], 1)

    def test_repeat_read_is_stable_and_never_infers_synthetic_from_name(self):
        self.website_row(name="Test customer is a legitimate supplied name")
        self.history_row()
        one, _ = self.collect()
        two, _ = self.collect()
        self.assertEqual(one, two)
        self.assertEqual(len(one["leads"]), 2)

    def test_date_fallback_is_explicit_and_missing_dates_fail_before_send(self):
        self.history_row(first_seen="invalid-date", last_seen="2026-09-02")
        snapshot, adjustments = self.collect()
        self.assertEqual(snapshot["leads"][0]["received_at"], "2026-09-02")
        self.assertEqual(adjustments["beside-history"]["used_last_seen_date"], 1)
        self.history_row("missing-date", first_seen=None, last_seen=None)
        with self.assertRaises(sync.SyncError) as caught:
            self.collect()
        self.assertEqual(caught.exception.code, "missing_historical_activity_date")

    def test_readonly_connection_refuses_writes_and_preserves_source(self):
        self.website_row()
        before = hashlib.sha256(self.website.read_bytes()).hexdigest()
        with sync.read_snapshot(self.website, "website") as db:
            self.assertEqual(db.execute("PRAGMA query_only").fetchone()[0], 1)
            with self.assertRaises(sqlite3.OperationalError):
                db.execute("DELETE FROM leads")
            # Even switching the pragma off cannot bypass SQLite's read-only open.
            db.execute("PRAGMA query_only=OFF")
            with self.assertRaises(sqlite3.OperationalError):
                db.execute("DELETE FROM leads")
        self.collect()
        self.assertEqual(hashlib.sha256(self.website.read_bytes()).hexdigest(), before)

    def test_snapshot_reads_committed_uncheckpointed_wal(self):
        writer = sqlite3.connect(self.website)
        self.addCleanup(writer.close)
        writer.execute("PRAGMA journal_mode=WAL")
        writer.execute("PRAGMA wal_autocheckpoint=0")
        writer.execute("INSERT INTO leads VALUES(?,?,?,?,?,?,?)", ("wal-row", "2026-09-29T18:00:00Z",
            "2026-09-29T18:00:00Z", "webform", "new", json.dumps({"name":"Fixture","phone":"2395550100"}), None))
        writer.commit()
        self.assertTrue(Path(str(self.website) + "-wal").exists())
        snapshot, _ = self.collect()
        self.assertEqual(snapshot["leads"][0]["source_id"], "wal-row")

    def test_dryrun_does_not_read_config_or_send_or_print_pii(self):
        self.website_row()
        self.history_row()
        out, err = io.StringIO(), io.StringIO()
        with patch.object(sync, "read_config", side_effect=AssertionError("Config must stay unread")), \
             patch.object(sync, "post_batch", side_effect=AssertionError("Network must stay unused")), \
             contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = sync.main(["--dry-run", "--website-db", str(self.website), "--history-db", str(self.history),
                              "--config", str(self.root / "nonexistent-secret.json")])
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out.getvalue())["records"], 2)
        for private in (PRIVATE_SENTINEL, "2395550100", "RAW_PRIVATE_TRANSCRIPT", str(self.root)):
            self.assertNotIn(private, out.getvalue() + err.getvalue())

    def test_missing_source_does_not_create_database(self):
        absent = self.root / "absent.sqlite3"
        with self.assertRaises(sync.SyncError):
            sync.collect(absent, self.history, NOW)
        self.assertFalse(absent.exists())

    def test_invalid_json_and_types_fail_without_values_in_errors(self):
        self.website_row(name={"secret": PRIVATE_SENTINEL})
        with self.assertRaises(sync.SyncError) as caught:
            self.collect()
        self.assertEqual(str(caught.exception), "invalid_source_field_type")
        self.assertNotIn(PRIVATE_SENTINEL, str(caught.exception))

    def test_batch_limit_and_final_only_source_markers(self):
        sample = {"leads": [{"source_id": str(i)} for i in range(181)], "sources": [{"id":"website"}]}
        chunks = list(sync.batches(sample))
        self.assertEqual([len(chunk["leads"]) for chunk in chunks], [90, 90, 1])
        self.assertEqual([bool(chunk["sources"]) for chunk in chunks], [False, False, True])
        self.assertEqual(list(sync.batches({"leads":[],"sources":[]})), [{"leads":[],"sources":[]}])
        with self.assertRaises(sync.SyncError):
            list(sync.batches(sample, 91))

    def test_cloud_authority_preserves_coverage_and_still_imports_legacy_records(self):
        self.website_row()
        self.history_row()
        path = self.root / "private.json"
        path.write_text(json.dumps({"url": "https://dashboard.example.invalid",
            "service_token": "service-fixture-token-long", "sync_token": "owner-fixture-token-long",
            "website_source_authority": "cloud"}), encoding="utf-8")
        out = io.StringIO()
        with patch.object(sync, "post_batch") as send, contextlib.redirect_stdout(out):
            code = sync.main(["--config", str(path), "--website-db", str(self.website), "--history-db", str(self.history)])
        self.assertEqual(code, 0)
        posted = send.call_args.args[1]
        self.assertEqual(len(posted["leads"]), 2)
        self.assertNotIn("website", [source["id"] for source in posted["sources"]])
        self.assertIn("beside-history", [source["id"] for source in posted["sources"]])

    def test_config_https_only_no_redirect_or_header_injection(self):
        config_path = self.root / "private.json"
        good = {"url":"https://dashboard.example.invalid", "service_token":"service-fixture-token-long",
                "sync_token":"owner-fixture-token-long"}
        config_path.write_text(json.dumps(good), encoding="utf-8")
        self.assertEqual(sync.read_config(config_path)["url"], "https://dashboard.example.invalid/api/sync")
        for url in ("http://dashboard.example.invalid", "https://user:password@example.invalid", "https://example.invalid/?token=x",
                    "https://example.invalid/other", "https://example.invalid/#fragment", "https://example.invalid:8443"):
            config_path.write_text(json.dumps({**good,"url":url}),encoding="utf-8")
            with self.assertRaises(sync.SyncError):
                sync.read_config(config_path)
        config_path.write_text(json.dumps({**good,"sync_token":"long-secret-with\nnew-header"}),encoding="utf-8")
        with self.assertRaises(sync.SyncError):
            sync.read_config(config_path)
        self.assertIsNone(sync.NoRedirect().redirect_request(None,None,302,"redirect",{},"https://other.invalid"))

    def test_post_headers_and_ack_validation_with_mock_transport(self):
        self.website_row()
        payload, _ = self.collect()
        config = {"url":"https://dashboard.example.invalid/api/sync", "service_token":"PRIVATE_SERVICE_TOKEN",
                  "sync_token":"PRIVATE_SYNC_TOKEN"}
        captured = {}
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self,*args): return None
            def read(self,limit): return json.dumps(dict(ok=True,accepted=len(payload['leads']))).encode()
        class Opener:
            def open(self, req, timeout):
                captured.update(headers={k.lower():v for k,v in req.header_items()}, payload=json.loads(req.data),timeout=timeout)
                return Response()
        sync.post_batch(config,payload,Opener())
        self.assertEqual(captured["headers"]["oai-sites-authorization"],"Bearer PRIVATE_SERVICE_TOKEN")
        self.assertEqual(captured["headers"]["x-owner-sync-token"],"PRIVATE_SYNC_TOKEN")
        self.assertEqual(set(captured["payload"]),{"leads","sources"})
        class RedirectOpener:
            def open(self, req, timeout):
                raise error.HTTPError("https://PRIVATE_URL.invalid",302,"PRIVATE_ERROR",{},None)
        with self.assertRaises(sync.SyncError) as caught:
            sync.post_batch(config,payload,RedirectOpener())
        self.assertEqual(str(caught.exception),"sync_redirect_refused")

    def test_failed_response_never_echoes_private_body(self):
        payload, _ = self.collect()
        config = {"url":"https://dashboard.example.invalid/api/sync", "service_token":"PRIVATE_SERVICE_TOKEN",
                  "sync_token":"PRIVATE_SYNC_TOKEN"}
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self,*args): return None
            def read(self,limit): return self.body
        class Opener:
            def __init__(self, body): self.body = body
            def open(self, req, timeout):
                response = Response()
                response.body = self.body
                return response
        for body, expected in ((b'{"ok":false,"detail":"PRIVATE_RESPONSE"}', "unconfirmed_sync_response"),
                               (b'PRIVATE_RESPONSE_NOT_JSON', "invalid_sync_response")):
            with self.subTest(expected=expected), self.assertRaises(sync.SyncError) as caught:
                sync.post_batch(config, payload, Opener(body))
            self.assertEqual(str(caught.exception), expected)
            self.assertNotIn("PRIVATE", str(caught.exception))


if __name__ == "__main__":
    unittest.main(verbosity=2)
