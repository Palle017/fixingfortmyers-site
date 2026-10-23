# Callback priority notice â€” proposed rollout

Raj approved the notice across existing inquiry surfaces on October 23, 2026. This is copy and a rollout checklist; it does not change live phone settings, send messages, or establish a response-time service level.

## Customer wording

> We receive a high volume of calls. Please leave your name, vehicle year and model, and a good time to call back. Requests with these details are prioritized because they give us the information we need to prepare before calling you back. The more we know upfront, the sooner we can return your call.

These details help the shop prepare a callback. They are not a new condition for submitting a request: sparse inquiries remain accepted, and vehicle details remain optional. An appointment remains penciled in until Tony verbally confirms it by phone. Existing emergency, consent, routing and approval rules still apply.

## Version-controlled surfaces

| Surface | Source | Proposed behavior |
| --- | --- | --- |
| Homepage contact and booking form | `index.html` | Full wording beside the existing shared form; the form stays usable without vehicle details. |
| Dedicated repair request | `request-a-repair.html` | The same notice and form used by the homepage and service-page dialog. |
| Saved-request acknowledgment | Existing inline receipt and `request-received.html` | Full wording without claiming notification delivery or an appointment confirmation. |
| Footer phone/text contact information | Existing `hours-disclaimer` in current public pages | Condensed priority explanation alongside the 24/7 request and no-immediate-response disclosures. |
| Consent-gated automatic web inquiry SMS | `_website-intake/customer-texts.mjs` | Condensed priority explanation in newly queued acknowledgments. Retain STOP/HELP, shop number, urgent safety text, consent checks and uncertain-send safeguards. |

Footer wording:

> Requests with your name, vehicle year and model, and a good callback time are prioritized so we can prepare before calling you back.

SMS wording (within the existing acknowledgment, maximum 320 characters):

> Requests with your name, vehicle year/model and callback time are prioritized so we can prepare.

SMS space is reserved for this explanation and existing safety/opt-out information before optional vehicle/problem repetition. This code changes only future enqueue content; it does not rewrite queued messages or broadcast to old leads. The copy in this repository is not proof that a separately deployed intake service has been updated.

## Exact proposed phone and Beside configuration

Target: the existing Perfect Timing business line **(239) 397-2048**, in the existing Beside business mailbox. Do not change routing, number ownership, forwarding, receptionist rules, access or credentials.

The actual provider control names and current setting values have not been inspected. The table gives exact proposed values, not invented API field names.

| Existing setting to review | Exact proposed text |
| --- | --- |
| Main phone / receptionist greeting | Thanks for calling Perfect Timing Auto Repair. We receive a high volume of calls. Please leave your name, vehicle year and model, and a good time to call back. Requests with these details are prioritized because they give us the information we need to prepare before calling you back. The more we know upfront, the sooner we can return your call. |
| Voicemail greeting | You have reached Perfect Timing Auto Repair. We receive a high volume of calls. Please leave your name, vehicle year and model, and a good time to call back. Requests with these details are prioritized because they give us the information we need to prepare before calling you back. The more we know upfront, the sooner we can return your call. Please include a brief description of the repair you need after the tone. |
| Existing automatic inquiry acknowledgment / missed-call text | We receive a high volume of calls. Please leave your name, vehicle year and model, and a good time to call back. Requests with these details are prioritized because they give us the information we need to prepare before calling you back. The more we know upfront, the sooner we can return your call. |

If a provider field has a shorter verified limit, use this condensed value without adding a response-time promise:

> We receive many calls. Requests with your name, vehicle year and model, and a good callback time are prioritized because these details help us prepare before calling you back.

## Remaining rollout and verification

1. Lead Mechanic reviews and merges the source PR under the existing workflow. Record the exact reviewed revision and passing tests.
2. Publish the website and applicable intake acknowledgment source through their existing approved release routes. A website release does not automatically deploy a separate intake service.
3. An authorized operator opens the existing business-line greeting, voicemail and automatic-reply controls, checks the actual field limits and current routing, then applies only the approved copy above. Preserve the existing recipients, consent, frequency limits and emergency handling. Do not send this notice to old leads.
4. Read back each saved value. Use an approved synthetic inquiry or operator call for verification; record the source revision/configuration receipt and what was actually heard or received. Do not contact a customer as a test.
5. Keep website, separately deployed intake SMS and phone/Beside rollout states separate. Until those receipts exist, phone/configuration changes are **proposed, not applied**. Do not infer rollout from a merged PR.

No Lead Mechanic browser-focus check, phone setting write, message send, service restart, DNS change or deployment is included in this patch.
