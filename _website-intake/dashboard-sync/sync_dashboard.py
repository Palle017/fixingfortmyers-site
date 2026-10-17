"""Read local lead sources without writes; sync an allowlisted snapshot to the owner dashboard."""
from __future__ import annotations

import argparse
from collections import Counter
from contextlib import contextmanager
from datetime import date, datetime, timezone
import json
import math
from pathlib import Path
import re
import sqlite3
import sys
from urllib import error, request
from urllib.parse import quote, urlsplit, urlunsplit

WEBSITE_DB = Path(r"C:\Users\LP15\PerfectTiming-Intake-data\website-leads.sqlite3")
HISTORY_DB = Path(r"C:\Users\LP15\Codex\PerfectTiming-LeadDesk\data\leads.sqlite3")
MAX_BATCH = 90
MAX_RESPONSE_BYTES = 64 * 1024
LEAD_KEYS = frozenset({"source", "source_id", "name", "phone", "email", "vehicle", "concern",
                       "received_at", "source_updated_at", "source_status", "classification", "historical"})
SOURCE_KEYS = frozenset({"id", "name", "status", "observed_at", "latest_record_at", "record_count", "detail"})


class SyncError(Exception):
    """Only fixed, non-sensitive codes leave this process on failure."""
    def __init__(self, code: str, source: str | None = None):
        super().__init__(code)
        self.code = code
        self.source = source


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@contextmanager
def read_snapshot(path: Path, source: str):
    connection = None
    try:
        if not path.is_file():
            raise SyncError("source_unavailable", source)
        # mode=ro prevents accidental creation/writes and observes the current WAL.
        # Do not use immutable=1: it would ignore a live receiver's WAL.
        connection = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA query_only=ON")
        connection.execute("BEGIN")
        yield connection
    except sqlite3.Error:
        raise SyncError("source_database_error", source) from None
    finally:
        if connection is not None:
            connection.close()


def text_field(value, maximum: int, source: str) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise SyncError("invalid_source_field_type", source)
    value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value).strip()
    if len(value) > maximum:
        raise SyncError("source_field_too_long", source)
    return value


def document(text: str, source: str) -> dict:
    try:
        result = json.loads(text)
    except (TypeError, json.JSONDecodeError):
        raise SyncError("invalid_source_json", source) from None
    if not isinstance(result, dict):
        raise SyncError("invalid_source_json", source)
    return result


def stable_id(value, source: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_.:@-]{1,180}", value):
        raise SyncError("invalid_source_id", source)
    return value


def timestamp(value, source: str, optional: bool = False) -> str | None:
    if value is None or value == "":
        if optional:
            return None
        raise SyncError("missing_source_timestamp", source)
    if not isinstance(value, str):
        raise SyncError("invalid_source_timestamp", source)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError()
    except ValueError:
        raise SyncError("invalid_source_timestamp", source) from None
    return parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def activity_date(value) -> str | None:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return None
    try:
        date.fromisoformat(value)
    except ValueError:
        return None
    return value


def source_info(source_id, name, status, observed_at, latest_record_at, count, detail):
    return {"id": source_id, "name": name, "status": status, "observed_at": observed_at,
            "latest_record_at": latest_record_at, "record_count": count, "detail": detail}


