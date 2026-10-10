# Photos, specialty services and clear contact expectations

October 9, 2026. The starting production commit was `4581bcbbf3ed62643d72982fa9275506212a85b2`.

## What changed

- Retained the homepage section order, two-column introduction/form, navigation, existing service URLs, request endpoint and Bay One provider configuration.
- Restored visible authentic photography. The homepage now shows the Mustang engine bay, engine on a stand, opened transmission and workshop welding. Engine, rebuild, transmission, brake and workshop pages use the corresponding recovered work photos.
- Added `/walnut-blasting-fort-myers`, its sitemap entry, service links, structured data and inquiry category. Put walnut blasting, engines and transmissions first in the featured grid; retained oil changes, no-starts and diagnosis prominently. Walnut cleaning is described as vehicle-dependent, not a guaranteed misfire cure.
- Preserved all existing services in the directory. Oil-change copy invites customers to mention leaks, noises or warning lights without presuming unnecessary repairs.
- Per the owner, calls use AI intake, texts go directly to the shop with supplied details, and responses are best effort at any hour. Removed the engine/transmission-only sticky message and the obsolete claim that AI only assists outside daytime hours. Reduced repeated owner-name branding while preserving biographies and customer quotations.
- Service links now retain walnut, oil-change and transmission categories through the form. Existing vehicle, symptom, drivability, location/drop-off, media and contact-preference behavior remains in place.

## Photo recovery

The September 29 `dbfe26d` layout simplification removed homepage photo sections. The October 1 `e10dc3d` commit introduced three authentic owner welding photos, but the homepage no longer displayed photos. Those three assets survived in GitHub.

Five additional historical work photos were recovered from the business's own Google Maps gallery, each attributed to Perfect Timing Auto Repair LLC. Their visible content and provenance were reviewed before use. See [asset provenance](PHOTO-PROVENANCE-20261009.json). Original JPEG bytes are preserved; CSS handles presentation.

The rebuilt Perfect PC VMDK was inspected read-only, without booting or writing the original. Its ordinary personal-media folders did not yield additional repair photos. Recovery originals and a more detailed private inventory are retained outside the deployed repository.

No verified walnut-blasting or before/after photograph was recovered. The pre-existing files with walnut/equipment filenames contain placeholder cards; these remain hidden. No welding or engine photo is presented as walnut-blasting evidence.

## Validation

- 126 synthetic tests passed, including the service-link-to-request categories and intact vehicle/location fields. `OLLAMA_HOST` was set to the loopback URL for the test subprocess because the host environment omits its URL scheme; no system setting or running provider changed.
- All 49 HTML pages, 113 JSON-LD blocks, and local assets/links were checked. Page structure/fragment validation passed across 49 pages.
- Structural axe checks reported zero violations in the representative page set. This audit does not test color contrast or replace browser inspection.
- Browser review at 1440×1000 and 390×844 confirmed loaded photographs and no horizontal overflow. A local walnut-page inquiry reached a saved-request receipt using the isolated mock receiver, with external notifications disabled.
- No customer message, real phone call or production lead was sent. Telephone forwarding, owner notification receipt and sales results were not independently tested.

## Release and rollback

GitHub Pages publishes the repository's `main` branch. After pushing, confirm the Pages deployment succeeds, then verify the live files and images match the release. Roll back by reverting this release commit and allowing Pages to redeploy; do not reset unrelated later work.

The source and raw recovery material are separate. `_config.yml` excludes docs, tools, tests, dependencies and private source material from the public site.
