# Mobile repair-request clarity

The homepage now presents the repair scope, Fort Myers location, Google rating and one primary request action before the seven service-browsing links. The existing date/time picker remains available in the hero, with a direct shortcut. The same intake, call/text choices and Tony's phone-confirmation process remain in use.

## Evidence behind the layout

- [Tuch et al., visual complexity and prototypicality](https://research.google/pubs/the-role-of-visual-complexity-and-prototypicality-regarding-first-impression-of-websites-working-towards-understanding-aesthetic-judgments/): controlled screenshot experiments associate simpler, familiar visual structures with higher aesthetic ratings. This measured impressions of appearance, not repair bookings.
- [Google and AnswerLab, Principles of Mobile Site Design](https://business.google.com/aunz/think/marketing-strategies/principles-mobile-site-design-delight-users-drive-conversions/): qualitative sessions support prominent primary tasks and reducing unnecessary work on phones. These are usability observations, not a conversion guarantee.
- [Vodafone performance experiment](https://web.dev/case-studies/vodafone): an A/B test reported sales gains after performance improvements on otherwise equivalent pages. This supports protecting speed; its effect size does not predict this shop's results.
- [Google Ads lead-form guidance](https://support.google.com/google-ads/answer/17079814?hl=en): easier volume-oriented flows can trade off lead interest. Retain useful vehicle/symptom context and optional detail collection rather than optimizing only for submission count.
- [WCAG target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum): primary controls have comfortable targets and visible focus. Accessibility standards do not establish a sales uplift.

## Scope and validation

No intake field, submission endpoint, consent, retry, receipt, appointment availability or provider configuration changes. The form remains the single existing form; the primary hero action opens that form without requiring a chosen time. The seven service links remain crawlable and visible below the picker. The existing mobile contact bar is retained.

The loopback preview now serves existing WOFF2 font files with the correct MIME type so local screenshots use the production typography. This does not change public font assets or add a dependency.

Relevant checks cover request opening, focus restoration, preserved entries and scheduling behavior, local asset references, and structural accessibility. Browser checks cover narrow and wide viewports, overflow, primary action, scheduling shortcut, Escape, and unsent-value preservation. No production inquiry or real call is submitted for validation.

Outcome measurement should separate test traffic and contact clicks from real qualified inquiries, Tony-confirmed appointments and completed paid jobs. A visual refinement is not proof of higher-value leads.

Local validation on Node 24: 444 tests passed with the known Windows VM101 process-shutdown suite omitted; 17-page axe structural audit reported zero violations (contrast and rendered behavior checked separately); 58 pages, 120 JSON-LD blocks and all local resources/fragments passed the scoped structure readback. Five unchanged service-ad fixtures required their committed LF bytes for exact-string tests on Windows, then were restored. Full `npm test` remains a required Linux CI gate. The older `check-clean-structure.mjs` has unrelated stale baseline expectations and is not reported as passing.
