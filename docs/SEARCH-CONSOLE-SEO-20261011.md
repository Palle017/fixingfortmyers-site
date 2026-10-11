# Search Console SEO improvements

October 11, 2026. Static release prepared from published main `a8c602e42e6a3cd3d23657da94eebacd3571ec3f`.

The mechanic page now explains the engine, transmission and diesel repair work in its title, description and introduction. Its existing URL, owner-led purpose, appointment requirements and contact number remain intact. Metadata descriptions match the Service and WebPage structured data. Contextual links connect engine repair decisions and transmission symptoms with the relevant service information.

The transmission repair page and repair-guide hub link to the existing transmission-slipping page. Search Console's live test found that symptom page available to Google, and Google accepted its indexing request on October 10. The old privacy URL fetched successfully in a live test and points to the current privacy policy; validation of its historical 404 started October 10. These are accepted requests for Google to recheck, not evidence of completed indexing or validation. Account exports and screenshots are retained in the private local handoff, outside the public repository.

Twenty-seven compact service pages no longer preload an unused Tony portrait. Pages that display the portrait keep their image behavior. Thirty-four footer logos now declare both square dimensions. Service panels and contact values can shrink and wrap on narrow screens, fixing horizontal overflow caused by a long email address. The service stylesheet cache key is `20261011-seo` on its 39 referring pages.

The mechanic page's contact instructions now offer the existing repair form, direct text link and AI intake phone line. Retired chat and voice-note options were removed from that page. This release changes no provider configuration, lead routing, credentials, backend, analytics, DNS or Pages settings.

Validation:

- 144 existing tests passed with mocked providers; no real customer lead or message was sent.
- All 50 HTML pages passed structure checks: 114 valid JSON-LD blocks and 2,372 local references.
- The 16-page structural accessibility audit reported zero violations; focused checks of all three content-edited pages also reported zero violations. These jsdom checks exclude rendered color contrast and browser behavior.
- Browser review covered the mechanic, transmission service and guide hub, including narrow phone layouts. The long contact email now wraps without horizontal overflow.
- CNAME, static build exclusions, public contact configuration, Bay One configuration and shared intake JavaScript are unchanged.

Before release, public checks found all 47 sitemap URLs returned HTTP 200, matched the published main source, had the expected canonical URL, and had no indexing block, missing H1, missing metadata or malformed JSON-LD. HTTP and www variants redirect to the HTTPS apex. The initial mechanic-page PageSpeed mobile lab run scored 89 for performance, with 3.2-second LCP and zero measured layout shift. Field Core Web Vitals data was unavailable. Live publication and the post-release checks are recorded separately by the release owner; lab results and accepted indexing submissions do not establish improved rankings or received leads.

Use the saved 28-day comparison as the baseline, then review indexing, US queries, landing pages, mobile performance and confirmed inquiries after Google has collected new data. Do not attribute results dated before this release to these changes. Rollback uses a normal revert commit followed by a Pages build and public readback.
