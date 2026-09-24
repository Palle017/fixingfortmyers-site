# Perfect Timing Auto Repair website

Source for [fixingfortmyers.com](https://fixingfortmyers.com), owned by [Palle017/fixingfortmyers-site](https://github.com/Palle017/fixingfortmyers-site). The permanent project home is `C:\Users\LP15\fixingfortmyers-site`; this targeted update is being prepared in its isolated `.worktrees\company-update` worktree.

The published release preserves the existing site design and service URLs, updates owner-confirmed 24/7 availability, adds three repair guides, and prepares repair details for a direct text to Tony. **Public Bay One is OFF at the owner's latest request; production readback confirmed shutdown.** Its source and prepared routing work remain available for later review; do not enable the assistant, deploy its backend, or activate paid call/text alerts as part of this static release.

The old remote form receiver is currently unreachable from this workstation, and the current REDLINE peer is offline. The temporary production contact path is a native text-message draft, with email/copy alternatives. The customer must press **Send** in their messaging app; preparing or opening a draft does not store an inquiry or prove delivery. The owner reports using Beside for business communication; no Beside API or new paid provider is connected here. This path does not meet the original requirement for durable website lead storage. Website release `5f4f9e5` was published and read back on September 24, 2026; see [production evidence](docs/evidence/production.json).

Use Node 24 for local work:

```powershell
npm ci
npm test
npm run preview
```

The loopback preview opens at `http://127.0.0.1:18909` and uses isolated `.preview-data`, mocked AI behavior and disabled alerts. It is not a production service. `npm test` writes synthetic test/structure evidence under `docs/evidence`. Never use real customer details for these checks or put secrets/runtime databases in Git.

- [Company update, deployment boundary, evidence and rollback](docs/COMPANY-UPDATE.md)
- [Repair-guide editorial sources and maintenance](docs/GUIDES.md)
- [Prepared ordered IF/ELSE rules and alert recovery](_website-intake/ROUTING.md)

GitHub Pages publishes static files. `_config.yml` excludes the backend, tools, docs, tests, dependencies and this README from its build. Publishing source to GitHub does not activate the Node receiver or alert worker. Do not bypass that separation or publish the private inbox.
