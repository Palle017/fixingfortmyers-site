# Perfect Timing Auto Repair website

**Booking implementation is locked:** [24/7 penciled-in plan](docs/BOOKING-CONTRACT-V1.md) · [Codex execution handoff](docs/CODEX-BOOKING-ROLLOUT-HANDOFF.md) · [live/staged release status](docs/BOOKING-RELEASE-STATUS.md). Customer selects any time → one repair inquiry → private tentative shop-calendar entry after verified provider write → calls Tony → only Tony verbally confirms. Older Google Appointment Schedule/daytime-slot suggestions are superseded for this rollout.

Source for [fixingfortmyers.com](https://fixingfortmyers.com), hosted by GitHub Pages from `main` in [Palle017/fixingfortmyers-site](https://github.com/Palle017/fixingfortmyers-site). Current Windows project: `C:\Users\pf1\Projects\fixingfortmyers-site`.

The October 9 photo and service update preserves the page structure and existing URLs, restores real owner photos, adds a walnut-blasting service page, and makes oil changes, engine work, transmissions and no-starts easier to find. [Research and lead-flow recommendations](docs/PHOTO-AND-SERVICE-RESEARCH.md) and [release evidence](docs/PHOTO-SERVICE-RELEASE-20261009.md) describe the work.

Production repair requests use the cloud intake endpoint in `contact-config.js`, enabled October 3. The Bay One AI chat was removed from the public site on October 18, 2026 (no page loads a chat widget); its server-side code under `_website-intake/` is left for its owner to retire. When online requests are unavailable, the form keeps the entered details, says requests are temporarily unavailable, and offers Retry plus the shop phone number. That message is not a saved receipt. Per the owner's October 9 clarification, phone calls are answered by AI intake and forwarded to the shop; texts go directly to the shop with the supplied details. Replies are best effort at any hour, and appointments require confirmation. Website tests do not independently verify the telephone provider or real notification delivery.

Use Node 24 for local work:

```powershell
npm ci
npm test
npm run preview
```

The loopback preview opens at `http://127.0.0.1:18909` and uses isolated `.preview-data`, mocked AI behavior and disabled alerts. It is not a production service. `npm test` writes synthetic test/structure evidence under `docs/evidence`. Never use real customer details for these checks or put secrets/runtime databases in Git.

- [Company update, deployment boundary, evidence and rollback](docs/COMPANY-UPDATE.md)
- [Repair-guide editorial sources and maintenance](docs/GUIDES.md)
- [Search-intent and educational content plan](docs/SEO-CONTENT.md)
- [Private source-material intake](docs/SOURCE-MATERIALS.md)
- [Google Search and Meta step-by-step plan](docs/PAID-ACQUISITION-PLAN.md)
- [Reusable ADHD-friendly handoff prompt](docs/LEAD-GROWTH-HANDOFF.md)
- [Prepared ordered IF/ELSE rules and alert recovery](_website-intake/ROUTING.md)

GitHub Pages publishes static files. `_config.yml` excludes the backend, tools, docs, tests, dependencies and this README from its build. Publishing source to GitHub does not activate the Node receiver or alert worker. Do not bypass that separation or publish the private inbox.
