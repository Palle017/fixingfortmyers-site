# Blog posts

Pages are hand-written HTML, same as the rest of the site. There is no markdown build.

| | |
|---|---|
| Index | `blog/index.html` → `https://fixingfortmyers.com/blog` |
| Post | `blog/<slug>.html` → `https://fixingfortmyers.com/blog/<slug>` |
| Template | `blog/_template.html` (copy this; the leading underscore keeps it unpublished) |

## Fields

Copy `blog/_template.html` to `blog/<slug>.html`. The slug is the filename without `.html` (lowercase, hyphens). Fill these in together so the visible page, the snippet, and the Article JSON-LD match:

| Field | Where it goes |
|---|---|
| `title` | `<title>`, `og:title`, `twitter:title`, and Article `headline`. 60 characters or fewer. |
| `description` | `<meta name="description">`, `og:description`, `twitter:description`, and Article `description`. 160 characters or fewer. |
| `date` | `<time datetime="YYYY-MM-DD">` plus Article `datePublished` and `dateModified` (`YYYY-MM-DD`). |
| `slug` | Filename `blog/<slug>.html`, canonical, and `og:url`: `https://fixingfortmyers.com/blog/<slug>`. |
| `related_services` | Links in `<ul class="blog-related">` to existing service pages, such as `/engine-repair-fort-myers`. One path per line in the HTML comment at the top of the post. |

Also set `og:type` to `article`, keep `og:image` / `twitter:image` on the existing card, and set Article `author` to Tony with affiliation Perfect Timing Auto Repair. `publisher` is Perfect Timing Auto Repair.

## Publishing checklist

1. Delete the `<meta name="robots" content="noindex, nofollow">` tag from the copied post.
2. Add a list item to `#blog-posts` on `blog/index.html` and remove the empty-state item once a post is listed:

```html
<li><a href="/blog/SLUG">TITLE</a> <time datetime="YYYY-MM-DD">Month D, YYYY</time></li>
```

3. Add the post URL to `sitemap.xml` (`https://fixingfortmyers.com/blog/<slug>`).
4. Add `'/blog/<slug>'` next to `'/blog'` in `analyticsPages` in `site.js`.

## Snippet words

In the title, meta description, Open Graph tags, Twitter tags, and JSON-LD, do not use: shop, mobile, pickup, by appointment, 24/7. Do not include a street address.

The shared header and footer keep the existing repair-request disclosure. Leave that disclosure as it is.

## Closing actions

Keep the `.blog-cta` block at the end of the post. It uses the existing button classes and `site.js` click tags:

- Call → `tel:+12393972048` (`phone_click`)
- Text → `sms:+12393972048` (`text_click`)
- Request a repair → `/request-a-repair` (`request_form_click`)
