# Clean repair request flow verification

Verified September 29, 2026 against the isolated local preview at `http://127.0.0.1:18941/`.

## Automated checks

- `npm test`: 103 tests passed, including seven new mock-only repair form tests. Providers were mocked; no production delivery was tested.
- `node tools/check-clean-structure.mjs`: 46 pages, 31 compact service introductions, one repair form, and 1,815 local links/fragments; no failures.
- `node tools/audit-accessibility.mjs`: 15 representative home, guide, service, proof, careers, receipt, and error pages; zero reported violations. This is a jsdom axe check with color contrast disabled, supplemented by the browser review below.
- `git -c core.safecrlf=false diff --check`: passed.

## Browser checks

Chrome at 1440 x 1000 desktop and 390 x 844 mobile. The mobile content width was 375 pixels after the browser scrollbar; document scroll width was also 375 on home, service, proof, and careers pages, with no horizontal overflow. Desktop document scroll width was 1425 within the 1440 pixel viewport.

- Desktop homepage exposes vehicle, problem, name, and phone fields alongside a short introduction. Optional details begin collapsed; Bay One does not open automatically.
- Mobile Request a repair navigation positions the form at approximately 104 pixels from the top. The complete core form, submit action, call link, and privacy note fit above the fixed two-action bar; the form bottom was approximately 742 pixels in the 844 pixel viewport.
- The no-start service introduction presents Request a repair before Call, followed by three diagnostic process points. Its request link preserves Electrical / no-start in the optional service selector. The guide-to-service-to-form route was also checked in the isolated preview on port 18939.
- Expanding the optional details exposes the existing city, starts, stranded, media, consent, and helper controls, plus preferred timing. No city or consent was supplied for the local submission.
- Blocking only the local `/hooks/lead/webform` request produced the retry message, kept the synthetic entries, exposed editable text/email drafts and the call option, and did not show a receipt. The temporary browser network block was removed.
- Retrying through the isolated receiver produced a saved request receipt with reference `41991ab4-1cb3-402e-9672-f8c666f8994f`. The receipt states that storage is confirmed, notification delivery is not, and no appointment is booked. Notifications and customer texts were disabled in the preview. No production lead or message was submitted.
- Mobile Careers retains Call the shop and Introduce yourself, with the applicant form unchanged. Escape closes its navigation menu and restores focus to the menu toggle.
- The temporary browser viewport override was reset after inspection.

## Screenshots

- `desktop-home.png`: desktop introduction and complete core form.
- `mobile-home.png`: mobile first viewport.
- `mobile-form.png`: complete form after the request link.
- `mobile-service.png`: service introduction and diagnostic proof points.
- `mobile-delivery-failure.png`: preserved entries and manual fallback after a blocked local request.
- `mobile-local-receipt.png`: local saved-request confirmation.
- `mobile-proof.png`: repair proof introduction.
- `mobile-careers.png`: applicant-specific mobile actions.

The small yellow preview label is injected only by the local preview server and is absent from the production source pages.
