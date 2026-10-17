# Beside text link: get callers to finish the request themselves

**Why:** an AI-handled call ends with a summary texted to Tony and a promised callback. If the callback doesn't happen, the lead is lost. With this link, Beside texts the caller right after the call. They describe the vehicle and pick a time on the existing 24/7 form, which saves ONE lead (tagged `beside_sms`) in Cloud Intake. Tony then only has to confirm by phone, as the booking contract says. See `docs/BOOKING-CONTRACT-V1.md`.

## What is in the repo
- `start.html` (served as `https://fixingfortmyers.com/start`) sends the visitor to `/request-a-repair?utm_source=beside_sms`. It is a pointer, not a second form: no script, `noindex`, and not in the sitemap.
- The existing form turns `utm_source` into the lead's `channel`, so these leads arrive as `channel: beside_sms`. No change to `site.js` was needed.
- Test: `tools/source-attribution.test.mjs` ("the Beside text link opens the existing request form...").

## What the owner sets up in Beside (cannot be done from this repo)
Beside's help says a receptionist can text the caller a link to your own website: use the **Send a Text** action in **Scenarios** ([Beside help](https://help.beside.com/en/articles/11525406-schedule-appointments-with-your-receptionist)). In the Beside web app: **AI Receptionist** (left sidebar) → choose the line → **Scenarios**. Exact labels may differ.

Text to send after an AI-handled call:

> Perfect Timing Auto Repair: thanks for calling. Tell us about your vehicle and choose a day and time (any hour works) here: fixingfortmyers.com/start. Your time is penciled in until Tony calls you to confirm. Reply STOP to opt out.

Optional second Scenario, only if Beside can trigger it for overheating or no-start calls:

> Perfect Timing Auto Repair: thanks for calling. If your car is overheating, smoking or won't start, please don't drive it. Tell us about it and choose a time here: fixingfortmyers.com/start. Your time is penciled in until Tony calls you to confirm. Reply STOP to opt out.

Do not add a callback deadline or promise dispatch. Check in Beside that STOP opt-out is handled for these texts.

**Limit:** Beside documents that Scenarios run only on calls and texts the AI handles, not calls Tony answers himself. For those, Tony can send the same link as a saved reply.

## Verify with one synthetic test (the owner runs it)
1. Call the business line from your own phone and let the AI answer. Confirm the text arrives.
2. Tap the link. You should land on the repair form. The address bar shows `utm_source=beside_sms`.
3. Submit one clearly fake request (name "TEST DELETE", a fake vehicle). Pick a future time.
4. In the Owner Dashboard, confirm the lead appears with channel `beside_sms`. Mark it a test or delete it.

## Open items
- **Private side unverified:** the public repo cannot show whether the private Cloud Intake and Owner Dashboard keep a channel value they have not seen before. Step 4 settles it. If the channel is dropped, tell the private-side session.
- **Offline fallback gap:** when Cloud Intake is down, the form falls back to a text/email draft that names only approved sources. `beside_sms` is not on that list. Adding it means editing `site.js` (`draftChannels`) and cache-busting the script version on every page, so it was left out.
- **Measure weekly:** Beside AI call cards versus leads with channel `beside_sms`. The ratio is how many callers finish the form.
- Analytics: `beside_sms` is counted under the fixed "other" source, not a new category.
