# Perfect Timing: scheduled service, parts prepay and supplier integration

## Current public MVP (October 16, 2026)

A customer can open the short existing repair form from an oil-service, detailing or walnut-blasting CTA, select a preferred day and Eastern time, choose **Call now** or submit for a callback, and optionally request a secure parts-payment link. A saved receipt means the inquiry was received, **not** a confirmed calendar reservation or a payment. The optional time and payment intent are embedded in the existing `details` / `callbackTime` contract so the cloud intake does not need a schema migration. No card details are requested.

The checkout is isolated from older P15G2 website worktrees and preserves the existing intake endpoint, original form, consent, idempotency behavior and production auth. Synthetic tests cover appointment preference and payment-link intent.

## Decision needed before publishing a percentage-off offer

Owner approved a **50% prepay incentive**, but did not specify its exact discount base. Confirm one precise choice: half of **oil-change labor**, half of **oil + filter materials**, or half of **the complete oil-change invoice**. Do not advertise a specific percentage or take a payment before the baseline, qualifying materials, refund terms, applicable taxes and eligibility are approved. Prepaid part orders should be placed only after VIN/vehicle specifications and job compatibility are confirmed.

Always match the OEM-required viscosity, formal approvals/specifications and capacity. **LIQUI MOLY** is used only when an approved product fits that engine; never promise compatibility without a verification step. Keep a complete itemized estimate before charging.

## True self-booking (later activation)

The connected Google account has an **owner-accessible Perfect Timing Shop calendar**. The public GitHub Pages website has **no secure Calendar API** and must never hold Google tokens. If the shop wants to show **real available slots and issue confirmed appointments**, connect a server-side booking provider with read-only availability and a reservation/hold endpoint, with collision protection, business hours, service duration, technician availability, cancellation rules, reminders and Calendar write authorization. The current MVP intentionally makes no availability promises.

Lower engineering effort alternative: create a Google Appointment Schedule or Square Appointments booking page with controlled slots and link it behind a reviewed **Book confirmed time** button. Google Calendar's native paid appointment flow uses Stripe and has eligibility limitations; its fixed booking payment is not suitable for arbitrary priced parts without a custom invoice/quote stage.

## Secure prepayment (later activation)

Prefer **Zoho Invoice Payment Links** already consistent with shop's quoting process. The business must have an enabled payment gateway. Flow: saved request -> verify VIN/part fitment -> shop-approved itemized estimate -> secure Zoho-hosted invoice or payment link -> payment confirmation/receipt -> order parts -> appointment confirmation. This prevents charging incorrect parts and separates part payment from scheduling. Payments must be created and verified server-side or through an authorized operator; never accept card data into website contact fields, put keys in static JavaScript or infer a payment succeeded because a browser clicked a link. Provide cancellation/refund terms.

The **Ask for a parts-payment link** website button only adds customer intent to the submitted inquiry; it does not charge. Replace it with an actual checkout button only for a signed, trusted, quote-specific merchant link after a real processor/account connection.

## O'Reilly integration

O'Reilly Pro documents both partner integrations and **direct API/punchout ordering and invoicing for single-location shops** at https://integrations.oreillypro.com/ . Approval and account access are required; a public product feed is not equivalent to price/stock/ordering permission.

Minimum phase: shop manually quotes through O'Reilly First Call or O'Reilly Pro, adds part IDs/brands/quantities/prices to Zoho estimate, sends payment link after approval, then orders. Automation phase after direct API access: VIN/vehicle lookup -> exact fitment plus alternate parts -> branch availability/ETA/cost -> reserve/order -> O'Reilly invoice sync -> match to job. Confirm credentials, allowed pricing use, APIs, terms and API rate limits before development. Never scrape authenticated catalog as a substitute for authorization.

## Operator work queue and attribution

Each inbound request should capture selected service, source landing page, preferred date/time, callback choice and payment intent. Owner Dashboard remains the source of truth for **requested -> contacted -> quoted -> approved -> paid parts -> scheduled -> completed**. Do not treat an inquiry as a reservation, an invoiced amount as paid, or a completed job as attributable to a specific organic query absent supported source IDs. Collect data first and measure gross profit per technician/bay hour per service.
