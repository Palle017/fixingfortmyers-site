# Perfect Timing website requests

This service receives repair requests and voice recordings on the shop computer. It saves them before acknowledging receipt. The owner reads them at **http://127.0.0.1:18798/**. It does not invoke Bay One, OpenClaw, Zoho, an LLM, email, or automated texts.

The current Bay One phone service on Tailscale port 8443 returns 404 for the old website endpoints. It provides authenticated employee assistant requests, not customer lead intake. This receiver therefore uses its own loopback port and its own public Tailscale port. The existing private 443 and 8443 mappings remain untouched.

## Owner use

Open the **Perfect Timing Website Requests** desktop shortcut. New messages appear automatically every 15 seconds. Click a phone number to call the customer, play a recording, and mark the request Contacted or Closed. The text preference and full consent record are shown with each request. A recording submitted after a repair request links back to that request.

The inbox displays the latest 200 records. All received records remain in the SQLite database. Nothing is deleted by changing a status. Desktop alerts require clicking **Enable desktop alerts** and keeping the inbox open. No automatic message is sent to the customer, and receiving a request does not confirm an appointment.

The shop computer must be powered on and awake, Tailscale connected, and this service running to receive requests. The website retains direct Call, Text, and Email options if an upload fails.

## Runtime files and persistence

- `server.mjs`: dependency-free Node HTTP receiver and separate private inbox server.
- `data/website-leads.sqlite3`: leads, audio BLOBs, consent evidence, and statuses. SQLite WAL with `synchronous=FULL` completes the committed insert before `{ok:true}` is returned.
- `inbox.html`, `inbox.css`, `inbox.js`: local operator inbox; it never appears on the public port.
- `widget.js`: legacy widget URL now supplies a lightweight **Contact the team** launcher. It makes no live-chat or AI claims.
- `Start-Website-Leads.ps1` and `Launch-Website-Leads.vbs`: hidden Windows launcher, one-instance mutex, and restart loop.
- `Install-Startup.ps1`: creates a per-user startup shortcut and inbox desktop shortcut. Running it does not start the service or change Tailscale.
- `runtime.json`: optional configuration copied from `runtime.example.json`. There are no credentials.

Use **Node 24**. This computer's installed Node 24.19.0 was tested successfully with the built-in `node:sqlite` module. Do not run from a temporary checkout; copy the runtime files to a permanent business website folder first. Test data and logs do not belong in GitHub. Never overwrite or replace an existing data directory when deploying a code update. To back up a running SQLite database, use SQLite's backup API; alternatively stop this receiver and copy its data directory, including any WAL/SHM files.

## Endpoints

Public loopback listener: `127.0.0.1:18795`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/healthz` | Minimal service health; no customer data. |
| POST | `/hooks/lead/webform` | JSON repair request. |
| POST | `/hooks/lead/voicenote` | Multipart audio plus fields, or legacy raw audio with headers. |
| OPTIONS | Either POST path | Browser CORS preflight for exact allowed origins. |
| GET | `/chat/widget.js` | Contact launcher JavaScript. |
| Any | Everything else | 404. No public inbox, recording retrieval, assistant, or admin route. |

The private inbox binds only `127.0.0.1:18798`. Its Host allowlist rejects DNS rebinding; Origin checks reject cross-site reads; status updates require same-origin JSON. All customer strings use `textContent`. Audio has a checked container signature and media MIME type and is served with `nosniff`.

### Request contract

Webform JSON fields: `name`, `phone`, `vehicle`, `service`, `details` (legacy `message` is accepted), optional honeypot `website` which must remain empty, `smsConsent`, `smsConsentTimestamp`, `smsConsentVersion`, `smsConsentSource`, `smsConsentPage`, `smsConsentDisclosure`.

Voice FormData uses one file named **audio** (or **recording**), required `name` and `phone`, optional `vehicle`, `service`, `details`, the same consent fields, and optional `requestId`. The latter is the original received repair request ID; when supplied it must exist and match the phone number. Leave it empty for a standalone voice message.

Send a stable UUID in the **Idempotency-Key** header for every logical repair or recording submission. Preserve the entire payload, including consent timestamp and parent requestId, across an uncertain retry. The header is a retry identifier, not authentication. Reuse with different contents returns 409. Successful duplicates return the original receipt ID without creating a second lead. With no explicit key, the receiver derives one from the normalized content.

Success: HTTP 201 (or 200 for duplicate) with `{ "ok": true, "received": true, "id": "uuid", "receivedAt": "ISO timestamp" }`. Failure: appropriate 4xx/503 with `{ "ok": false, "error": "customer-readable explanation" }`. The website must only show received after HTTP success and `ok === true`.

Consent is false unless explicitly selected. A true value requires a valid timestamp plus nonempty version, source, page, and disclosure. This service stores the record but sends no texts. JSON is capped at 48 KiB; recordings at 8 MiB and accepted media formats; requests have timeouts, 12 submissions/minute per source and 120/minute globally.

The default API Origin allowlist contains only `https://fixingfortmyers.com` and `https://www.fixingfortmyers.com`. For local end-to-end tests, set `LEAD_DEV_ORIGINS=http://127.0.0.1:18906`. Remove the development origin in the final production configuration.

