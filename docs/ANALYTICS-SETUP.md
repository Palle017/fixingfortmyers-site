# Website measurement setup

The custom intake counter and Google Analytics are separate systems. A populated
`dataLayer` in the browser does **not** prove that Google received anything.

## Current configuration

- `contact-config.js` must run before `site.js` on every measured page. Both can
  use `defer` in that order. Existing preview hosts do not send analytics.
- `ga4MeasurementId` is deliberately blank. No Google script is loaded until
  the owner's actual web-stream ID is provided. Do not invent an ID.
- Custom events use the existing configured intake endpoint and unchanged
  `{event, event_id, page, source}` body. The live cloud implementation is not
  in this checkout, so its page/source allowlists were **not** expanded.
- The receiver retains `/`, `/module-programming-fort-myers`,
  `/repair-guide-ecu-tcm-programming`, `/parts`, legacy `/parts-quote`, and
  `/other` buckets. These remain coarse even though all pages can now call it.
- GA4/local diagnostics use the exact canonical path of each known content
  page. Unknown paths become `/other`; queries, fragments, raw referrers and
  customer text are excluded. Keep the explicit page allowlist current when
  adding a page.
- Anonymous acquisition uses one allowlisted category in tab-scoped
  `sessionStorage` (`pt-metric-source-v1`). Internal navigation and a missing
  referrer preserve it; a new explicit campaign or external arrival replaces
  it. There is no custom visitor ID or persistent local-storage identifier.
- Existing explicit UTM lead-channel handling remains separate and compatible.
  Arbitrary UTM channel values never become analytics `lead_source`. Campaigns
  not supported by the receiver's source list remain `other` there.

## Finish GA4 in the owner's account

1. Obtain the actual GA4 web data stream's measurement ID and enter it in the
   production branch of `contact-config.js` as `ga4MeasurementId`.
2. Disable Enhanced Measurement's automatic form tracking, outbound link/site
   search measurement, and history-based pageviews for this stream. This site
   deliberately sends bounded events and sanitized manual pageviews; automatic
   events could duplicate them or collect URL/link values outside that contract.
   Confirm any existing tag-manager containers do not add a second tag.
3. Keep the site's privacy disclosure accurate for the measurement actually
   enabled. The current blank configuration does not load GA4.
4. Mark `form_submit_success` as the repair-request key event. It fires only
   after the intake returns a positive saved receipt, not when a user opens the
   form, presses Send, or opens an unsent SMS/email draft. Do not also count a
   thank-you page view as another conversion for the same request.
5. Add an event-scoped custom dimension for `lead_source` if that fixed-source
   breakdown is needed in reports. Use page paths for page-level performance.
6. Validate one owner-authorized test request in Realtime/DebugView and the
   actual intake, then confirm only one key event. Also check phone/text clicks
   separately; a click does not prove a completed call or sent message.

Success stays in the existing receipt view so selected uploads finish and
customers can add another photo. There is no redirect to `/request-received`.
That page remains useful for viewing a stored receipt, not as proof that an
unconfirmed submission was received. No receipt ID or customer data enters an
analytics event.

## Runtime diagnosis

Read `window.PT_ANALYTICS_STATUS` in the browser console. It contains only fixed
public categories:

- `ga4: not_configured` / `invalid_id`: Google collection is not enabled.
- `ga4: preview_disabled`: this host is intentionally not measured.
- `ga4: loading`, `tag_loaded_unverified`, or `tag_load_failed`: script state;
  even a loaded script still requires Google-account confirmation of receipt.
- `customMetrics: configured_unverified`: an endpoint is configured, not a
  claim that its server accepted or stored events.
- `page`, `receiverPage`, `source`: the safe values selected for this page.

The custom endpoint retries a failed event once with the same event ID. Its
availability and schema must be verified by the cloud deployment owner before
claiming successful collection. To get exact-page custom counters, update and
test both the cloud allowlist/storage and this client in a coordinated release.

## Verification performed locally

The analytics and attribution tests use mocked HTTP only. They cover source
continuity, different www/non-www navigation, blocked storage, path and parameter
privacy, a legitimate blank GA4 configuration, manual pageview behavior, receipt
acknowledgment, and separation of lead-channel data from anonymous analytics.
Repair and dialog regression tests preserve submission and in-place receipt flows.

Google's manual pageview guidance:
https://developers.google.com/analytics/devguides/collection/ga4/views

Google's configuration reference:
https://developers.google.com/analytics/devguides/collection/ga4/reference/config
