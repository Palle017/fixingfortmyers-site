# Website staging deployment

Status at 2026-10-23: code/workflow preparation only. No staging hosting project, Git integration, DNS record, credentials, production settings or data changed by this task. No staging deployment has been verified.

## Existing hosting and DNS

- GitHub Pages API: `build_type=legacy`, `source.branch=main`, `source.path=/`, `cname=fixingfortmyers.com`, `https_enforced=true`, `status=built`. Latest inspected successful Pages run: https://github.com/Palle017/fixingfortmyers-site/actions/runs/40017597936, source `48011e61e5554f35b4470be6a49b576f471962f1`.
- Existing verification workflow: `.github/workflows/verify.yml` runs Node 24 `npm ci`, `npm test` and synthetic Python contracts on main pushes and PRs. It does not deploy a backend.
- Apex A records: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (TTL 14400). `www` CNAME: `palle017.github.io` (TTL 14400).
- Authoritative NS: `ns-cloud-c1.googledomains.com` through `ns-cloud-c4.googledomains.com` (TTL 21600), SOA serial 9. `staging.fixingfortmyers.com` returned NXDOMAIN, including an authoritative-server query.
- Registrar: Squarespace, IANA 895, from https://rdap.verisign.com/com/v1/domain/fixingfortmyers.com. This suggests migrated Squarespace Domains management; public records do not establish the authenticated DNS account owner.
- Connected Sites inventory contains the separate Cloud Intake and Owner Desk, but no website staging project. Those services are production boundaries, not staging backends.

## Selected architecture

Create one **separate Cloudflare Pages project** named `fixingfortmyers-staging` if that name is available, connected only to `Palle017/fixingfortmyers-site`. Production remains the existing GitHub Pages site. GitHub supports only one Pages project site per repository; another `deploy-pages` workflow or changing the existing repository CNAME would replace production.

The dedicated Cloudflare project's **production branch is `staging`** (this means the main branch of the staging hosting project; it is not the real website production). Disable automatic preview deployments initially. The custom domain maps to that project's root `*.pages.dev` hostname. Do not use a custom preview-branch alias: that feature requires proxied Cloudflare DNS and is unsuitable for the current external authoritative DNS.

| Project setting | Required value |
| --- | --- |
| Repository | `Palle017/fixingfortmyers-site` only |
| Project | separate `fixingfortmyers-staging`, name subject to availability |
| Production branch | `staging` |
| Automatic production deployments | enabled for `staging` only |
| Preview deployments | None initially |
| Framework preset | None |
| Root directory | repository root |
| Build command | `npm ci && node --test tools/website-staging.test.mjs && npm run build:staging` |
| Build output | `.staging-dist` |
| Build variable | `NODE_VERSION=24` in both build environments |
| Secrets, functions, D1, R2, bindings | none |
| Web Analytics, Zaraz, email/forms integrations | disabled |
| Custom domain | `staging.fixingfortmyers.com` only |

Use only the free static hosting option after checking the actual account's eligibility/limits. Do not accept a paid commitment, transfer nameservers, change production OAuth/authentication, or create a persistent API token. The provider-native Git integration avoids storing deployment credentials in GitHub Actions but is a new repository integration and requires specific owner approval.

The GitHub staging workflow builds a downloadable artifact only. It has `contents: read`, no secrets, no deployment token, no `pages: write`, no `id-token: write`, and no production environment. It cannot deploy production or promote a branch. Hosting deployment occurs through the separately approved provider-native connection after a reviewed candidate is pushed to `staging`.

## Exact pending account/DNS actions

1. After the staging code/workflow PRs pass review, create `staging` from that reviewed commit in the same repository. Do not merge unreviewed staging candidates into `main`. New candidates may contain unmerged feature commits, but must retain the staging guard/build and pass isolation tests before updating this branch. Only reviewed code belongs in `main`; Lead Mechanic owns merges under AGENTS.md.
2. Owner selects the Cloudflare account and approves the Cloudflare Pages GitHub integration for **only `Palle017/fixingfortmyers-site`**. Inspect the provider's actual permission screen; no all-repository grant or new token. Create the separate static project with the settings above, selecting the now-existing `staging` branch. Record its actual generated `pages.dev` hostname and project id. These have not been created; the proposed name is not a verified target.
3. Verify the generated `pages.dev` deployment and headers first. Associate `staging.fixingfortmyers.com` in this separate project's Custom domains screen before changing DNS. Record any exact certificate-validation record supplied by the provider.
4. In the authenticated DNS account, after approval of the concrete provider-returned target, add exactly:

   ```text
   Type: CNAME
   Name: staging
   Target: <actual-generated-staging-project>.pages.dev
   TTL: provider default
   ```

   No wildcard, apex, www, production CNAME, MX, TXT, CAA, nameserver, dashboard, intake or security/auth changes. The target is pending provider creation; do not enter the illustrative placeholder. Add a provider-supplied validation record only if separately reviewed and required.
