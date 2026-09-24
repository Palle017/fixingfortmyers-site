# Company update: ordered lead routing

Prepared locally on 2026-09-24. No production receiver was changed and no real SMS or call was sent. **Current owner decision: Bay One is off until the rest of the website is in production; Twilio delivery is optional, parked and disabled.** The code below is preparation for a later approved integration, not a description of an active production funnel. Google Business Profile also exposes a Shopmonkey quote-request link; confirm whether that existing CRM should receive leads before introducing another operational dashboard.

## Immediate contact path and existing Beside subscription

The immediate website path prepares a text to Tony's regular number, **(239) 397-2048**, in the customer's messaging app. The customer must press Send there. This requires no website SMS provider or new service subscription; the customer's carrier messaging terms still apply. Keep a call option and a copyable request for devices without an SMS app. An opened text draft is contact intent, not proof of a sent message, delivery, or durable server storage. Do not label it as a successfully received inquiry or execute the prepared alert rules from it.

Beside's official documentation, checked 2026-09-24, establishes these limits:

- Call forwarding can retain the existing carrier number, but it forwards calls only. SMS does not forward; texts sent from Beside show the Beside number unless the number is fully ported. No forwarding or porting changes have been made. [Number setup](https://help.beside.com/en/articles/10392720-port-your-number-vs-set-up-call-forwarding)
- Beside's built-in website lead capture requires a website Beside builds and publishes. A subscription does not automatically connect this custom website's form. Those built-in requests appear as callback cards in the Beside app. [Website lead capture](https://help.beside.com/en/articles/16925450-follow-every-lead-from-first-contact-to-paid)
- Beside currently documents no public API and recommends Zapier, including webhooks for custom workflows. Its published setup describes Beside events as triggers; an inbound custom-form action that sends an SMS or urgent call has not been verified. Do not promise that capability or zero additional cost from the subscription alone. [Integrations](https://help.beside.com/en/articles/9888342-crm-and-app-integrations)

Before choosing automation, inspect the existing account's plan, number arrangement, supported inbound actions and operational notifications with the owner. Preserve the current number and website. This research did not sign in, change an account, contact Beside, purchase a service, send a message or initiate a call.

## The editable IF / ELSE list

Edit `routing-rules.json`. Rules run from top to bottom; the **first matching rule wins**. Every condition within a rule must match. Keep the final empty `if` as the ELSE rule.

1. IF `stranded = yes` AND `starts = no`: first priority; request one text alert and one phone call to Tony at **(239) 397-2048**, at any hour.
2. ELSE: preserve the inquiry for normal follow-up. Unknown or incomplete starts/stranded answers are marked for review, never discarded.

Permitted fields: `starts`, `stranded`, `drivable` (`yes`, `no`, `unknown`); `source` (`form`, `ai`, `voice`, `unknown`); `afterHours` (`yes`, `no`). Operators are `eq` and `in`. Actions are `notify_sms`, `notify_call`, or `normal`. `normal` cannot be combined with alerts. The list permits up to 30 rules; each rule may contain up to eight conditions. Invalid rules stop receiver startup instead of silently falling back.

To add a preset, insert another object before ELSE, for example:

```json
{
  "id": "example-after-hours-review",
  "label": "After-hours inquiry without a confirmed urgent condition",
  "if": [{"field":"afterHours","operator":"eq","value":"yes"}],
  "then": ["normal"]
}
```

The seeded urgent rule stays above this example so after-hours filtering cannot hide a stranded/no-start lead. Rules contain no recipients, URLs, secrets, JavaScript or arbitrary commands. Server code fixes Tony's destination. Rule ID, version, fingerprint and decision are saved with each new inquiry; changing rules does not retroactively alert old leads.

## Customer facts and Bay One

The form supplies `city` (up to 100 characters), `starts` and `stranded` as explicit `yes`/`no`/`unknown` values. Missing legacy fields remain unknown. Existing lead schema, consent evidence and idempotency keys are preserved. Bay One may extract reviewable fields from customer text through the existing DeepSeek API. It returns `intake`, a deterministic next question, and `ready`; it cannot submit a lead, choose a recipient, trigger an alert, quote prices, book appointments or confirm dispatch.

**The customer's reviewed final form values are authoritative.** Model suggestions do not trigger the rules by themselves. The customer can correct every value or use the conventional form directly. Immediate recognized hazards receive fixed emergency/roadside guidance even if the model is unavailable. Common phone/email/VIN and explicitly introduced name patterns are removed before provider requests; this reduces accidental identifiers and is not full anonymization.

Owner-confirmed availability is 24/7. If Bay One is later enabled, its prepared assistance window is outside **8 a.m.–8 p.m. America/New_York**. Bay One is currently off by owner instruction. After-hours repairs depend on the job, location and availability; Tony confirms dispatches. The prepared urgent rule runs at every hour, independently of that assistance window.

## Storage, duplicate protection and limits

One SQLite transaction commits the lead, its rule decision and each requested alert row before returning a receipt. The unique `(lead_id, channel)` key prevents duplicate call/text entries for a repeated submission. No notification API is called before the commit.

With delivery enabled, persistent limits allow one urgent alert pair per callback number per 15 minutes and at most 20 new alert pairs per rolling 24 hours. Additional inquiries are still stored and their alert rows show `suppressed` with the reason. Server-only configuration can set the cooldown to 5–1,440 minutes and the global cap to 1–100 pairs. These are safeguards, not a claim that the submitted callback number is verified. Existing origin, honeypot, request-size and IP/global rate controls remain. Review suppression and spam before paid activation.

## Delivery states and recovery

The existing private inbox now displays routing and both alert channels. It remains loopback-only and protected by existing Host/Origin checks; operating-system access to the shop computer is required. Alert recovery additionally requires a random operator token of at least 32 characters in `LEAD_OPERATOR_TOKEN`. Enter it in the inbox recovery field; it stays in page memory and is never put in a URL or browser storage. Do not expose the private listener through Funnel.

| State | Meaning / action |
| --- | --- |
| `disabled` | Integration is prepared but not activated. Review the saved inquiry directly. |
| `pending` | Queued, or retrying a confirmed unprocessed/rate-limited request. |
| `accepted` | Provider returned a SID; delivery is not yet confirmed. Poll the existing SID. |
| `delivered` | Provider confirms SMS delivery; not proof Tony read it. |
| `completed` | Provider reports a completed phone connection; may be voicemail/IVR and is not proof Tony heard it. |
| `failed` | A definite rejection or terminal delivery failure; inspect the provider record and recover the inquiry. |
| `suppressed` | Callback cooldown or global cap prevented an additional alert; inquiry remains visible. |
| `needs_review` | An uncertain send, interrupted process, or unconfirmed old delivery requires provider reconciliation. Never blindly resend. |

HTTP 429 is retried with bounded backoff. Timeout, network failure, malformed success or HTTP 5xx on a create request is ambiguous and is **not** automatically replayed. On restart, an interrupted `sending` row becomes `needs_review`. Existing provider SIDs are polled, never recreated by Retry. A failed voice call can be recovered by Tony calling the saved customer personally; automatic repeated ringing is deliberately prevented. Provider status checks stop at review after 24 hours without confirmation.

## Optional parked integration: activation still required

Current verification found this machine is P15G2; neither project-root `runtime.json` nor receiver `data` exists here, and ports 18795/18798 are not listening. The current Tailscale REDLINE peer reports offline. Its current tailnet DNS differs from the historical URL in the original README. Locate the actual running receiver and persistent database on REDLINE before backend deployment; do not create an empty replacement database and call it migration.

The owner reports an existing Beside subscription; its account capabilities and number setup remain unverified. No Twilio account is confirmed, and that adapter is parked while Beside is assessed. If Twilio is later chosen, obtain approval for its account, sender number, paid usage and applicable messaging registration before enabling it. US application SMS requires the appropriate registered local-number campaign or verified toll-free setup. Record Tony's anytime operational alert permission and honor opt-out/suppression; this integration does not send customer texts. Tony personally contacts customers according to their recorded permission.

Server environment, outside Git:

```text
LEAD_ALERTS_ENABLED=false
LEAD_ALERT_TO=+12393972048
LEAD_ALERT_FROM=<approved Twilio sender number>
TWILIO_ACCOUNT_SID=<secret configuration>
TWILIO_AUTH_TOKEN=<secret>
LEAD_OPERATOR_TOKEN=<random secret, at least 32 characters>
LEAD_ALERT_COOLDOWN_MINUTES=15
LEAD_ALERT_MAX_DAILY_PAIRS=20
```

`LEAD_ALERTS_ENABLED=true` is an explicit paid-activation gate. Factory callers and previews default to disabled and do not inherit this activation setting. `LEAD_ROUTING_RULES_FILE` optionally points to an approved rule file. Changing the destination requires a reviewed source change; arbitrary configured recipients are rejected.

On the identified receiver: back up SQLite using its backup API (or stop only this receiver and copy the full data directory including WAL/SHM), preserve its existing data path, copy the reviewed source including the rules and alert modules, run the tests, restart only this receiver, and verify local health/inbox plus stored synthetic requests. Leave alert delivery disabled until the separate provider activation is approved and verified. Rollback restores prior source while preserving the additive database tables and all leads; do not reset Tailscale or overwrite the database.

Verification command (synthetic databases, mocked network):

```text
node --test _website-intake/server.test.mjs _website-intake/metrics.test.mjs _website-intake/routing.test.mjs
```

Fourteen tests passed locally. Coverage includes rule order/validation, daytime and after-hours urgency, unknown answers, atomic storage, idempotency, persistent limits, delivery failure/retry/restart, fixed destinations, authenticated recovery, prompt injection, disabled estimates and hazard fallback. Live provider delivery, actual REDLINE storage, production backend cutover and real-model extraction remain unverified.

Provider references: [Twilio Messages API](https://www.twilio.com/docs/messaging/api/message-resource), [Calls API](https://www.twilio.com/docs/voice/api/call-resource), [unprocessed HTTP 429 requests](https://www.twilio.com/docs/api/errors/20429), [messaging policy](https://www.twilio.com/en-us/legal/messaging-policy). Create endpoints do not document caller-supplied idempotency, which is why ambiguous sends require review.
