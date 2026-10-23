# AI search review — October 22, 2026

This review addresses the homepage's WebMCP form-coverage warning and current ways to make Perfect Timing's verified services easier to discover and understand. It does not establish that an annotation improves rankings or that publication produces an AI recommendation.

## Existing production foundations

Direct public HTTP checks on October 22 Eastern confirmed the homepage, robots file and sitemap return 200. The robots file already allows crawling. Requests from the review workstation using OAI-SearchBot and PerplexityBot user-agent strings returned the same homepage as the ordinary request; actual provider-IP access and crawl history were not tested. The sitemap lists 50 URLs. The homepage has a canonical URL, visible service content and AutoRepair structured data with the stable `https://fixingfortmyers.com/#business` identity.

Fresh homepage and About HTML describe the current workshop, mobile van and pickup arrangements consistently. Older search extracts can contain superseded workshop-only wording. Always verify the live page before changing content based on a search snippet.

The Search Console domain property was inspected directly. Its Search generative AI setting already says **Include**, and its Generative AI features report contains impressions. Private performance totals and screenshots are retained outside this public repository. No account control was changed.

## Current priorities

1. Strengthen the service and guide pages already appearing in AI search, beginning with module programming and ECU/TCM education, then walnut blasting. Add authorized real repair evidence: the complaint, observed diagnostic results, confirmed cause, work performed and verification. Obtain the actual facts rather than inventing successful cases or technical-review credentials.
2. Keep external business records accurate through the existing listing workflow. The website must continue describing service by appointment, 24/7 request acceptance, Tony's phone confirmation and the correct public phone. Do not publish an old street address to match an inaccurate listing.
3. Compare the same 28-day reporting windows in Search Console's Generative AI features report. Record page, country and device impressions separately from ordinary search clicks and confirmed repair requests. Inspect Bing Webmaster Tools' AI Performance report if existing account access is available. Do not create a second tracking system or score untested assistants.
4. Preserve the crawlable HTML, service links, canonical URLs, stable business identity and accurate structured data. Current public checks do not justify changing robots rules or adding duplicate schema.

Google's July 2026 guidance says normal search fundamentals still apply, emphasizes distinctive useful content, and says `llms.txt` does not affect inclusion in Google's generative AI features. There is no special AI schema requirement. [Google's generative AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).

The Google report now provides AI Overview and AI Mode impressions. A missing report can mean too few impressions. Treat those figures as appearances, not visits, calls or booked jobs. [Generative AI performance report](https://support.google.com/webmasters/answer/16984139), [Search generative AI control](https://support.google.com/webmasters/answer/16908024).

OpenAI distinguishes OAI-SearchBot for search discovery from GPTBot for training. Perplexity also documents a search crawler separately from training. No new training permission is needed to preserve the existing public search access. [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots), [Perplexity crawler documentation](https://docs.perplexity.ai/docs/resources/perplexity-crawlers).

Bing's current AI Performance tooling can show citation activity and grounding patterns. IndexNow submissions notify participating engines of URL changes; acceptance does not prove indexing or citation. [Bing AI Performance](https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/), [June AI visibility update](https://blogs.bing.com/search/2026/6/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare/), [IndexNow documentation](https://www.indexnow.org/documentation).

## WebMCP scope

WebMCP is a proposed browser interaction standard. The existing `prepare_repair_request` tool fills the established form for review. Declarative annotations describe that same form to supported browser assistants. Keep customer review before submission and report receipt only after the existing intake acknowledges it. These are progressive enhancements: the human form, consent, retry/idempotency behavior and Tony's appointment-confirmation role remain authoritative. [Chrome WebMCP](https://developer.chrome.com/docs/ai/webmcp), [declarative form API](https://developer.chrome.com/docs/ai/webmcp/declarative-api).

The declarative tool covers basic callback details. Native Chrome 156 tests confirmed tool discovery and a complete customer-submit flow on both pages with a delayed, mocked receiver: one POST and an acknowledged receipt response. No live lead was sent. The named vehicle inputs feed the existing combined vehicle field; optional SMS consent and tentative-time acknowledgement must be personally reviewed after declarative prefill. Responses omit customer details and capability tokens and never claim a confirmed appointment.

**Experimental browser limitation:** Chrome 156 cancels an active declarative invocation if dependent controls change its synthesized schema, including enabling the vehicle address or appointment-time controls. The populated human form remains usable. Use the existing imperative preparation tool for dependent vehicle-location details, and complete requested date/time in the normal form. The declarative handler keeps the active form in place because moving it into the dialog also cancels Chrome's active tool. The existing imperative dialog handoff is preserved. Mocked DOM validation checks are not evidence that Chrome supports a dynamic declarative workflow.

## Layout shift correction

The original PageSpeed report attributed 0.160 layout shift to the homepage appointment picker. At 412 by 823 pixels, delaying Barlow font loading reproduced 0.158135: the service links and introductory text rewrapped and moved the picker. A local Arial fallback calibrated to Barlow's width preserves those rows while the real font loads. The final Barlow appearance is preserved.

The corrected controlled case measured 0.000229 CLS; delaying all fonts measured 0.004091 rather than 0.172778. Six local Chrome cases at widths 390, 412 and 1365, with normal and delayed fonts, had no overflow or font-load errors and a maximum CLS of 0.015701. These measurements are local test evidence, not a new production PageSpeed score. Physical mobile fallback fonts and field performance remain separate verification work. The existing local preview does not serve WOFF2; the measurement harness explicitly supplied the repository's real font assets and checked that they loaded.

## Release and measurement limits

All implementation changes go through a pull request for Lead Mechanic's review and merge, as required by AGENTS.md. Local tests, browser measurements and form annotations are not production acceptance. After the reviewed release deploys, read back the actual HTML and scripts and rerun the form-coverage/layout audit. Never submit a live inquiry as a verification shortcut: it creates a real lead and alerts Tony.

No AI search position, competitor score, cross-platform recommendation rate, conversion lift or booked revenue is claimed by this review. No listing, ad, external message, indexing request or production data was changed during research.
