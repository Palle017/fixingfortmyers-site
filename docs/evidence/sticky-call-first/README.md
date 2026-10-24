# Sticky mobile bar: call first (October 24, 2026)

On phones (800 px and narrower) every public page keeps a two-button bar at the bottom of the screen. Until this change the bright, left button was **Request a repair** and the call button was the dark, outlined one. This release swaps their order on the 52 pages that had the form first, so **Call the shop** is the bright, first action and **Request a repair** is the second. The two pages that already led with a call (workshop: Call/Text; careers: Call/Introduce yourself) are unchanged. Labels, links, tracking and the form are unchanged.

`site.js` also stopped renaming the bar's call button to a bare "Call" on the seven "Quick contact" pages (engine, transmission, engine rebuild, walnut blasting, oil change, detailing, parts), so every page shows the "Call the shop" label set in #119.

Screenshots: loopback preview (`npm run preview`, no messages sent), engine repair page, 600 px wide.

- `mobile-engine-before.png`: `origin/main` at `48011e6`
- `mobile-engine-after.png`: this branch

## How to tell whether it worked

Compare 28 days before and after the merge, by device, using the existing events (nothing new is collected):

- GA4 `phone_click` with `placement = sticky_bar`, and Owner Desk `call_clicked` counts.
- GA4 `request_form_click` with `placement = sticky_bar`, and received repair requests, to check that the form did not lose more than calls gained.
- The phone provider's actual inbound call count, which is the real outcome. A tap is not a connected call.
