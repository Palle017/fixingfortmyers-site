# Perfect Timing — 24/7 penciled-in appointment policy

Owner decision, October 16, 2026. Supersedes earlier 9 AM–4 PM and standard business-hour booking assumptions.

## Business rule

- Tony accepts appointment requests 24 hours a day, every day, including weekends, nights and holidays.
- Any customer-selected time is a request. A calendar entry may be created tentatively after valid acknowledgement, but no date is actually confirmed without Tony verbally confirming the appointment by phone.
- Calendar conflicts warn Tony but do not automatically block customers from requesting that time.
- Customer acknowledgement: "I understand my appointment is penciled in only, not confirmed. Tony must speak with me by phone and verbally confirm the appointment before it becomes official."
- The customer must re-acknowledge if the selected time changes.
- Phone confirmation is an owner-operator action, not inferred from a call, AI response, auto SMS, payment or calendar presence.

## Shipped website contract

- The hero and direct repair form accept any clock time, not restricted shop hours.
- Selecting a full date and time requires the specific acknowledgement and persists an audit statement in the existing lead details.
- Website receipts confirm that the lead reached intake, not that a Google Calendar event was created. There is no automatic booking at this stage.
- Original forms, consent, attribution, payment-link intent and retries remain intact.

## Remaining secure backend work

The separately staged Cloud Intake branch at commit 808e863 only supports read-only daytime conflicts; it has not been deployed and does not insert events.

1. Extend Cloud Intake to normalize and validate minute-level appointment date/time and versioned acknowledgement, including daylight-saving ambiguity handling.
2. After persisting the lead, atomically queue exactly one tentative calendar write tied to its lead reference, with durable retries and deterministic provider event IDs.
3. Authorize server-side Google Calendar event-writing permission only for the existing Perfect Timing Shop secondary calendar. Store credentials as private cloud secrets, never in public GitHub Pages or static JavaScript.
4. On successful Google Calendar readback, mark the request "PENCILED IN — AWAITING TONY PHONE CONFIRMATION". Use a private event with no exposed customer details and a nonblocking (transparent) tentative status. A placeholder marker duration is not the length of the repair job.
5. Owner Dashboard statuses: inquiry received -> calendar pending -> penciled in -> verbal confirmation logged -> confirmed; error/retry and cancellation states separately. Only a deliberate, authenticated operator action after a real conversation may confirm the appointment.
6. Check rate limits, conflicts, DST, retries, duplicate receipts, cancelled or rescheduled events, and permissions before enabling production calendar writes.

Do not claim the customer is penciled in until the Google Calendar API has acknowledged or a deterministic event-ID lookup confirms the event. A lead receipt never means an appointment is confirmed.
