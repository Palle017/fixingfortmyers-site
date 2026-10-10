# Programming content and WebMCP release

October 10, 2026. The WebMCP intake preparation tool and ECU/TCM educational content are deployed and verified. IndexNow accepted six changed page URLs. Google Search Console ownership is verified for the HTTPS URL-prefix property; the sitemap was read successfully, and both programming URLs were accepted into the priority crawl queue.

## Deployed WebMCP intake

[PR 36](https://github.com/Palle017/fixingfortmyers-site/pull/36) merged as `77de4834e9ff93154dc5c94bec1ed879df18f10c`. [GitHub Pages run 38025013551](https://github.com/Palle017/fixingfortmyers-site/actions/runs/38025013551) succeeded.

The feature-detected `prepare_repair_request` tool fills the existing repair form, selects the location mode before filling dependent fields, and returns missing details or a ready-for-review result. The customer reviews the information and submits through the existing intake flow. Contact preferences remain under the customer's control. The tool does not report a prepared form as a received inquiry.

The release owner verified native Chrome 154 `document.modelContext`, tool discovery through `getTools`, and actual tool execution on the live website. The observed result was `ready_for_review` with `submitted: false`. The site contains the real public origin-trial token, expiring March 29, 2027. Availability still depends on a browser and agent supporting WebMCP. The token enables the trial for the configured website; it does not make every AI assistant use the tool.

No synthetic production lead was submitted. A separate manual submission in the isolated local receiver returned saved-request receipt `530ad3a8-9f47-4229-9160-8690d09b0efa`, using synthetic details and disabled external sends. Production notification delivery was not tested by that local receipt. The live preparation screenshot is [webmcp-live-preparation.png](evidence/programming-release/webmcp-live-preparation.png).

## Published programming content

[PR 37](https://github.com/Palle017/fixingfortmyers-site/pull/37) merged as `0043428bba75f234c98f1106f202c68033536264`. [GitHub Pages run 38025196952](https://github.com/Palle017/fixingfortmyers-site/actions/runs/38025196952) succeeded. All eight checked public routes returned HTTP 200 and matched the local release after byte normalization: homepage, new article, programming service, guide hub, electrical service, transmission service, shared JavaScript and sitemap. [Production verification](evidence/programming-release/production.json) records the results and hashes; [the live guide screenshot](evidence/programming-release/programming-guide-live.png) records the rendered article.

- New educational article: [`/repair-guide-ecu-tcm-programming`](https://fixingfortmyers.com/repair-guide-ecu-tcm-programming).
- Expanded service page: [`/module-programming-fort-myers`](https://fixingfortmyers.com/module-programming-fort-myers).
- Discovery links: homepage service highlight, repair-guide hub, electrical service page and transmission service page.

The article explains ECU/PCM and transmission/TCM programming, coding, configuration, relearns, used-module restrictions and the difference between factory software and custom tuning. It describes licensed OEM software and paid manufacturer access for supported work, with vehicle and module compatibility confirmed before booking. Five linked OEM references support the technical explanations. No blanket vehicle coverage, factory affiliation, certification, pricing or customer result is claimed.

The new page has a canonical URL, Article and Breadcrumb structured data matching visible content, organization authorship and publication date, social-preview metadata, and programming-specific request links. The existing service URL remains intact. The sitemap contains 47 unique URLs and current dates for affected pages. The shared script cache key is `20261010-programming`; the release also adds the known programming attribution source. These measures make the pages discoverable and the service understandable; publication and an accepted index submission do not establish indexing, an AI recommendation or a booking.

## Validation

The integrated `npm test` run passed 138 tests with mocked providers. The structure pass checked 50 HTML pages, 114 JSON-LD blocks and 2,423 local references. Focused metadata validation confirmed the guide's headline and publication date match its visible text, programming request links use the expected service value, IDs are unique and all affected pages appear in the sitemap.

After the final homepage and cache updates, `node tools/audit-accessibility.mjs` completed at `2026-10-10T04:44:44.256Z`: 16 representative pages, including the homepage, guide hub and new programming article, reported zero violations and zero critical or serious findings. [The generated evidence](evidence/accessibility.json) records the page results. This is a structural jsdom audit; color contrast is excluded, and rendered layout and browser interactions require separate review.

The technical research review found no actionable unsupported claim in the finished article. IndexNow returned HTTP 200 for the six changed page URLs; this confirms submission acceptance, not indexing or ranking.

## Google Search Console follow-up

The URL-prefix verification tag was merged in [PR 38](https://github.com/Palle017/fixingfortmyers-site/pull/38), commit `da18c62b9e0d00c7b5109f2ce416186db5c30b15`. [Pages run 38025294055](https://github.com/Palle017/fixingfortmyers-site/actions/runs/38025294055) succeeded, the public tag was read back, and Search Console reported ownership verified through the HTML tag for `https://fixingfortmyers.com/`. The separate domain-wide DNS property remains unverified; no DNS changes were made in this task.

Google reported `/sitemap.xml` as **Success**, last read October 10, 2026, with **47 discovered pages**. URL Inspection showed the existing programming service URL **on Google / indexed**. The new article was not yet indexed; Google accepted its indexing request into the priority crawl queue. Google also accepted a refresh request for the updated service page. Acceptance does not establish that the new article is already indexed, ranked or cited.

Search Console's Search generative AI control inherits the domain default **Include**, which allows links and content in AI Overviews and AI Mode. This was verified, not changed. Current public robots rules allow crawling. Account screenshots are stored only in ignored local `.preview-data`; they are not published with the website or repository.

## Follow-through

Use the existing lead-growth workflow to review indexing, actual programming inquiries and booked work; do not create a duplicate automation or repeatedly request indexing. The highest-value content addition is a real, permission-cleared programming repair example with vehicle details, diagnosis, procedure, result and workshop photos. Renew or replace the experimental WebMCP token before March 29, 2027 if the feature still requires a trial. Unsupported browsers retain the ordinary form.
