# Bay One unified price guidance — October 16, 2026

## Owner intent

Bay One must have a single natural conversation. Customers may ask questions, describe a repair, request a ballpark price, or offer contact details in the same chat. Do not require customers to select "Ask a question" versus "Rough estimate". A planning range is one kind of response, not a separate feature.

If a customer asks what work might cost, use the available vehicle/repair context. Ask for missing details as needed; output a defensible preliminary range with its assumptions only when sufficient information exists. Do not represent an AI-generated range as live parts pricing, an approved Perfect Timing quote, a diagnosis, or authorization to repair. If pricing support is unavailable, preserve the request for shop review without inventing numbers.

**No customer-facing daily quota or pricing lockout.** Keep operational rate limits, cost controls, idempotency, model-outage fallback, output validation, and human-controlled lead submission.

## Repository history (root cause)

- September 8, commit `0333076`: introduced Bay One chat with rough-estimate daily allowance.
- September 8, commit `707229e`: added quota enforcement and separate message/estimate accounting.
- September 24 onward: an intake-only laptop assistant deliberately prevented AI prices; that is a separate, outdated code path.
- October 12, commit `988ad45`: restored a hosted assistant but exposed disabled "Rough estimate" and "Ask a question" UI options based on that capability/quota protocol.

These internal restrictions leaked into the customer experience and drifted across independently deployed server versions. Preserve the requirement that Tony authorizes final repair work, but **do not confuse preliminary planning ranges with final shop-approved written estimates**.

## This website patch

- Remove the mode switch, duplicate suggestion buttons, quota counter and quota-dependent disabled state on all 48 HTML pages that load the widget.
- Use one free-text input and a contextual planning-range disclaimer; retain the existing estimate presentation card, safety fallbacks, reviewed lead handoff, consent, call action and receipt/idempotency.
- Cache-bust the widget and style assets.
- Stage the matching Node backend source change in `_website-intake/public-chat.mjs`: infer pricing intent from natural language; never impose a special quote allowance. Test coverage includes no fabricated prices, idempotency and outage behavior.

## IMPORTANT: production hosted backend is a separate deployment

As checked October 16, the deployed `bay-one-config.js` targets `https://bay-one-website-assistant.ubnvs1.chatgpt.site`, NOT the laptop process or `_website-intake/public-chat.mjs` in this website repository.

A read-only hosted `/chat/session` call currently advertises **`usage.limit=2` / `usage.remaining=2`**, with the service online and `roughEstimates=true`. Therefore **publishing this GitHub Pages change does not remove the live service's quota or price restrictions**. The hosted Bay One application has a separate managed Site repository, D1 storage and server-side DeepSeek access. Do not imply that the backend patch is deployed or move/migrate live D1 records.

To complete the owner-approved rollout in the owning Sites workspace, first identify the Bay One Website Assistant managed Site by matching its exact production domain. Read its current source, config and D1 schema, back up the deployed revision, and make the minimum equivalent server change: route all customer messages through one chat path; remove only `LIMIT=2` / per-day estimate refusal; preserve security guardrails, per-minute anti-abuse, budgets, verified nonfabricated ranges, historical conversation and metrics. Test a normal question, natural-language repair price with sufficient details, a second and third price inquiry without quota rejection, missing vehicle clarification, outage graceful recovery, and unchanged lead handoff. Only deploy when the hosting project and rollback are confirmed, then independently verify live `/chat/session` no longer exposes a limiting allowance and third valid synthetic price inquiry doesn't receive `estimate_limit`. Do not use real customer identity or send a test lead.

If the hosted source is unavailable, the website change may still be published, but communicate that prices remain subject to the hosted backend's existing quota.

## Final estimate and authorization

The website range is strictly preliminary and not a binding shop offer. The shop must separately comply with Florida Statutes §§ 559.905 and 559.907, including applicable written estimates/disclosures and customer authorization before covered work. A disclaimer alone is not a statutory waiver.

## Verification

On a clean worktree, `npm test` passed 239 mocked Node/JSDOM tests on October 16, 2026. Live hosted model pricing and third-request freedom remain unverified. No production leads or payments were submitted.
