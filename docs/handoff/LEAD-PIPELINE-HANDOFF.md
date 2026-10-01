# Handoff: Perfect Timing lead → quote pipeline (architecture first, then build)

You are picking this up on the shop laptop from a cloud Claude session (1 Oct 2026). That session could only see GitHub. You can see the laptop: the running services, OpenClaw, local-only commits and the real config. **Your first job is to design the architecture and get the owner's approval. Do not write pipeline code until the owner approves your design.** Read this whole document before you run anything.

Business: Perfect Timing Auto Repair LLC (owner/mechanic Tony; the owner's family runs the tech). Website fixingfortmyers.com (GitHub Pages, repo `Palle017/fixingfortmyers-site`, **public**). Business line (239) 397-2048, the Beside "Tony's Box" line. (239) 271-4854 is Tony's personal Beside sign-in phone and must never be published. The street address is hidden on the website and on Google (owner, Oct 1); the workshop is named only as based at Bayshore Ranch. Tony is described as a mobile repair shop, and customers call Tony to coordinate drop-off or pick-up.

---

## 1. What the owner wants (in their words, condensed)

> Every lead from Beside (calls **and** texts) and from the website lands in one place. If the customer isn't in Zoho yet, they get created. OpenClaw checks with Tony on what's going on with that vehicle, and based on his instructions puts together a quote, and Zoho sends it to the customer. This should all be one automated pipeline.

Also requested in this conversation:
- **Take Zapier out of the picture.** The owner believes Beside now integrates with Zoho directly. **I could not verify this.** Beside's help center documents the AI receptionist, Scenarios and a "Send a Text" action, but I found no Zoho integration page, and search turned up nothing. Verify it yourself in the Beside web app (Settings → Integrations, or similar) before designing around it. If it exists, find out exactly what it syncs (contacts? call/text logs? which Zoho product: CRM, Invoice or Books?).
- **Beside should prompt callers and texters to submit a ticket on the website** (e.g. `fixingfortmyers.com/start`). The web ticket should optionally capture **the car's current location** (browser geolocation, opt-in), so Tony can plan pickup or towing and give a time estimate. Draft text, not yet approved: *"Perfect Timing Auto Repair: start your repair request here: fixingfortmyers.com/start. Sharing your car's location helps Tony plan pickup and give you a time."*
- The location must travel with the lead into the owner's system and on to Zoho (or wherever leads go).
- Business rule for all copy: **"Call or text any time. Drop-off and pickup are by appointment."** The business is a repair shop, never "mobile". Concierge pickup and return is a paid add-on.
- Goal behind all of it: more leads and the ability to **choose the more profitable jobs** (engines, transmissions, no-starts are the priority jobs). The owner wants to start advertising soon, so the funnel has to work first.
- **Do not trigger a Google Business Profile re-verification.** Don't touch the name, address, address visibility or categories on Google. Removing the old Shopmonkey appointment link is fine; the owner is doing that by hand.
- The owner wants speed, and token efficiency, and is frustrated by sessions that wander. Be concise, show a plan, and get approval before building.

---

## 2. What actually exists (audit of all eight repos on GitHub, 1 Oct 2026)

| Piece | Status on GitHub | Location |
|---|---|---|
| Website repair form → receiver on the shop laptop | **Live.** Form posts to `https://p15g2.tail68bd87.ts.net:10000` (Tailscale Funnel) | `fixingfortmyers-site/contact-config.js`, `site.js`, `_website-intake/server.mjs` |
| Receiver storage and inbox | **Live.** SQLite `_website-intake/data/website-leads.sqlite3`; operator inbox `http://127.0.0.1:18798`; alerts via email / ntfy / desktop (Twilio SMS adapter exists but is parked) | `_website-intake/` (`lead-desk.mjs`, `lead-notify.mjs`, `urgent-alerts.mjs`) |
| Beside → receiver webhook | **Built and tested, not connected.** `POST /hooks/lead/beside/<token>` creates a `manual` lead (source `beside_call` / text), dedupes events (`beside_events` table) and queues alerts. It was designed for Zapier because Beside documents no public API | `_website-intake/server.mjs` ~L290, `lead-desk.mjs` `besideHook`, `beside-hook.test.mjs` (commit `201310c`, 27 Sep) |
| Receiver ↔ OpenClaw / Zoho | **Deliberately not connected.** The README (commit `73f46cf`, 6 Sep, "Codex") says the receiver "does not invoke Bay One, OpenClaw, Zoho, an LLM, email, or automated texts" | `_website-intake/README.md` |
| Lead source tagging | **Live.** `utm_source` captured in `sessionStorage`; Google-sourced leads tagged (PR #20) | `site.js` ~L20–45 |
| Quote workflow (OpenClaw "TardBot") | **Built, marked "Working" (4 Aug).** `pt-quotes`: local ledger, `quote_save` / `quote_approve` / `quote_to_zoho(confirm=true)` only after Tony authorizes. Totals come from `pt-pricing`, never the LLM | `perfecttimingai_knowledge/TardBotTools/pt-quotes`, `pt-pricing/pricing.mjs` |
| Zoho write engine | **Built.** `zoho-core.mjs`: find/create contact (`ZohoInvoice_List_all_Contacts` / `Create_a_Contact`), create estimate, link vehicle, diagnostic summary, invoice from estimate, send invoice, record payment. Idempotency ledger plus timeouts, written after a bug where one create became **four real estimates**. Calls Zoho through Zoho's **MCP endpoint** (`ZOHO_URL`, tool names `ZohoInvoice_*`), so the target product is **Zoho Invoice, not Zoho CRM** | `TardBotTools/pt-estimate-mcp/zoho-core.mjs` |
| Emailing an estimate to the customer | **Missing.** There is `pt_send_invoice` but no "send estimate" tool. `ZohoInvoice_Mark_an_Estimate_as_Sent` appears only in a permission map | `zoho-core.mjs` |
| OpenClaw lead tools | **Built, read-only.** `pt_leads_today/list/search/mark` read `C:/Users/augel/.clickclack/leads.json`. AGENTS.md: "The standalone receiver deterministically delivers website/Bay One leads to ClickClack #bay-one; do not alter that live delivery path." | `TardBotTools/pt-leads-mcp`, `openclaw-workspace/AGENTS.md` ~L80 |
| The "standalone receiver" that feeds ClickClack | **Not found in any GitHub repo.** Possibly local-only, or in `Palle017/clickclack` / `openclaw-clickclack`, which I did not inspect | ? |
| Beside integration design | **Design only.** Phase 0 ("verify Beside's actual API/webhook surface") was never done | `oc-mechanic/docs/growth/06-beside-integration.md` |
| OpenClaw → Tony channel | WhatsApp appears in config backups. The latest backup I read (`openclaw-instance/config-redacted/openclaw.json.bak-2026-08-12-0727`) shows `hooks` = internal `session-memory` only (**no external webhook hook enabled**) and no `channels`/`cron` keys. Newer backups exist (`…08-21-cron-triggers`, `…08-23`) and I didn't parse them | `openclaw-instance/` |
| Pricing / book times | LEMON / CHARM book-time knowledge base, `lemon-mcp`, `lemonaid-mcp`, `partstech-mcp` | `TardBotTools/`, `openclaw-mechanic` |

**Bottom line:** the quote → Zoho half exists inside OpenClaw. The intake half exists in the website receiver. **Nothing connects them**, and nothing triggers OpenClaw when a lead arrives. Its lead tools only answer when Tony asks. In September the website switched to a new receiver that writes to its own SQLite database, not to OpenClaw's ClickClack ledger. So today there are **two lead stores**, and the live website feeds the one OpenClaw doesn't read.

Repos (all `Palle017/…`): `fixingfortmyers-site` (public), `perfecttimingai_knowledge` (TardBotTools: last pushed 26 Jul, labelled "WIP"), `openclaw-workspace` (AGENTS/ARCHITECTURE/TOOLS/MEMORY; last 4 Aug), `openclaw-instance` (config backup, 25 Aug), `openclaw-mechanic` and `oc-mechanic` (July architecture and growth docs), `auto-shop-tools` (mechanic_assistant, shelby; last 5 Aug), `autoshop-wip-backup-2026-07-16`.

---

## 3. My doubts and suspicions (check these first; they decide the design)

1. **Local-only work.** GitHub's TardBotTools is 26 Jul "WIP". The laptop may have newer, unpushed versions of `pt-quotes`, `zoho-core`, the standalone receiver and OpenClaw config. Before designing anything, run `git status`, `git log @{u}..HEAD` and `git stash list` in every repo on the laptop, and find where the running services actually load from: OpenClaw's MCP server paths in the live `openclaw.json`, and the receiver's actual folder (its README says to copy runtime files to a permanent folder, so the running copy may differ from any checkout). **Design against what runs, not what GitHub shows.**
2. **Is p15g2 the same machine as `C:/Users/augel` (OpenClaw)?** The receiver README warns not to disturb "Bay One/OpenClaw processes" on the same box, which suggests yes. Confirm it.
3. **Is the old standalone receiver → ClickClack `#bay-one` path still running?** If so, are website leads double-delivered, or are some lost? Check ClickClack's `leads.json` timestamps against the receiver's SQLite for the same period.
4. **Beside ↔ Zoho "direct integration".** Unverified (see §1). If it only syncs contacts or call logs into Zoho **CRM**, that doesn't by itself trigger anything, and our quote engine targets **Zoho Invoice**. **Decide which Zoho product is the system of record.** CRM for leads and Invoice for estimates means two products to keep in sync, so check whether the owner actually uses CRM.
5. **Can Beside trigger anything outbound without Zapier?** Options to check: a native webhook in Beside settings; Zoho-side automation (Zoho Flow, or a CRM workflow rule with a webhook) firing when Beside creates a record; or Beside's email summaries parsed by the receiver. Pick the one with the fewest moving parts that you can prove with one real test call.
6. **Beside "Send a Text" Scenario** works only on AI-handled calls and texts, not calls Tony answers live. Tony needs a saved reply for those. Check whether the AI receptionist is even enabled on the line.
7. **Zoho via MCP URL vs REST.** `zoho-core` calls Zoho's MCP endpoint. That's convenient (no OAuth plumbing), but find out where the URL/key lives, whether it expires, and its rate limits. A deterministic service such as the receiver calling it is fine. Just keep `zoho-core.mjs` as the **single** Zoho write path, and never fork its idempotency rules.
8. **Customer email.** Zoho emails estimates to an email address, but leads arrive by phone and text and the web form has no email field. Decide on email (add an optional field) or texting the Zoho estimate link via Beside.
9. **Approval gate.** The owner wants "fully automated". `pt-quotes` intentionally requires Tony's explicit approval before any Zoho write. I strongly recommend keeping a **single human tap** (Tony replies "approve" on WhatsApp) before anything reaches a customer. Everything else can be automatic. Raise this with the owner rather than silently removing it.
10. **Public repo.** `fixingfortmyers-site` is public. Labor rates (`pt-pricing`), the sales-tax ID (in `openclaw-workspace/AGENTS.md`), Zoho org/contact IDs, tokens and customer data must **never** be committed there. If pipeline code moves into that repo, all config and secrets stay in local `runtime.json` / env. Or the owner chooses a private repo for the pipeline; ask.
11. **Availability.** The receiver only works while the laptop is on, awake and on Tailscale. The website falls back to a customer-sent text draft. Any pipeline you design inherits that single point of failure. Say so, and propose whether that's acceptable for advertising-driven traffic.
12. **Location data.** It needs explicit opt-in (geolocation only on tap, HTTPS), a privacy-policy paragraph, and **no third-party geocoding**. Store lat, lng, accuracy and timestamp; render a Maps link and straight-line miles from the shop.
13. **Other sessions are active** on `fixingfortmyers-site` (PRs #19–#21 rewrote the form and every page). Pull `main` before any change. Templates move fast, and `npm test` does **not** check footer address or workshop links.

---

## 4. Candidate architecture (mine — challenge it, don't just adopt it)

1. **One front door:** the existing receiver (`_website-intake`) is the single lead store and source of truth. Sources:
   - website form (plus optional location, plus `?utm_source=beside` from the `/start` link);
   - Beside calls and texts via whatever §3.5 proves works;
   - merge leads by normalized phone number.
2. **Customer upsert at intake:** the receiver imports `zoho-core.mjs` (vendored or shared, **one copy**). It finds or creates the Zoho contact keyed on the lead id (idempotent) and stores `zoho_contact_id` on the lead. If Beside→Zoho really syncs contacts, this step becomes "look up only".
3. **Trigger Tony:** the receiver hands each new lead to OpenClaw. Use the alert/notifier pattern already in the receiver (queued in SQLite inside the lead transaction, retried per channel). The hand-off goes through an **OpenClaw webhook hook** (currently disabled; enable it with a token) or a deterministic WhatsApp message plus an OpenClaw skill that picks it up. OpenClaw messages Tony: lead summary, vehicle, symptoms, Maps link, miles from shop, new or returning customer → "What's going on with it / what should I quote?"
4. **Quote:** Tony's reply drives `pt-quotes` (`quote_save`). Totals come only from `pt-pricing` plus LEMON book times. Tony approves, then `quote_to_zoho` creates the Zoho estimate.
5. **Deliver:** a new `pt_send_estimate` in `zoho-core` emails the estimate (or marks it sent and returns the estimate's customer link for Beside to text). Write status back to the lead (`quoted`, `sent`, `accepted`).
6. **Retire** the ClickClack ledger as a second store, or have it fed *from* the receiver, so `pt_leads_*` reads the single store.

Open alternative to weigh: skip OpenClaw for triggering, and have the receiver message Tony directly with a link to a small "quote this lead" form in the local inbox. That's deterministic and uses zero LLM tokens per lead, but it loses the conversational intake. Recommend one with reasons.

---

## 5. Concerns about efficiency (time and tokens)

- **Don't rediscover.** This document plus the repos are the context. Read `_website-intake/README.md`, `ROUTING.md`, `server.mjs` (routes), `lead-desk.mjs`, `zoho-core.mjs` and `pt-quotes/server.mjs`, then `openclaw-workspace/AGENTS.md` and `ARCHITECTURE.md`, then the **live** `openclaw.json`. Skip the July growth docs except `06-beside-integration.md`.
- **Port, don't rewrite**, anything that touches Zoho writes. The duplicate-estimate history is the reason.
- **Prove each external hop with one real, cheap test before building on it**: one Beside test call → see what arrives; one Zoho contact lookup; one OpenClaw hook POST → WhatsApp message. Use Zoho test data or a clearly labelled test contact, and delete it afterwards.
- **Deterministic code for plumbing; LLM only for the conversation with Tony.** Every LLM turn per lead costs tokens forever.
- **Small, reversible steps behind config flags** (a channel is off until its settings exist, as the receiver already does).
- **One PR per hop**, each with tests using the existing stub harnesses (`pt-estimate-mcp/stub-harness.mjs`, `pt-quotes/stub-harness.mjs`, `_website-intake/*.test.mjs`). `npm test` in the site repo must stay green (103 passing as of 1 Oct).

---

## 6. Your first deliverable (stop after this and wait for approval)

A short architecture proposal (one page) containing:
1. Findings for §3.1–3.8: what actually runs on the laptop, local-only commits, which Zoho product, what Beside can really send without Zapier.
2. The chosen architecture as a numbered flow from a Beside call / text / web ticket to the estimate the customer receives, naming the component and machine for each hop.
3. Where the code lives (public site repo vs a private repo) and where secrets and rates live.
4. The build sequence as small PRs, each with a one-line test plan, and what the owner must click or configure (Beside, Zoho, OpenClaw).
5. Risks and the decision questions for the owner (approval gate, customer email vs text link, laptop availability).

---

## 7. Already done in the cloud session (don't redo)

- Merged and live on `main`: PR #11 (`/workshop` and `/paint-correction-detailing-fort-myers` pages, address in every footer and in the business data, 12 towns in `areaServed`, the owner's welding photos, hidden photo slots, asset version `20261001-workshop`) and PR #22 (ad plans: "mobile mechanic" moved to negative keywords).
- `docs/google-business-profile-plan.md` on `main` holds the Google profile plan and the no-re-verification rule.
- Pending owner approval (website copy, separate from the pipeline):
  - Workshop page wording to "Call or text any time. Drop-off and pickup are by appointment." (it currently says "come by or drop the car off").
  - A concise Paint & Detailing rewrite: paint correction (one- and two-step), ceramic coating, decontamination, buffing and paint work, detailing; one-stop-shop framing; no prices, brands, durability or warranties.
- Project board (owner's tracker): https://claude.ai/artifact/6RQJgjFpXVDBoLveLrKYSC
