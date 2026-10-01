# Perfect Timing website requests

**Owner's current release decision, 2026-09-24:** Bay One is off until the rest of the website is in production. The immediate contact path prepares a text to Tony's regular number for the customer to send; it is not a confirmed backend submission. The existing Beside subscription will be assessed before adding a paid notification provider. See [ROUTING.md](ROUTING.md) for Beside findings and the prepared ordered IF/ELSE rules. Twilio call/text delivery is optional, parked and disabled. The historical deployment notes below are not proof of the current REDLINE endpoint or running data path; REDLINE is currently reported offline from this workstation. No backend production cutover or real alert has been verified.

This service receives repair requests and voice recordings on the shop computer. It saves them before acknowledging receipt. The owner reads them at **http://127.0.0.1:18798/**. It never writes to Zoho; when configured it only reads the status of Zoho estimates Tony links to a request (see **Zoho estimate status**).

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

## Chat model

Bay One's chat extraction uses DeepSeek's cloud API by default (`DEEPSEEK_API_KEY`). To run it on a local Ollama model instead, set these for the receiver process:

| Variable | Meaning |
| --- | --- |
| `BAYONE_PROVIDER=ollama` | Use local Ollama instead of DeepSeek. |
| `OLLAMA_MODEL` | Required. An installed model tag, e.g. `qwen3.5:4b` (tested on the 8 GB p15g2 GPU; thinking is disabled per request). |
| `OLLAMA_HOST` | Optional, default `http://127.0.0.1:11434`. Keep Ollama on loopback; never Funnel it, and turn off the Ollama app's "Expose Ollama to the network" setting. |
| runtime.json `env` | The launcher copies these non-secret settings from an `env` object in `runtime.json` (see `runtime.example.json`). Never put API keys there. |
| `OLLAMA_KEEP_ALIVE` | Optional, default `24h`. How long Ollama keeps the model loaded, so customers rarely hit a cold load. |
| `OLLAMA_TIMEOUT_MS` / `CHAT_TIMEOUT_MS` | Optional, defaults 24000 / 25000. Keep both under 30000: the browser widget aborts at 35 s, and a server still working past that makes the customer's retry fail as pending. Warm the model after startup instead of raising these. |
| `CHAT_MAX_CONCURRENT` | Optional. Model calls allowed at once; default 1 with Ollama (one GPU), 4 with DeepSeek. Extra chats get the scripted flow instead of waiting. |
| `OLLAMA_FORMAT=json` | Optional. Ollama normally gets a JSON schema that limits the model to the intake fields. Set this only if an Ollama build rejects the schema; it falls back to plain JSON mode. |

Vehicle, symptoms, city and callback time are kept only when they are the customer's exact words. A model that paraphrases them has that field dropped, and Bay One asks for it again; it is never stored.

**Scripted fallback.** The model is optional; intake is not. When the model is down, slow, over its daily budget, busy with another customer, or returns unusable output, Bay One still answers: the customer's own reply fills the field it just asked about (yes/no/not sure for the status questions) and it asks the next question. Each reply carries `assist` (`model`, `rules` or `scripted`), and every fallback logs a `public_chat_scripted` event with the reason and no customer text.

**Check a model before going live.** `golden-check.mjs` runs the 24 synthetic conversations in `golden-cases.json` through the real chat logic with the configured model, in a throwaway data directory, and reports which fields it got, how often it fell back to the script, and its latency:

```text
set BAYONE_PROVIDER=ollama
set OLLAMA_MODEL=qwen3.5:4b
node golden-check.mjs
```

It exits non-zero below an 80% pass rate or above a 20 s p95 (`--min-pass=0.9`, `--max-p95-ms=15000` to change them; `--json` for machine-readable output). A case fails if any turn fell back to the script, so a broken model cannot pass on the script's answers. Run it after changing models or Ollama versions.

**Uptime.** The widget only shows Bay One when `GET /healthz` answers with `chat: "ready"`; otherwise the site keeps its call, text and form options. Point a free external uptime monitor at `https://<laptop>.<tailnet>.ts.net:10000/healthz` so someone hears when the laptop drops off.

## Endpoints

