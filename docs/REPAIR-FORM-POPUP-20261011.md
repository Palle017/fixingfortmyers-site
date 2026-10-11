# Repair request popup

Repair actions previously scrolled to the inline homepage form. They now open that same form in a native modal. Existing service-page links still preselect the repair type. `/request-a-repair` opens the current form directly and is the dedicated destination for the replacement Google Business Profile link.

The form is moved, not cloned, while the modal is open. Closing returns it to its original position, preserving unsent fields, optional text consent, location choices and map pins. Native modal focus containment, Escape and platform dismissal are used; a sticky Close form button remains available during scrolling. Unsupported dialog browsers keep the inline form. AI-assisted preparation opens the form for customer review and never submits it.

The direct request page shares the current homepage intake markup, guarded by a parity test. Update both forms together when changing fields or disclosures. This action page is `noindex,follow` and is intentionally outside the content sitemap. Submission still uses the existing cloud intake, receipt, idempotency and manual fallback paths. Receiver/provider configuration is unchanged. The shared site script cache key is refreshed wherever referenced.

Validation: 176 mocked tests pass, including popup preservation, direct-route attribution and AI review. All 52 HTML pages pass structure and local-link checks. Seventeen pages pass the structural accessibility audit, which excludes color contrast. Local Chrome review covers desktop, 320px width, Escape/close/focus, service-page deep links and preparation of an editable unsent text draft. No production lead was created.

Google Business Profile: the owner explicitly requested removal of the old Shopmonkey booking link on October 11. Its removal was saved and the Booking editor showed no existing link. Replacement link save/readback and production deployment receipts are kept privately under `Codex/PerfectTiming-Handoff/2026-10-11/repair-form-popup`.
