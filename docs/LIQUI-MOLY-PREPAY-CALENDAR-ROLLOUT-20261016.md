# Perfect Timing — LIQUI MOLY labor prepay & Google Calendar booking rollout

Owner-confirmed October 16, 2026. This is an operator spec, not evidence that a payment processor, supplier API, or live Calendar reservation is connected.

## Public offer — exact eligibility

> **Prepay the correct, shop-approved LIQUI MOLY motor oil and get 50% off oil-change labor.**

- Applies only to the **oil-change labor line item**. The LIQUI MOLY oil itself, filter, taxes, other parts/fees, inspection/diagnostics and other repairs are not discounted.
- The shop checks year/make/model/engine, OEM oil specifications/approvals, viscosity and volume *before quoting and taking payment*. If no LIQUI MOLY product meets OEM requirements, do not sell an incompatible oil to win a promotion.
- The customer pays for the shop-confirmed compatible oil **in advance**, through a trusted, itemized shop-sent payment link. The discount is applied to the approved oil-change labor line in the estimate/invoice only **after oil prepayment is verified**.
- A customer inquiry, selecting a date, receiving a link, or opening checkout does **not** mean parts are paid or a service appointment is confirmed. Do not automatically order materials on a mere submit/click.
- Customer cancellation, returns, order-specific non-refundable costs, handling of opened or specially ordered oil, rescheduling and refund terms should be stated **in the actual quote/payment request before collecting money**. Do not invent a non-refundable blanket policy.
- No other percentage or labor price is promised without an owner-approved rate schedule. This is a brand-specific service offer, not a claimed LIQUI MOLY manufacturer partnership.

### Invoice rules

Let L be the normal quoted oil-change labor price, O the confirmed LIQUI MOLY oil charge, F the filter, X other documented line items and T the applicable tax/fees. For an approved qualifying prepaid-oil purchase:

    oil_change_labor_discount = 0.50 * L
    adjusted_oil_change_labor = L - oil_change_labor_discount
    final_invoice = O + F + adjusted_oil_change_labor + X + T

Do **not** halve O or F. Show the normal labor line, an explicit 50%-of-labor promotional credit, and the reduced labor. Example only: $80 labor becomes $40; this example is not a published labor rate.

## Customer journey — friction minimized

