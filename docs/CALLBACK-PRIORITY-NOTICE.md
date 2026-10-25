# Callback priority notice â€” proposed rollout

Raj approved the notice across existing inquiry surfaces on October 23, 2026. Copy was refined on October 24 to welcome partial information and explain spam gently. This is copy and a rollout checklist; it does not change live phone settings, send messages, or establish a response-time service level.

## Customer wording

> We receive a lot of spam. Your name, callback number and a short repair description help us know who to contact. Vehicle details and a good callback time help us prepare, so requests with useful details are prioritized. Send what you know; partial information is welcome.

These details help the shop prepare a callback. Missing information alone is not evidence of spam. They are not a new condition for submitting a request: sparse inquiries remain accepted, and vehicle details remain optional. An appointment remains penciled in until Tony verbally confirms it by phone. Existing emergency, consent, routing and approval rules still apply.

## Version-controlled surfaces

| Surface | Source | Proposed behavior |
| --- | --- | --- |
| Homepage contact and booking form | `index.html` | Full wording beside the existing shared form; the form stays usable without vehicle details. |
| Dedicated repair request | `request-a-repair.html` | The same notice and form used by the homepage and service-page dialog. |
| Saved-request acknowledgment | Existing inline receipt and `request-received.html` | Full wording without claiming notification delivery or an appointment confirmation. |
| Footer phone/text contact information | Existing `hours-disclaimer` in current public pages | Condensed priority explanation alongside the 24/7 request and no-immediate-response disclosures. |
| Consent-gated automatic web inquiry SMS | `_website-intake/customer-texts.mjs` | Condensed priority explanation in newly queued acknowledgments. Retain STOP/HELP, shop number, urgent safety text, consent checks and uncertain-send safeguards. |

Footer wording:

> We receive a lot of spam. Name, callback number, repair details and a good callback time help us prepare and prioritize callbacks. Vehicle details help, but send what you know; partial information is welcome.

SMS wording (within the existing acknowledgment, maximum 320 characters):

> We receive spam. Name, number, car, issue and callback time help us prepare and prioritize. Send what you know.

SMS space is reserved for this explanation and existing safety/opt-out information before optional vehicle/problem repetition. This code changes only future enqueue content; it does not rewrite queued messages or broadcast to old leads. The copy in this repository is not proof that a separately deployed intake service has been updated.

## Phone and Beside scope — October 25, 2026 correction

The owner reports that the live receptionist asks for **name and car model only**.
A preferred callback time is optional. Do not ask repair-issue questions, offer
appointments, or start a chat flow. This phone-specific scope supersedes the
earlier proposed phone scripts in this document; those scripts must not be
applied from this runbook.

This is an owner-reported setting, not an independent provider readback. The
actual provider control names and current setting values have not been inspected
in this documentation correction. No greeting, voicemail, automatic reply,
routing, number ownership, forwarding, access or credential was changed.

| Phone surface | Scope and evidence |
| --- | --- |
| Main phone / receptionist greeting | Name and car model only; callback time optional. Do not add issue questions or appointment collection. Owner-reported current scope; no new script proposed. |
| Voicemail greeting | No independently verified current text and no replacement authorized by this document. Do not apply the superseded repair-description script. |
| Existing automatic inquiry acknowledgment / missed-call text | No independently verified current text and no replacement authorized by this document. Keep this separate from the website acknowledgment source above. |

The phone scope does not restrict the website form: name and callback number
remain required for cloud submission, while vehicle, symptoms and other details
remain optional. Partial website inquiries are welcome. Keep the existing
website booking journey: any requested time is tentative, and only Tony's actual
verbal confirmation by phone makes an appointment official. The receptionist
does not confirm appointments.

## Separate rollout states and verification

- **Website copy:** PR #160 merged October 24. The notice is present in the
  public homepage and footer HTML checked October 25.
- **Website intake SMS:** the acknowledgment source is version controlled here.
  A website merge does not establish deployment of the separate intake service,
  notification delivery, or changes to already queued messages.
- **Phone/Beside:** scope above is owner-reported. Provider readback remains
  unverified. The older scripts were **proposed, not applied** by that source
  change and are now superseded; do not use them as live configuration evidence.

For future authorized work, record the exact source revision or provider
readback for the surface actually changed. Any provider-setting change or
synthetic operator call needs its own scoped authorization; this document is
not a command to perform it. Preserve consent, frequency limits, routing and
emergency handling. Do not send the notice to old leads or contact a customer as
a test. No response-time service level is established here.