def website_concern(payload: dict, source: str) -> str:
    """Carry saved location into the existing concern contract; never infer a car pin."""
    concern = text_field(payload.get("details", payload.get("message")), 10000, source)
    lines, address_map = [], None

    def line_text(value, maximum):
        cleaned = re.sub(r"[\r\n\t]+", " ", text_field(value, maximum, source))
        if len(cleaned.encode("utf-16-le")) // 2 > maximum:
            raise SyncError("source_field_too_long", source)
        return cleaned

    def number(value, maximum=None):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise SyncError("invalid_source_location", source)
        if maximum is not None and abs(value) > maximum:
            raise SyncError("invalid_source_location", source)
        return str(int(value)) if value == int(value) else str(value)

    def map_url(query):
        # Match encodeURIComponent and the Owner Desk's canonical Maps-link allowlist.
        return "https://www.google.com/maps/search/?api=1&query=" + quote(query, safe="!'()*")

    def pin(value):
        return map_url(number(value.get("latitude"), 90) + "," + number(value.get("longitude"), 180))

    def metadata(value, prefix, accuracy_key, captured_key):
        if accuracy_key in value:
            accuracy = number(value[accuracy_key])
            if value[accuracy_key] < 0:
                raise SyncError("invalid_source_location", source)
            lines.append(f"{prefix} GPS accuracy: about {accuracy} metres")
        if captured_key in value:
            lines.append(f"{prefix} GPS captured at: {timestamp(value[captured_key], source)}")

    city = line_text(payload.get("city"), 100)
    if city:
        lines.append("Sender city or ZIP: " + city)
    if "latitude" in payload or "longitude" in payload:
        lines.append("Sender map (device location, not confirmed vehicle location): " + pin(payload))
        metadata(payload, "Sender", "senderAccuracyMeters", "senderCapturedAt")
    if "carLocation" in payload:
        car = payload["carLocation"]
        if not isinstance(car, dict):
            raise SyncError("invalid_source_location", source)
        if car.get("type") == "dropoff":
            preferred = line_text(car.get("preferredTime"), 160)
            lines.append("Car location: Shop drop-off requested" +
                         ("; preferred time: " + preferred if preferred else "") + ". Tony to confirm.")
        elif car.get("type") == "address":
            address = line_text(car.get("address"), 500)
            if not address:
                raise SyncError("invalid_source_location", source)
            lines.append("Car location: " + address)
            address_map = "Car map: " + map_url(address)
            lines.append(address_map)
        elif car.get("type") == "device" and car.get("carAtDevice") is True:
            lines.extend(["Car location: Device location confirmed by customer", "Car map: " + pin(car)])
            metadata(car, "Car", "accuracyMeters", "capturedAt")
        else:
            raise SyncError("invalid_source_location", source)
    if not lines:
        return concern
    result = "\n\n".join(part for part in [concern, "\n".join(lines)] if part)
    # The receiving API accepts 12,000 UTF-16 units. Preserve the complete source
    # concern/address; a very long encoded address map is optional derived data.
    if len(result.encode("utf-16-le")) // 2 > 12000 and address_map:
        lines[lines.index(address_map)] = "Car map omitted: use the full address above."
        result = "\n\n".join(part for part in [concern, "\n".join(lines)] if part)
    if len(result.encode("utf-16-le")) // 2 > 12000:
        raise SyncError("source_field_too_long", source)
    return result


def website_snapshot(path: Path, observed_at: str):
    source = "website"
    skipped = Counter()
    with read_snapshot(path, source) as db:
        tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "lead_pipeline" in tables:
            rows = db.execute("""SELECT l.id,l.received_at,l.updated_at,l.kind,l.status,l.payload_json,
                p.stage AS pipeline_stage,p.updated_at AS pipeline_updated_at
                FROM leads l LEFT JOIN lead_pipeline p ON p.lead_id=l.id ORDER BY l.id""").fetchall()
        else:
            rows = db.execute("""SELECT id,received_at,updated_at,kind,status,payload_json,
                NULL AS pipeline_stage,NULL AS pipeline_updated_at FROM leads ORDER BY id""").fetchall()
        documents = {row["id"]: document(row["payload_json"], source) for row in rows}
        parent_kinds = {row["id"]: row["kind"] for row in rows}
        leads = []
        for row in rows:
            payload = documents[row["id"]]
            parent = payload.get("requestId")
            # A linked recording belongs to its saved request, not a second sales opportunity.
            if row["kind"] == "voicenote" and isinstance(parent, str) and parent != row["id"] and parent_kinds.get(parent) == "webform":
                skipped["linked_recordings"] += 1
                continue
            received_at = timestamp(row["received_at"], source)
            modified = [timestamp(row["updated_at"], source)]
            if row["pipeline_updated_at"]:
                modified.append(timestamp(row["pipeline_updated_at"], source))
            lead = {
                "source": source, "source_id": stable_id(row["id"], source),
                "name": text_field(payload.get("name"), 2000, source),
                "phone": text_field(payload.get("phone"), 2000, source),
                "email": text_field(payload.get("email"), 320, source),
                "vehicle": text_field(payload.get("vehicle"), 2000, source),
                "concern": website_concern(payload, source),
                "received_at": received_at, "source_updated_at": max(modified),
                "source_status": text_field(row["pipeline_stage"] or row["status"], 100, source),
                "classification": "review" if payload.get("reviewRequired") is True else "lead",
                "historical": False,
            }
            leads.append(lead)
    latest = max((lead["received_at"] for lead in leads), default=None)
    info = source_info(source, "Website requests", "connected", observed_at, latest, len(leads),
                       "Read-only snapshot of the shop receiver. Linked voice recordings stay with their request. Chat activity alone is not a lead.")
    return leads, info, dict(skipped)


