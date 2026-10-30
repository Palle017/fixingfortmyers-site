# Repair photos and search discovery — October 30, 2026

## Purpose and scope

Connect the existing repair services to clearer photographs of the owner's work, so visitors can see the work and reach the relevant service explanation. This is a proposed website change for review, not evidence of a ranking increase, new Google indexing or additional booked repairs.

The four originals remain unchanged. The new images are AI-assisted retouched marketing derivatives: exposure, color, framing and detail were enhanced, and some fine texture and markings were synthesized. Captions say **Retouched owner photo** and link the original. Do not use the edits as diagnostic records or infer a completed rebuild, measured tolerance, confirmed fault or repair result from them.

Magnific accepted the connected account after setup but refused enhancement because its daily free allowance was exhausted; it reported no enhancement credits charged. The four edits were produced with OpenAI's built-in image editor. Format conversion and responsive sizing do not add further creative edits. [The manifest](PHOTO-EDITS-20261030.json) records sources, edit scope, hashes, pixel dimensions and output sizes.

## Placement and intent

These intent choices reflect the actual services and photographs; they are not measured keyword volumes. The available Ahrefs connections returned `Insufficient plan`, so no ranking or search-volume data was retrieved.

| Page / entry path | Photo and customer purpose | Relevant search intent |
| --- | --- | --- |
| Homepage → engine/transmission caption links | Full portrait images reveal the assembly and open case; each links to the service page. | Engine repair in Fort Myers; transmission repair in Fort Myers |
| `/engine-repair-fort-myers` | Engine assembly next to the explanation of symptoms, with a link to rebuild/replacement options. | Engine repair; engine rebuild versus replacement |
| `/transmission-repair-fort-myers` | Open case next to the repair explanation, with a link to slipping/shift symptoms. | Transmission diagnosis and repair |
| Homepage → `/no-start-diagnosis-fort-myers` | Owner-confirmed Mustang garage repair, with its protective coverings visible. | Car won't start; no-start diagnosis in Fort Myers |
| `/workshop` | Engine, transmission and VW photos within the existing gallery; VW links to the classic-car service. | Repair experience and available services |
| `/hot-rod-restoration-fort-myers` | VW engine-bay work next to the discussion of project condition and repair scope. | Classic-car repair and restoration inquiries |

The Mustang job context comes from the owner's recorded confirmation in [the original provenance file](PHOTO-PROVENANCE-20261009.json). No diagnostic cause or completed outcome is added.

## Search and delivery changes

- Four service pages use a representative photo in Open Graph, Twitter image metadata and `WebPage.primaryImageOfPage`, with accurate dimensions and literal image descriptions.
- The six changed pages have current sitemap modification dates and image entries for the photos they actually display.
- Images have ordinary crawlable `img` URLs, descriptive filenames, factual alt text, explicit dimensions, responsive WebP variants and JPEG social-preview assets. The new images are below the fold and lazy-loaded.
- Small WebP variants are about 71–114 kB (decimal); full-size WebP variants are about 227–268 kB. Full edited PNG masters are not added to the website repository.
- The homepage's two repair portraits use their complete 3:4 framing. Its directly loaded stylesheet gets a cache version; no unrelated CSS bundle is rebuilt.

Google explains that image subject matter is understood from the image, its alt text and its surrounding content, and that a relevant preferred image can be supplied through `og:image` and `primaryImageOfPage`: [image SEO guidance](https://developers.google.com/search/docs/appearance/google-images). Google's [current generative AI search guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) emphasizes useful first-hand material, relevant images and ordinary search fundamentals. Neither source guarantees inclusion or position.

## Verification and review

Feature: `repair.photos`. Source anchors: the homepage's `.layout-real-work` and `.layout-workshop-mustang`, the existing service-page `figure` elements, the workshop gallery, `layout-home.css`, and the six sitemap entries.

Verified locally on Node 24.22.1 and Chrome for Testing 156.0.8078.80, based on commit `3eef03215e11e37cda83fe90d4e6de628bc8d260`:

- `npm test`: 456 tests passed, none failed; structural verification covered 56 pages, 117 JSON-LD blocks and 4,876 local links. Providers were mocked.
- `node tools/normalize-schema.mjs --check`: 57 pages checked, zero out of date.
- Browser checks covered all six changed pages at 1440×1000 and 390×844. Images decoded, dimensions and original-source routes were valid, and no horizontal overflow or page errors were observed.
- Real clicks from the homepage reached the engine, transmission and no-start service pages. Clicking the no-start photo's original-source link reached the unchanged original JPEG.
- The browser run recorded 62 actions/assertions. Six screenshots were captured; the portrait gallery and engine/no-start figures were visually inspected. Local evidence is in `docs/evidence/repair-photos-20261030/` (session, action log, screenshots and Playwright trace); bulky evidence is retained locally rather than added to the public PR.
- A separate source and image review found no blocking issue. Original hashes, derivative dimensions, asset paths and image sitemap associations were checked.

No live inquiry, customer message, Google profile change, indexing submission, production deployment or merge is part of this PR.

## After the reviewed release

Read back the deployed image and page URLs, then use the existing Search Console property to inspect the changed pages and sitemap. Compare the same reporting windows for Web/Image impressions and clicks, and use Google's [Generative AI performance report](https://support.google.com/webmasters/answer/16984139) for AI Overview/AI Mode impressions. Pair visits and call/text taps with confirmed repair inquiries; appearances and taps are not booked work. Keep existing reporting and analytics work rather than creating a duplicate tracker.
