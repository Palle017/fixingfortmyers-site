# Repair request form v1 backend contract

Work Unit A, 2026-10-25. The current owner instruction replaces the earlier form field requirements for this baseline. This is a callback request, not a service appointment or calendar placement. The public form has three required fields (name, callback number, vehicle) and two optional field groups (VIN and preferred callback).

## Current endpoint evidence and chosen fallback

Read-only discovery on 2026-10-25 found the following:

| Surface | Observation | Limit |
| --- | --- | --- |
| `http://127.0.0.1:18795/healthz` | HTTP 200; `ok:true`, service `Perfect Timing website requests`, `chat:"ready"`, `media:"ready"`, contract `sender-v1`; the listener is bound to loopback. | Local health does not prove this v1 payload is accepted or that public visitors can reach it. |
| `https://perfect-timing-cloud-intake.prudhvi-pallempati.chatgpt.site/healthz` | HTTP 200; `ok:true`, `storage:"cloud"`, `media:"ready"`, contract `sender-v1`. | This is the existing production origin in `contact-config.js`. Health does not prove compatibility with this new contract. |
| `https://redline.taild5f39d.ts.net:10000/healthz` | HTTP 200; `ok:true`, service `Perfect Timing website requests`. | The response differs from the local listener. A current mapping to the local process was not established. |

The installed local receiver (`C:/Users/LP15/PerfectTiming-Intake/server.mjs`, `normalize`) and the inspected retained cloud source (`C:/Users/LP15/PerfectTiming-Pipeline/cloud-intake/src/payload.mjs`, `normalize`) accept only `form`, `ai`, `voice`, or `unknown` as `source`. They reject the required `site_form_v1`. Their normalized records also omit `vin`, `callback_preference`, `callback_at`, and `submitted_at`. Silently dropping those values would lose the visitor's callback request. The cloud source inspection is a retained local source check, not independent proof of the exact deployed revision.

Historical receiver documentation in `docs/handoff/email-server/SENDER-INVENTORY.md` also records local health on 2026-10-09. No separate Phase 0/Phase 1 artifact confirming an endpoint for the new payload was located in the inspected repository documentation. The current health checks above refresh the relevant evidence without treating that historical check as current acceptance.

The form therefore uses the owner-authorized `mailto:` fallback until a compatible public HTTPS endpoint is confirmed. It opens a prefilled email for the visitor to send; opening a draft is not delivery and must not display the successful-backend confirmation. The destination is the shop email already published on the website. All five field groups, the specific callback time if provided, and submission metadata must survive into the draft. No third-party script is needed.

Do not publish `127.0.0.1:18795` as a public website endpoint: it would target each visitor's computer. A future public HTTPS proxy may route to PerfectTiming-Intake after its mapping and compatibility are verified. Preserve the existing cloud configuration used by other site features; configure this v1 form separately when ready.

## Request

`POST` to a confirmed public HTTPS endpoint, with `Content-Type: application/json`. The backend path may remain `/hooks/lead/webform` if that receiver adds this contract without changing legacy contracts.

```json
{
  "name": "Example Customer",
  "phone": "+12395550123",
  "vehicle": "2014 Honda Civic",
  "vin": null,
  "callback_preference": "asap",
  "callback_at": null,
  "submitted_at": "2026-10-25T12:00:00.000Z",
  "source": "site_form_v1"
}
```

The example is synthetic. Do not add service, location, driving status, symptoms, service-window, consent, or hidden customer-data fields to this v1 JSON.

| Property | Contract |
| --- | --- |
| `name` | Required, trimmed, nonempty string. |
| `phone` | Required US callback number: 10 digits or `+1` followed by 10 digits. The client can remove ordinary formatting before sending the canonical value. |
| `vehicle` | Required, trimmed, nonempty string. Prompt: `Year Make Model, e.g. 2014 Honda Civic`. |
| `vin` | Optional uppercase string or `null` when blank. The client advises about a 17-character VIN but never blocks submission on VIN format. The backend must retain a submitted short or imperfect VIN as unverified customer text rather than reject it for format. |
| `callback_preference` | One of `asap`, `today`, `tomorrow`, `next_week`, `specific`. Default `asap`. |
| `callback_at` | ISO-8601 UTC timestamp or `null`. Only populate when `specific` is selected and the optional `datetime-local` control contains a valid value. Convert the visitor's local date/time to an ISO instant. It is a callback preference, never a booked repair time. |
| `submitted_at` | ISO-8601 UTC timestamp. Preserve across retries of the same unchanged request. The receiver should also record its own authoritative receipt time. |
| `source` | Exactly `site_form_v1`. |

An optional `Idempotency-Key` header may carry a fresh UUID for each logical request. Reuse the same key and exact payload for an uncertain retry. Edited requests need a new key. The header does not add a visible input or a JSON property and is not authentication.

## Response and behavior

Persist the complete request durably before returning a successful 2xx response. The client requires a JSON receipt envelope with `ok:true`, `received:true`, and a nonempty string `id`: `{ "ok": true, "received": true, "id": "receipt-id", "receivedAt": "ISO-8601" }`. Idempotent duplicates may return 200 and the original receipt; a new request may return 201. Return a non-2xx response for unsaved requests; never send 2xx with an error envelope or an HTML error document.

On acknowledged backend success, replace the form with only the requested confirmation sentence, inserting the name as text: `Got it, [name]. Tony calls back [preference].` Use `ASAP` for asap/today/specific, `by tomorrow` for tomorrow, and `next week` for next_week. The caller's preference does not create or confirm an appointment.

On failure, retain the form values and stable retry payload, show a retry control, and log only a fixed error code or coarse HTTP status. Do not log names, phone numbers, vehicles, VINs, body contents, backend error text, or full thrown errors. Disable the submit control only while the network request is in flight. A malformed optional VIN never disables it.

## Receiver acceptance before enabling online submission

1. Verify the exact deployed receiver accepts and durably retains every property above, including `source: "site_form_v1"`, optional callback time, and a deliberately short synthetic VIN. Legacy form contracts must continue working.
2. Confirm the public HTTPS route reaches that compatible deployed receiver. Check exact-origin CORS/preflight from `https://fixingfortmyers.com` and `https://www.fixingfortmyers.com`; if using idempotency, permit its header. The inbox must remain private.
3. Run an owner-approved synthetic POST through that route, read back the saved request through the protected owner path, and verify retries return the same receipt without duplicating records or notifications. A health response or mocked 2xx alone is insufficient production acceptance.
4. Verify timeout, non-2xx, and invalid receipt responses preserve client values and permit retry. Never infer a saved request from an unconfirmed response.
5. Enable only this form's dedicated endpoint configuration after those checks. Keep analytics free of request contents; preserve the parallel phone CTA.

This work unit performs no production POST, runtime restart, proxy edit, backend deployment, customer message, provider configuration, or calendar write. Those acceptance gates remain pending; the mailto fallback is the verified delivery handoff available for this release.