def history_snapshot(path: Path, observed_at: str):
    source = "beside-history"
    skipped = Counter()
    with read_snapshot(path, source) as db:
        rows = db.execute("SELECT id,source_id,document FROM leads ORDER BY id").fetchall()
        audits = {row["lead_id"]: timestamp(row["latest_at"], source) for row in db.execute(
            "SELECT lead_id,MAX(at) AS latest_at FROM audit WHERE lead_id IS NOT NULL GROUP BY lead_id")}
        audit_row = db.execute("SELECT MAX(at) AS latest_at FROM audit").fetchone()
        last_audit = timestamp(audit_row["latest_at"], source, optional=True)
        leads, last_activity = [], []
        for row in rows:
            payload = document(row["document"], source)
            if payload.get("classification") == "nonlead":
                skipped["classified_nonleads"] += 1
                continue
            # This source is always historical. No source action becomes a dashboard outcome.
            day = activity_date(payload.get("first_seen"))
            if day is None:
                day = activity_date(payload.get("last_seen"))
                if day is not None:
                    skipped["used_last_seen_date"] += 1
            if day is None:
                raise SyncError("missing_historical_activity_date", source)
            last_activity.append(activity_date(payload.get("last_seen")) or day)
            leads.append({
                "source": source, "source_id": stable_id(row["id"], source),
                "name": text_field(payload.get("customer"), 2000, source),
                "phone": text_field(payload.get("phone"), 2000, source),
                "email": "", "vehicle": text_field(payload.get("vehicle"), 2000, source),
                "concern": text_field(payload.get("issue"), 10000, source),
                # API name retained for compatibility; this is an activity DATE, not a receipt time.
                "received_at": day, "source_updated_at": audits.get(row["id"]) or last_audit,
                "source_status": "history_review",
                "classification": "lead" if payload.get("classification") == "lead" else "review",
                "historical": True,
            })
    info = source_info(source, "Historical Beside review", "historical", last_audit,
                       max(last_activity, default=None), len(leads),
                       "Historical recap snapshot, not a live Beside connection. Outcomes are unknown; review before moving a record into active work. Dates show activity days, not receipt times.")
    return leads, info, dict(skipped)


def collect(website_db=WEBSITE_DB, history_db=HISTORY_DB, observed_at=None):
    observed_at = observed_at or utc_now()
    website, website_info, website_skips = website_snapshot(Path(website_db), observed_at)
    history, history_info, history_skips = history_snapshot(Path(history_db), observed_at)
    leads = website + history
    keys = {(lead["source"], lead["source_id"]) for lead in leads}
    if len(keys) != len(leads):
        raise SyncError("duplicate_source_identity")
    sources = [website_info, history_info,
               source_info("beside", "Beside calls and texts", "not_connected", observed_at, None, 0,
                           "Live Beside calls and texts are not connected to this dashboard."),
               source_info("zoho", "Zoho estimates and invoices", "not_connected", observed_at, None, 0,
                           "Zoho records and payment outcomes are not synchronized with this dashboard.")]
    return {"leads": leads, "sources": sources}, {"website": website_skips, "beside-history": history_skips}


def count_summary(snapshot, adjustments):
    source_counts = Counter({"website": 0, "beside-history": 0})
    source_counts.update(lead["source"] for lead in snapshot["leads"])
    return {"records": len(snapshot["leads"]),
            "by_source": dict(source_counts),
            "by_classification": dict(Counter(lead["classification"] for lead in snapshot["leads"])),
            "historical_records": sum(lead["historical"] for lead in snapshot["leads"]),
            "source_count": len(snapshot["sources"]), "adjustments": adjustments}


def batches(snapshot, size=MAX_BATCH):
    if not isinstance(size, int) or isinstance(size, bool) or not 1 <= size <= MAX_BATCH:
        raise SyncError("invalid_batch_size")
    leads = snapshot["leads"]
    for offset in range(0, max(1, len(leads)), size):
        last = offset + size >= len(leads)
        # Only mark the source snapshot current after every preceding chunk was acknowledged.
        yield {"leads": leads[offset:offset + size], "sources": snapshot["sources"] if last else []}