5. Require authoritative/public DNS readback, active custom-domain TLS, and the live checks below before reporting the requested hostname as deployed.

No DNS/account action was denied or attempted. They remain pending account selection/integration approval and verified DNS access. The user's browser automation could not initialize (`trusted Node process exited unexpectedly`); no authenticated hosting/DNS browser state was inspected. This was a tool failure, not a provider access denial.

## Isolation and acceptance checks

The build is a static allowlist into a fresh generated directory. It does not ship server code, source-materials, databases, runtime configuration, credentials, CNAME, production sitemap, search-verification files, or schedules. It adds staging labeling, robots/meta controls and `_headers` on every route, strips search/social metadata and external active resources, and loads the staging guard before application scripts.

`connect-src 'none'` and `form-action 'none'` are enforced by CSP. In-memory synthetic fetch responses exercise repair, media, calendar-pending, parts and careers UI without an HTTP backend. No data is stored on a server or forwarded to production. Unknown endpoints reject. Native messaging links, external navigation, telemetry, Google sign-in and device capture are disabled. Browser-local form fields may contain synthetic values; do not enter real customer details.

Noindex is **not access control**. This route is an intentionally public static preview using synthetic data. If private access is later wanted, configure a separate staging-only access policy through its own approval; never change production account authentication as part of this work.

Before publication, run under Node 24:

```text
npm ci
npm test
node tools/audit-accessibility.mjs
npm run build:staging
```

After publication, independently check the exact deployed commit from `staging-build.json`, the banner and first-loaded guard, `X-Robots-Tag: noindex, nofollow, noarchive`, crawlable robots with no sitemap (so crawlers can read noindex), CSP, no production sitemap/canonical/JSON-LD and the 404 page. Run the real repair, parts and careers journeys with a synthetic identity and a disposable browser profile while recording network requests. Require **no external requests and no HTTP POSTs**, only local mock receipts, and blocked call/text/email/Owner Desk links. Verify a native fetch/XHR/beacon/WebSocket/form-submit attempt is blocked by the actual browser policy. Test both generated and custom hostnames. Host-added analytics must also remain disabled. Mocked Node/jsdom tests alone do not prove live CSP enforcement or hosting configuration.

Keep only synthetic evidence. Local build/test success is not live deployment proof. Do not POST synthetic checks to production intake, careers email, calendars, payments or notification providers.

## Releasing a new candidate and rollback

Check out the desired source commit with this staging isolation code present. Run the checks and review the static artifact. Push that reviewed commit to `staging` using normal repository review practices; Cloudflare then builds only its separate project. Record commit, build id, generated URL, custom-hostname TLS and network evidence. This does not advance `main`.

For rollback, select a previously verified deployment in the separate Cloudflare project or revert the staging candidate branch through a normal commit/PR. Removing the staging custom-domain association/record is a separate DNS action requiring its own approval. Never alter the existing GitHub Pages source branch or `CNAME` as staging rollback.

## Official provider references

- https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- https://developers.cloudflare.com/pages/configuration/monorepos/
- https://developers.cloudflare.com/pages/configuration/build-configuration/
- https://developers.cloudflare.com/pages/configuration/branch-build-controls/
- https://developers.cloudflare.com/pages/configuration/custom-domains/
- https://developers.cloudflare.com/pages/how-to/custom-branch-aliases/
- https://developers.cloudflare.com/pages/configuration/headers/

## Prepared implementation and local evidence

- Isolation source: [PR #161](https://github.com/Palle017/fixingfortmyers-site/pull/161), commit `7322d87dda1821a2fc43f4482dbedcaa7e3472c5`; production source assets and endpoints are unchanged. This workflow/runbook PR is stacked on that code branch; merge #161 first, then retarget this PR to `main`.
- Node 24 staging checks: 10/10 passed; generated artifact: 56 HTML pages, 229 files. `staging-build.json` uses actual checked-out HEAD, including manual workflow builds of another `source_ref`.
- Disposable local Chrome: 18 assertions / 46 real actions passed. Repair, parts and careers forms yielded browser-memory receipts; call/text/Owner Desk actions stayed disabled; no external HTTP(S) requests, no HTTP POST reached the local server, and no JavaScript exceptions. Separate native-transport canaries with the generated response policy showed CSP blocking fetch/XHR/beacon/WebSocket/native form submission. This is local artifact proof, not a hosted deployment receipt.
- Source accessibility audit: zero violations. [Exact isolation PR-head Ubuntu verification](https://github.com/Palle017/fixingfortmyers-site/actions/runs/40041736821) passed all 357 npm tests and 264 synthetic Python contracts. The Windows baseline's existing VM101 cleanup EPERM/CSS failures were not reproduced in Ubuntu CI.
- No host project or DNS record exists from this task. The provider-returned CNAME target, TLS, live header application, hosting-added analytics state, and custom-hostname journeys remain unverified.
