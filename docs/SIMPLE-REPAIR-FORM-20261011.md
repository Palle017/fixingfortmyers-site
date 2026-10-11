# Simpler repair request form (2026-10-11)

First screen: Vehicle, What's going on?, Your name, Best number, Request Repair. Everything else (photos/video, type of repair, drives/stranded, car location or drop-off, city/ZIP and map pin, timing, text consent, voice note, Bay One) sits behind "Add photos or more details (optional)".

Intake contract is unchanged: `POST /hooks/lead/webform` with the same fields and Idempotency-Key. Car location is optional now; `carLocation` is only sent when chosen. City is optional for the customer; the payload keeps `locationContract:'sender-v1'` and sends `city:'Not provided'` when blank, so the live cloud intake's sender-v1 city check still passes.

States: success only after `ok && received && id`; success replaces the form in place (reference, Call us, Add another photo when the intake supports uploads, Return home). A network error, 5xx or unconfirmed reply retries the same payload and key twice in the background (4 s, 12 s) unless the customer edits. A 4xx shows the intake's message and keeps every entry. Files the form can't send are counted and reported.

Analytics: `window.dataLayer` events `form_start`, `form_submit_attempt`, `form_submit_success` (after confirmed save), `form_submit_error`, `form_validation_error`, `form_photo_added`, `phone_click`, `text_click`, `request_form_click`, with fixed categories only. Set `GA4_ID` in site.js to load Google Analytics on the live host; empty loads nothing.

Attribution: each lead's details end with `Found via: <allowlisted source>; last page viewed: /<known service page>`.

Rollback point: commit be87a32 (main before this work; the git proxy refuses tag pushes).