def read_config(path: Path):
    try:
        config = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        raise SyncError("invalid_private_config") from None
    if not isinstance(config, dict):
        raise SyncError("invalid_private_config")
    raw_url = config.get("url")
    if not isinstance(raw_url, str) or re.search(r"\s", raw_url):
        raise SyncError("invalid_dashboard_url")
    try:
        parsed = urlsplit(raw_url)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                or parsed.query or parsed.fragment or parsed.path.rstrip("/") not in {"", "/api/sync"}
                or parsed.port not in {None, 443}):
            raise ValueError()
    except ValueError:
        raise SyncError("invalid_dashboard_url") from None
    for key in ("service_token", "sync_token"):
        value = config.get(key)
        if not isinstance(value, str) or len(value) < 16 or len(value) > 16384 or re.search(r"\s", value):
            raise SyncError("invalid_private_config")
    result = {"url": urlunsplit((parsed.scheme, parsed.netloc, "/api/sync", "", "")),
              "service_token": config["service_token"], "sync_token": config["sync_token"]}
    authority = config.get("website_source_authority", "local")
    if authority not in {"local", "cloud"}:
        raise SyncError("invalid_private_config")
    if authority == "cloud":
        result["website_source_authority"] = "cloud"
    beside_authority = config.get("beside_source_authority", "local")
    if beside_authority not in {"local", "zoho_adapter", "browser_refresh"}:
        raise SyncError("invalid_private_config")
    if beside_authority in {"zoho_adapter", "browser_refresh"}:
        result["beside_source_authority"] = beside_authority
    return result


def apply_source_authorities(snapshot, config):
    """Keep record imports; only the designated collector reports its source health."""
    delegated = set()
    if config.get("website_source_authority") == "cloud":
        delegated.add("website")
    if config.get("beside_source_authority") in {"zoho_adapter", "browser_refresh"}:
        delegated.add("beside")
    return {**snapshot, "sources": [source for source in snapshot["sources"]
                                    if source["id"] not in delegated]}


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def post_batch(config, payload, opener=None):
    if len(payload["leads"]) > MAX_BATCH or len(payload["sources"]) > 4:
        raise SyncError("invalid_batch_size")
    if any(set(lead) != LEAD_KEYS for lead in payload["leads"]):
        raise SyncError("invalid_export_fields")
    if any(set(source) != SOURCE_KEYS for source in payload["sources"]):
        raise SyncError("invalid_export_fields")
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    req = request.Request(config["url"], data=body, method="POST", headers={
        "Content-Type": "application/json", "Accept": "application/json",
        "OAI-Sites-Authorization": "Bearer " + config["service_token"],
        "x-owner-sync-token": config["sync_token"],
        "User-Agent": "PerfectTimingOwnerDashboardSync/1.0",
    })
    opener = opener or request.build_opener(request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(req, timeout=30) as response:
            if not 200 <= response.status < 300:
                raise SyncError("sync_http_error")
            raw = response.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                raise SyncError("invalid_sync_response")
            result = json.loads(raw)
            if (not isinstance(result, dict) or result.get("ok") is not True
                    or type(result.get("accepted")) is not int
                    or result["accepted"] != len(payload["leads"])):
                raise SyncError("unconfirmed_sync_response")
    except error.HTTPError as exc:
        code = "sync_redirect_refused" if 300 <= exc.code < 400 else "sync_authorization_failed" if exc.code in {401, 403} else "sync_http_error"
        raise SyncError(code) from None
    except (error.URLError, TimeoutError, OSError):
        raise SyncError("sync_network_error") from None
    except (UnicodeError, json.JSONDecodeError):
        raise SyncError("invalid_sync_response") from None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Read local sources and print counts; no config read or network access.")
    parser.add_argument("--config", type=Path, help="Private JSON with url, service_token and sync_token; required to send.")
    parser.add_argument("--website-db", type=Path, default=WEBSITE_DB)
    parser.add_argument("--history-db", type=Path, default=HISTORY_DB)
    args = parser.parse_args(argv)
    confirmed_batches = 0
    try:
        if not args.dry_run and args.config is None:
            raise SyncError("private_config_required")
        config = None if args.dry_run else read_config(args.config)
        snapshot, adjustments = collect(args.website_db, args.history_db)
        if config:
            snapshot = apply_source_authorities(snapshot, config)
        counts = count_summary(snapshot, adjustments)
        if not args.dry_run:
            for payload in batches(snapshot):
                post_batch(config, payload)
                confirmed_batches += 1
        print(json.dumps({"ok": True, "dry_run": args.dry_run, "confirmed_batches": confirmed_batches, **counts}, sort_keys=True))
        return 0
    except SyncError as exc:
        print(json.dumps({"ok": False, "error": exc.code, "source": exc.source,
                          "confirmed_batches": confirmed_batches}, sort_keys=True), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print(json.dumps({"ok": False, "error": "interrupted", "confirmed_batches": confirmed_batches}), file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
