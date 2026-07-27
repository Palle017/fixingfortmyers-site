# Real repair case-study workflow

The website must never invent a vehicle, complaint, test, diagnosis, repair, measurement, photo, or outcome. A case is publishable only when the shop record supports it.

## Capture before work

- Customer permission to publish a de-identified repair story and photos
- Vehicle year, make, model, engine, and mileage
- Customer's complaint in their own words
- Warning lights, codes, noises, operating conditions, and prior repair attempts
- Wide vehicle photo with plate, VIN, customer paperwork, faces, and addresses excluded or blurred

## Capture during diagnosis

- Initial scan report or measured baseline
- Test plan
- Each decisive test and its actual result
- Root cause and why the evidence supports it
- Two to six useful photos: failed area, test setup, measured value, or damaged component

## Capture the repair

- Repair authorized by the customer
- Parts and procedures actually used
- Programming, coding, setup, relearn, or calibration when applicable
- Any related fault found but not repaired, clearly separated

## Verify the result

- Post-repair scan or measurement
- Start, idle, charging, temperature, pressure, leak, electrical, or communication check as appropriate
- Road test or operating-cycle result when appropriate
- Customer-confirmed outcome only if the customer actually confirmed it

## Publish safely

1. Remove names unless the customer explicitly approves them.
2. Remove plates, VINs, phone numbers, addresses, keys, paperwork, and screen identifiers.
3. Use the real photos from this repair only.
4. State what is known, what was measured, and what was not tested.
5. Link the case to the matching service page.
6. Add the case URL to `sitemap.xml`.
7. Run the schema validation and IndexNow dry run before publishing.

## Case-page fields

Every completed case page should contain:

- Headline: vehicle plus solved problem
- One-sentence outcome
- Vehicle
- Complaint
- Prior history
- Initial evidence
- Tests and measured results
- Diagnosis
- Authorized repair
- Verification
- Photo gallery with factual captions
- Related service
- Publication date and meaningful update date
- Customer permission status kept in the private shop record, not on the public page