## Activation sequence

1. Copy runtime files to the chosen permanent folder without test-data or any test database. Verify the absolute Node path and optional `runtime.json` dataDir.
2. Run `node --test server.test.mjs` in the draft to validate behavior. Tests create isolated synthetic databases and ephemeral loopback listeners only; no live inquiry or external message is sent.
3. Start the permanent `Launch-Website-Leads.vbs` with `wscript.exe` using hidden window style. Check both loopback listeners and `/healthz`; open the inbox on the shop computer. For a direct debugging run, use `node server.mjs`.
4. Back up `tailscale serve status --json` before routing. The dedicated public candidate is **https://redline.taild5f39d.ts.net:10000**, routed to the receiver only. The exact command, to execute after review, is:

   `tailscale funnel --bg --yes --https=10000 http://127.0.0.1:18795`

   Explicitly specify the HTTPS port. Never run Funnel against private 443/8443 or point it at Bay One/OpenClaw. Never use `funnel reset` or `serve reset` in this deployment.
5. Inspect `tailscale serve status --json` after the command: only port 10000 may become public; existing 443 and 8443 mappings must remain private and unchanged. Verify the public health and POST behavior from outside the tailnet before claiming public reachability. Tailscale's local HTTPS success alone is insufficient proof of Funnel delivery.
6. Point the website's API base and widget at the dedicated :10000 origin and run end-to-end form/audio tests, inspect actual saved synthetic records in the local inbox, and delete no customer data. Do not send real email/SMS test messages.
7. Run `Install-Startup.ps1` from the permanent folder to start the hidden receiver at user logon; test the launcher. The desktop URL shortcut opens the owner inbox. No existing startup entries are removed.

To disable only this public endpoint, use `tailscale funnel --https=10000 off`. Keep the local data directory. Stop only the receiver's known node/launcher processes; do not stop unrelated Bay One or OpenClaw processes.

Tailscale's official documentation confirms allowed Funnel ports 443, 8443, and 10000 and the explicit `--https` option: https://tailscale.com/docs/reference/tailscale-cli/funnel .

## Verification completed in the draft

Six real HTTP tests pass, covering committed data after process restart; duplicate retry and conflict behavior; full consent retry; strict origin, preflight, Host and CSRF checks; rejected invalid/oversized requests and rate limits; multipart and raw recordings; linked parent validation; private playback/ranges; and public refusal of lead/inbox/audio reads. Frontend JavaScript syntax checks pass. `Test-Launcher.ps1` also verified the hidden launcher under Windows PowerShell 5.1 using isolated test ports: public health 200, private inbox 200, and clean self-exit. Test evidence is in `launcher-verification.json`. These tests do not prove public Funnel reachability, actual Windows logon recurrence, or browser notification permission; those are deployment checks.