Public loopback listener: `127.0.0.1:18795`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/healthz` | Minimal service health and whether chat started (`chat: "ready"` or `"unavailable"`); no customer data. Readable cross-origin by the shop origins so the widget can check it. |
| POST | `/hooks/lead/webform` | JSON repair request. |
| POST | `/hooks/lead/voicenote` | Multipart audio plus fields, or legacy raw audio with headers. |
| POST | `/hooks/lead/media/{leadId}` | One customer photo or video, raw body, `Content-Type` set to the file type and `X-Media-Token` set to the `mediaToken` from the webform receipt. |
| OPTIONS | Any POST path above | Browser CORS preflight for exact allowed origins. |
| GET | `/chat/widget.js` | Contact launcher JavaScript. |
| Any | Everything else | 404. No public inbox, recording retrieval, assistant, or admin route. |

The private inbox binds only `127.0.0.1:18798`. Its Host allowlist rejects DNS rebinding; Origin checks reject cross-site reads; status updates require same-origin JSON. All customer strings use `textContent`. Audio has a checked container signature and media MIME type and is served with `nosniff`.

### Photos and video

A webform receipt includes a `mediaToken` (valid 2 hours; resending the same request issues a new one and retires the old). The lead is always saved before any upload, so a failed upload never loses a lead. Each file is streamed to `data/media/{leadId}/{n}.{ext}` and must really be the declared type (checked on its first bytes): JPEG, PNG, WebP, HEIC/HEIF up to 15 MB; MP4, MOV, WebM up to 100 MB; at most 6 files and 200 MB per request, with 1 GiB of disk kept free. A retried upload of the same file is not stored twice. Uploads get 5 minutes; every other request body still has 30 seconds. Tony gets one grouped "Photos/video added" alert per request (push, desktop, email; never an extra paid text) about 45 seconds after the last upload. The private inbox shows photos and plays videos from `/api/leads/{id}/media/{n}`, served with the validated type, `nosniff` and a `sandbox` CSP. Back up `data/media` together with the database.

### Customer confirmation text

When a customer ticks text permission, the receiver can text them within seconds: "Perfect Timing Auto Repair: Hi Maria, Tony got your repair request for your 2012 F-150. He'll call or text you from (239) 397-2048… Reply STOP to opt out, HELP for help." It is **off** until both are true: `LEAD_CUSTOMER_TEXTS=true` and the Twilio variables (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `LEAD_ALERT_FROM`) are set. US carriers also require the sending number to be A2P 10DLC registered first. At most one text per phone number per day and 60 per day overall. An uncertain send is never repeated (Twilio has no idempotency key); it shows as "may not have gone out" in the inbox. Replies go to the Twilio number, so the text points customers to (239) 397-2048.

### Zoho estimate status

Tony makes and sends estimates in Zoho as he does now. To track one, type its number (for example `EST-000123`) under the request in the inbox and press **Link Zoho estimate**. The receiver then reads that estimate from Zoho every 15 minutes and moves the request:

| Zoho status | Lead Desk |
| --- | --- |
| draft | No change until it is sent |
| sent | Estimate sent. The Zoho total becomes the approved price if none was entered, and the 3-day follow-up timer starts from the Zoho date |
| accepted or invoiced | Booked |
| declined | Lost, "Zoho: customer declined the estimate" (a later acceptance reopens it as booked) |
| expired | Stays open and shows in Needs action as "Zoho estimate expired: follow up or close" |

Zoho only moves a request forward. It never changes a request marked won or spam, or one Tony closed as lost himself. Declined and invoiced estimates, and links older than 60 days, are no longer checked. Customers can only accept or decline from the estimate link if Zoho's public accept/decline setting is on; otherwise mark the estimate accepted or declined in Zoho and the request follows.

The receiver **only reads** from Zoho; it never creates, sends or edits an estimate. It is off until all four settings exist in the receiver's environment (never in Git or `runtime.json`):

| Variable | Meaning |
| --- | --- |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` | A Zoho API Console **Self Client** |
| `ZOHO_REFRESH_TOKEN` | Generated from that Self Client with only the scope `ZohoInvoice.estimates.READ` (`ZohoBooks.estimates.READ` for Books), so the key itself cannot write |
| `ZOHO_ORG_ID` | The Zoho Invoice organization ID |
| `ZOHO_PRODUCT` | Optional: `invoice` (default) or `books` |
| `ZOHO_DC` | Optional data center: `com` (default), `eu`, `in`, `au`, `jp`, `ca`, `sa` |

At startup the receiver logs `zoho_sync` with `enabled`, or `zoho_sync_disabled` with what is missing. Tests use a synthetic Zoho: `node --test zoho.test.mjs`.

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
