# Deploy When Ready — fixingfortmyers.com

This folder is the **full production site** with the new branding applied
(logo swap sitewide, new-shop announcement on the homepage, footer monogram on
every page). It has **not** been deployed — Netlify deploys are currently
disabled on the account. When credits/deploys are restored, ship it with either
option below. Both publish the **entire contents of this folder** as the site root.

Site: **fixingfortmyers.com** (Netlify).

---

## Before you deploy (30-second sanity check)

Optional but recommended — preview locally exactly as it will look live:

```bash
cd "D:/BANG Industries/fixingfortmyers-site"
python -m http.server 8099 --bind 127.0.0.1
# open http://127.0.0.1:8099/  — check the homepage logo, the "We're Moving
# Into Our New Shop!" section under the hero, and the PT monogram in the footer.
# Ctrl+C to stop when done.
```

---

## Option A — Drag-and-drop (simplest, no tools)

1. Go to **https://app.netlify.com** and open the **fixingfortmyers** site.
2. Click the **Deploys** tab.
3. Drag the **`fixingfortmyers-site` folder itself** (this whole folder, with
   `index.html` at its top level) onto the drop zone that says
   *"Drag and drop your site output folder here"*.
4. Wait for the deploy to finish, then hard-refresh https://fixingfortmyers.com
   (Ctrl+Shift+R) and confirm the three changes above.

> Do **not** zip the folder first — Netlify Drop wants the folder (or its
> contents), and `index.html` must sit at the top level of what you drop.

---

## Option B — Netlify CLI (repeatable, scriptable)

Run these from inside this folder:

```bash
cd "D:/BANG Industries/fixingfortmyers-site"

# 1. Install the CLI (one time)
npm i -g netlify-cli

# 2. Log in — opens a browser window to authorize
netlify login

# 3. Link this folder to the existing site (one time)
netlify link --name fixingfortmyers

# 4. Deploy to production
netlify deploy --prod --dir .
```

- `netlify link --name fixingfortmyers` connects this local folder to the live
  site so `--prod` publishes to the real domain. If the name has changed, run
  `netlify link` with no flags and pick the site from the list.
- To preview a **draft** deploy first (a temporary URL, does not touch the live
  site), run `netlify deploy --dir .` **without** `--prod`, check the draft URL
  it prints, then re-run **with** `--prod` to go live.

---

## What changed in this build (for the deploy note / changelog)

- **New main logo** swapped in everywhere it appeared on the homepage
  (hero, about section, mobile section) — old `assets/pt-logo.png` retired.
- **"We're Moving Into Our New Shop!"** announcement section added to the
  **homepage only**, directly under the hero, with the new-shop poster and a
  "Book a Repair" button linking to the contact/booking form.
- **PT monogram** added to the footer of **all 21 pages**, next to the
  "Perfect Timing / Auto Repair LLC" business name.
- New optimized image assets added under `assets/`
  (`pt-logo-new.*`, `new-shop-poster.*`, `pt-monogram.*`, each with a `@2x`
  retina variant and a `.webp` version).

Nothing else was touched — the Bay One chat widget, the Netlify booking form,
and the JSON-LD SEO schema are byte-for-byte unchanged.

---

## Do NOT include in the deploy

Everything in this folder is meant to ship **except**:

- `DEPLOY-WHEN-READY.md` (this file) — harmless if it ships, but it's just notes.
- `.git/` — Netlify Drop ignores it; the CLI ignores it too. Safe to leave.
- `readme-deploy.txt` — the original package's notes; harmless.

If you want a spotless upload for **Option A**, you can delete this file and
`.git/` from a **copy** of the folder before dragging — but it is not required.