1. Customer chooses oil service or the LIQUI MOLY offer on a real service card/landing page. Link contains only fixed \`service=maintenance&schedule=1&offer=liquimoly-labor50\`, never personal data or a payment token.
2. Existing short form shows the offer terms, selected oil-change category, native preferred-day/time selector, and a preselected **request secure parts-payment link** intent. The hero date/time picker still mirrors the single repair form, not a second submission.
3. Customer chooses **Call now** or submits name, phone, vehicle and issue. Existing cloud intake returns a genuine receipt or a truthful unsent text/email fallback. The preference is recorded as **requested only**.
4. Owner Dashboard receives the request once with source, promo flag, preferred callback/service time and parts-prepay intent. Operator verifies VIN/required oil spec and writes the formal itemized estimate (and Florida estimates/disclosures where applicable).
5. Only after customer accepts oil/fitment/quote, shop sends a merchant-hosted Zoho Invoice Payment Link for the approved oil charge. Verify gateway confirmation independently, not a button tap. Customer can pay without disclosing card details to Perfect Timing's static public site.
6. Operator confirms inventory, orders the oil after verified payment, and confirms an actual **service appointment** based on workload and part ETA. Follow up with confirmation (through customer-authorized channels).
7. Complete oil/filter change, finalize labor charge with 50% oil-change labor discount, record the work/amount and accurate source attribution in Owner Dashboard/My Garage once customer authorization and access controls exist.

### Minimal state machine

\`new_request\` -> \`contacted\` -> \`oil_fitment_verified\` -> \`estimate_approved\` -> \`oil_payment_requested\` -> \`oil_paid\` -> \`parts_ordered\` -> \`service_confirmed\` -> \`completed\`

Alternate states: \`needs_vehicle_details\`, \`no_compatible_liqui_moly\`, \`quote_declined\`, \`payment_expired\`, \`appointment_rescheduled\`, \`canceled\`, \`refund_review\`. Keep payment/order actions idempotent by provider IDs. Do not silently advance states from an email opening, visit counter or payment-link click. Historical records retain original owner notes and stages.

## Google Calendar — rollout with one coherent booking source

**Existing evidence:** The personal connected Google account \`prudhvi.pallempati@gmail.com\` owns a secondary calendar named **Perfect Timing Shop**. This is not evidence of public availability, shop operating hours or a connected API with permission to create bookings.

**Fast managed deployment:** Create one Google Calendar **Appointment Schedule for 15-minute customer callbacks**, ideally from the business account \`fixingfortmyers@gmail.com\` so public pages/confirmations use the shop identity rather than the manager's personal Google name. On a personal Google account, Google currently supports one booking page; creating appointment schedules on secondary calendars may require eligible Workspace plans. The official Google Calendar GUI on a computer is required to create/edit appointment schedules. The available connected Calendar API action set does not create this schedule.

Official setup: https://support.google.com/calendar/answer/10729749?hl=en
Plan caveats: https://support.google.com/calendar/answer/16287038?hl=en

For the callback appointment schedule (not oil-service bay reservation):
- Booking title: "Perfect Timing — Talk with our shop (15 minutes)". Location: phone. Avoid exposing Tony's private mobile number or physical shop address.
- Business-owner to confirm availability hours first; **do not infer open booking slots from an empty calendar**. Set America/New_York, scheduling window, minimum notice and buffer times to actual coverage.
- Google booking form requires name and email; add callback phone and service/vehicle topic with privacy wording. Do not demand VIN/credit card in the public callback form.
- Enable email verification/reminders if account eligible. Test with a non-owner synthetic address in a controlled preview, then verify both owner and visitor notifications.
- Use *exactly one* booking page URL. Place a secondary **Book a confirmed callback** link on the site only after its actual URL and shop account identity are verified. Do not confuse it with the current preferred-service-time form.
- A Google appointment booking confirms only a **15-minute shop callback**. The repair drop-off time is a separate confirmed event after work scope, parts and capacity are verified.
- For a service appointment: use the shared Perfect Timing Shop calendar as the operational schedule of confirmed work orders; include limited job ID/vehicle/service info, no confidential invoice/card data. Booking should not expose other customers' events.
- Reconcile Google booking identity with saved lead identity server-side before creating additional notifications; enforce no duplicate contacts on repeated callbacks/webhooks. Limit who can modify bookings and require clear reschedule/cancel handling.

**If the business Google account cannot create an eligible native booking schedule:** Keep the tested preferred-time request with manual confirmation, rather than inventing actual availability or using a personal calendar with public identity leakage. Evaluate a verified managed scheduler only if it materially reduces friction. Never put Calendar OAuth tokens in public GitHub Pages JavaScript.

## Secure payment choice

The shop has historically used Zoho Invoice. Official Payment Links create a customer+amount+expiry link, then record successful gateway payments; a configured merchant gateway is a prerequisite: https://www.zoho.com/in/invoice/help/payment-links/

Keep prepayment separate from Google's optional **paid appointment** feature. Google's calendar payments require eligible plans and Stripe; booking deposits are fixed amounts and are not the itemized variable-cost O'Reilly oil/parts invoice we need: https://support.google.com/calendar/answer/13762729

Shop must confirm gateway and approved oil amount before any link creation. The website's **Ask for a parts-payment link** control only saves customer intent and never accepts card data.

## Supplier workflow: O'Reilly Pro

Official integration hub confirms **direct API or punchout ordering and invoicing for single-location shops** and lists \`integrations@oreillyauto.com\` as contact: https://integrations.oreillypro.com/

Request supplier authorization for VIN/YMME/part fitment, commercial price and core/fee data, stock/ETA per branch, cart/order endpoints, returns/status, electronic invoice/credits, OAuth/auth keys, sandbox, rate limits, costs, and API retention/security terms. Existing O'Reilly account number should be provided directly by the business through O'Reilly's secure onboarding, not posted to a public repo or email unless the vendor requests it.

Until authorized: technician verifies correct-spec LIQUI MOLY oil and filter in O'Reilly Pro, approves price/ETA, creates Zoho quote, collects verified payment, orders manually and links the supplier receipt/invoice to Owner Dashboard.

## Florida estimate and authorization guard

Florida's 2026 Motor Vehicle Repair Act, §559.905, generally requires a written estimate and disclosures before work expected to exceed $150. §559.907 restricts estimate charges. Treat a public appointment request and oil-payment authorization as separate from authorization to perform vehicle repairs.

https://wwwo.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0500-0599%2F0559%2FSections%2F0559.905.html
https://wwwo.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&Search_String=&URL=0500-0599%2F0559%2FSections%2F0559.907.html

## Release gates and tests

- **Public offer:** correct discount base, all exclusions explicit, accessible mobile link, no source leakage, unknown offer strings rejected.
- **Repair intake:** selected service, preference, and requested promo survive through server receipt; changing service clears promo eligibility; no auto-charge/auto-book.
- **Calendar:** verify business account identity, an actual native appointment schedule URL, collision prevention and booking confirmations before enabling bookable-slot claims.
- **Payments:** merchant account linked, price/fitment approved, itemized quote and tax calculations confirmed, authentic payment success, no duplicate charge, cancellation/refunds defined.
- **O'Reilly:** written supplier approval and test account before calling production API; no scraping and no automatic orders without approved quote+verified funding.
- **Dashboard:** source attribution from landing page to lead to verified oil prepay, booking and gross-profit/job-hour, with role-based customer privacy.
