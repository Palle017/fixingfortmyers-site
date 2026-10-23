# Beside capture coverage and review contract

The browser worker reads a bounded rendered view. Its result is a source observation with gaps,
not a provider export or proof that every conversation has been inspected.

| Surface | Current supported capture | Coverage boundary |
| --- | --- | --- |
| Conversation list | Native chat IDs and rendered labels from one visible inventory | No verified list pagination; off-window conversations remain unknown |
| Selected thread | Three stable rendered observations with URL, account/contact identity and saved raw nodes | Older paging and complete provider history remain unverified |
| Event dates | Rendered date/time labels retained with their basis | Ambiguous, future or missing event dates remain unknown |
| Direction | Explicit source direction retained when provided | Flat text alone does not establish inbound versus outbound |
| Receptionist calls | Visible call markers and recap text | A recap is distinct from a full transcript, recording or a new request |
| Contacts and Notes | Separate source UI surfaces exist | The normal worker does not export these surfaces |
| Attachments and recordings | Existing rendered evidence may mention media/links | Files, audio and unrendered transcripts are not downloaded |
| Source Spam category | Separate source UI control exists | No account-wide Spam export is implied |
| Owner Dashboard Junk | Owner-controlled folder overlay | Source refresh preserves the owner's folder and workflow fields |

## Scheduling within the visible window

A pass reserves its first slot for a due visible conversation using successful checks and bounded
recent attempt history. New changing previews cannot indefinitely occupy all 25 slots. A failed
first read is recorded as an attempt so a later new job can inspect another due row. Failure
evidence does not turn a failed or skipped read into a successful source checkpoint.

The worker reads bounded existing run inventories and writes per-run `selection-attempts.json`.
It does not use private settings, lease contents or settings backups as scheduling history.
Account/identity failures, claim uncertainty and import-review holds retain their existing gates.

## Evidence and qualification

Dated repair context is separate from the latest contact activity. A recent empty call or shop
reply does not establish a new repair request. Known automated prompts are identified, while
unknown direction and incomplete calls remain unqualified review items.

Observed first-person vehicle wording can produce a candidate with provenance. Existing manual
fields and known vehicle values are preserved. A candidate is not proof of a new customer request.
User-confirmed classifications belong in the reviewed classification workflow; source automation
must preserve those decisions.

Changed or not yet baselined substantive evidence on a previously excluded conversation raises a private
review artifact while preserving its classification and owner Junk decision. Operators can inspect
`review-needed.json` alongside the raw capture and original source before changing it.

## Counts and validation

Receipt count keys retain their existing compatibility semantics. In particular, the legacy
`conversationsRead` value is inventory rows, and `full_threads_read` is rendered captures.
Use the added coverage evidence to distinguish listed, attempted, saved rendered, uninspected
and parsed observations. Complete provider-thread history is not verified.

Fixtures cover changed-preview starvation, repeated source-read failures across new jobs, older
recaps beside recent calls, outgoing prompts, empty calls, unknown direction, date ambiguity,
candidate provenance, stable native IDs and preserved owner classification/workflow decisions.
Live acceptance still requires the reviewed installed revision, a fresh authorized job, a matching
completion receipt and independent dashboard readback. A merged PR or heartbeat is insufficient.

## Actual message acquisition

The optional `--require-messages` mode requires verified selected message-surface evidence and actual bounded message records. Three stable, identity-matched source observations must agree. A composer-adjacent `Message` button is not a navigation tab and cannot satisfy this proof.

Current collectors still provide rendered-thread observations; this change adds no invented source selector or browser adapter. Without verified message evidence, requested message acquisition returns `CAPTURE_INCOMPLETE` before import or a successful checkpoint. The default rendered-thread mode remains explicitly limited and is not a claim that current messages were acquired. Any attempted source-read or normalization failure also prevents successful refresh completion; deliberate bounded selection is reported separately.

Source-event IDs and times are retained only with their supplied provenance. Capture time is an observation clock. Rendered day labels, outbound activity and weak/synthesized observation identities cannot establish fresh inbound customer activity. Historical repair context stays separate from verified current message bodies.

The optional `source_event_id`, `source_event_at`, `source_captured_at` and bounded priority evidence are source artifacts here. This PR does not migrate or activate a downstream receiver. Meaningful card-update persistence and dashboard ordering require their separately reviewed integration.

## Replay boundaries

Repeated verified message records retain the same source fingerprint when their event fields are unchanged. Legacy relative-date guesses remain uncertain; a new observation or changed capture clock is not proof of a new customer event. Distinct provider-native message IDs remain distinct even when sender and text match. Never manufacture a native event identity from sender, body text or capture time.

The existing native-event ledger uses its event-key uniqueness and transaction to protect stable-ID replay. Identical stable-ID payloads are duplicates; changed payloads with that same identity conflict, while a genuinely new ID is retained. If the provider supplies no stable event ID, unidentified review observations cannot guarantee a single effect across redeliveries. Preserve this uncertainty rather than collapsing possible real messages by content.

Source fixtures cover duplicate capture, changed content, distinct same-body events, outbound-only evidence, weak identity and acquisition failure. They do not establish downstream deployment or a general single-effect guarantee for systems without stable delivery identity or an acknowledged atomic operation.
