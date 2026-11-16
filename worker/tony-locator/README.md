# Tony locator Worker

Live location feed for the hidden “Where’s my mechanic?” page on fixingfortmyers.com. This Worker, its KV namespace, and its write key are only for Tony’s locator. Do not reuse Gutters (or any other) Workers, KV, or keys.

The page stays in the “location isn’t shared” state until Tony’s phone posts a point. Do not seed KV with sample coordinates.

## What it exposes

- `GET /where` — public. Returns `{ "enabled": false }` when nothing is stored, or `{ "enabled": true, "lat", "lng", "acc", "updated" }`. CORS is limited to `https://fixingfortmyers.com` and `https://www.fixingfortmyers.com`. `Cache-Control: no-store`.
- `POST /update` — requires the write key as `Authorization: Bearer <KEY>` or `?key=<KEY>`. Accepts `{ "lat", "lng", "acc" }` or an OwnTracks location (`_type: "location"`, `lat`, `lon`, `acc`, `tst`). OwnTracks requests receive `[]`.

## Deploy (placeholders only)

1. In this folder, create a new KV namespace. Do not attach an existing namespace from another project.
2. Put the new id in `wrangler.toml` as the `LOCATION` binding (`id = "<KV_NAMESPACE_ID>"`).
3. Generate a 32+ byte write key and save it only to a `chmod 600` file on the operator box. Never commit it, paste it into chat, or put it in this repo.
4. Publish the Worker on the free plan, workers.dev only. Do not add a custom domain, DNS record, or zone route.
5. Set the secret, without echoing it:

   ```bash
   wrangler secret put WRITE_KEY --name fixingfortmyers-tony-locator < /path/to/write-key-file
   ```

6. Enable the script on workers.dev if needed:

   ```bash
   # POST enabled=true on the script subdomain endpoint
   ```

7. Point the page constant `LOCATION_URL` at `https://<worker-name>.<account-subdomain>.workers.dev/where`.

## Tony’s phone: OwnTracks

OwnTracks is free on iPhone and Android.

1. Set the mode to **HTTP**.
2. URL: `https://<worker-name>.<account-subdomain>.workers.dev/update?key=<WRITE_KEY>`
3. Use **Significant** or **Move** mode.
4. Leave the page and KV empty until the first real post from Tony’s phone.

## Alternative: iPhone Shortcuts

1. Create an Automation (for example, when arriving somewhere, or on a short time interval).
2. Add **Get Current Location**.
3. Add **Get Contents of URL**:
   - Method: POST
   - URL: `https://<worker-name>.<account-subdomain>.workers.dev/update`
   - Header: `Authorization: Bearer <WRITE_KEY>`
   - Request body (JSON): `{ "lat": Location.latitude, "lng": Location.longitude, "acc": Location.accuracy }`
