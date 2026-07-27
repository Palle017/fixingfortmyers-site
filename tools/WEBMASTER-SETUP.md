# Perfect Timing search and profile setup

This mirror is ready for the owner-account work below. Do these steps only after the updated site has been previewed and published.

## Already completed in the website

- One stable `AutoRepair` identity: `https://fixingfortmyers.com/#business`
- Every repair page represented as a `Service` provided by that business
- Verified public profiles connected in business schema
- Updated XML sitemap and `robots.txt` sitemap reference
- Root-level IndexNow key file
- Dry-run-safe IndexNow submission script
- Repair-proof page and consistent business entity page
- AI-search tracking scorecard

## 1. Google Search Console

1. Open https://search.google.com/search-console/
2. Add a **Domain property** named `fixingfortmyers.com`.
3. Add the DNS TXT record Google provides at the domain's DNS host.
4. After Google verifies the property, open **Sitemaps** and submit:
   `https://fixingfortmyers.com/sitemap.xml`
5. Use URL Inspection on the homepage, `/about-perfect-timing`, and `/case-studies`, then request indexing.

Google's official guide: https://support.google.com/webmasters/answer/10267942

## 2. Bing Webmaster Tools

1. Open https://www.bing.com/webmasters/
2. Import the verified site from Google Search Console, or add and verify it manually.
3. Submit `https://fixingfortmyers.com/sitemap.xml`.
4. Confirm Bing can crawl the homepage and both proof pages.

Bing's official verification guide:
https://www.bing.com/webmasters/help/add-and-verify-site-12184f8b

## 3. IndexNow

After publication, first confirm this URL displays only the key:

`https://fixingfortmyers.com/a0f8f7f6cad8445382fa07471976bd35.txt`

Then run from the site folder:

```powershell
.\tools\submit-indexnow.ps1 -Submit
```

The script reads every URL from `sitemap.xml`, verifies the public key file, and submits the URLs to the IndexNow endpoint. Running it without `-Submit` is a dry run.

Official documentation: https://www.indexnow.org/documentation

## 4. Business listing accounts

These actions need the verified business owner's login, phone, email, or mailed PIN:

- Claim or update Bing Places: https://www.bingplaces.com/
- Claim or update Apple Business Connect: https://businessconnect.apple.com/
- Confirm the existing Yelp, BBB, Nextdoor, Facebook, Google, MapQuest, and Roadtrippers listings stay consistent.

Use this exact identity everywhere:

- **Name:** Perfect Timing Auto Repair LLC
- **Address:** 13037 Second St, Fort Myers, FL 33905
- **Phone:** (239) 271-4854
- **Website:** https://fixingfortmyers.com/
- **Hours:** Monday-Saturday, 7AM-7PM, by appointment

Do not add Bing or Apple URLs to `sameAs` until a durable public business-profile URL is verified. A search-results URL is not a business profile.

## 5. Monthly measurement

Open `ai-search-scorecard.csv` once per month in a fresh or logged-out search session. Record the visible local rank and whether each AI system mentions Perfect Timing or cites a Perfect Timing page. Do not turn an ad, map pack, or personalized result into an organic rank.
