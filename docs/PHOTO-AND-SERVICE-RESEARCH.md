# Photo and service research

Research date: October 9, 2026. This memo records public-site observations and recommendations. It is not evidence that a change has increased bookings or revenue, and it is not an implementation checklist or deployment receipt.

## What the current site was communicating

The [live homepage](https://fixingfortmyers.com/) leads with engine, transmission, and diesel repair, but its featured service cards start with no-start diagnosis. Walnut blasting appears in one sentence inside the repair-process section; oil changes appear in the full service list. The emphasis does not match the owner's requested priority: specialty and major repairs, with oil changes retained as an entry service.

The operating model shown is repair at Tony's workshop by confirmed appointment. Urgency should lead to a call to check availability, without inventing immediate dispatch, guaranteed same-day completion, prices, certifications, or warranties.

The checked-in `contact-config.js` configures a durable cloud intake endpoint for the production domain. Preserve that production behavior and local preview isolation. Show a received confirmation only after an actual successful receipt; clearly distinguish an unsent text/email draft or fallback from a delivered request. Search-rendered fallback copy is not proof that the production form is SMS-only.

## Local operator observations

| Operator and source | Observed approach | Applicable lesson |
| --- | --- | --- |
| [CORR Motorsports](https://corrmotorsports.com/services/maintenance/) | Lists carbon cleaning and walnut blasting explicitly; describes a multipoint inspection with service; prioritizes calling and provides a vehicle-detail form. | Give walnut blasting a visible service card and page. Invite oil-change customers to mention existing concerns. Do not promise an included inspection unless the shop offers it. |
| [M&R Performance](https://www.mandrperformance.com/) | Pairs routine maintenance with major engine work, backed by its stated Jasper affiliation and warranty. | Support specialty claims with Tony's actual work, equipment, and repair process. Competitor affiliations and warranties do not transfer to this shop. |
| [Lucas Transmission](https://ltgauto.com/) | Leads with transmission symptoms, a call action, and the vehicle information callers should provide. | Explain symptoms customers recognize and make the next step obvious. |

These are a small current sample of public websites, not a market-share study or proof of any competitor's conversion rate.

## Recommended changes within the existing structure

- Keep the section order and contact paths. Feature walnut blasting, engine repair/rebuild or replacement, transmission repair, overheating, and oil changes in the existing service grid.
- Use recovered real photos in the hero, process panels, and relevant service cards. A tool or engine photo supports capability; it does not establish a specific customer repair or a before/after result without provenance.
- Use direct copy: “Due for an oil change? Tell us about that leak, noise, or warning light, too.” For urgent work: “Need the car back on the road? Call Tony to check availability.”
- Describe walnut blasting as a service to assess, not a cure for every misfire. Suggested copy: “Rough idle or recurring misfires? Ask about walnut blasting. Tony checks whether carbon buildup and intake-valve cleaning fit your vehicle's problem.” The [Subaru OEM bulletin](https://static.nhtsa.gov/odi/tsbs/2025/MC-11014865-0001.pdf) covers specified vehicles and carbon-related symptoms; it cautions against assuming applicability to every complaint.
- Qualify inquiries by vehicle, symptoms, drivability, timing, and callback details. Keep additional media optional. Customer readiness and suitable repair work are more useful criteria than assumptions about income.

## UX and the repair approval process

[NN/g's image research](https://www.nngroup.com/articles/photos-as-web-content/) favors relevant images of real people and products over decorative filler. Use a static hero with useful captions, not an automatic slideshow. [Form guidance](https://www.nngroup.com/articles/web-form-design/) supports a short single-column form with persistent labels and grouped related fields.

Use responsive photo sizes, explicit dimensions, eager loading for the hero, and lazy loading below the fold. Write concise alt text that explains relevant visual information. Sources: [Google responsive images](https://web.dev/learn/design/responsive-images) and [W3C informative images](https://www.w3.org/WAI/tutorials/images/informative/).

Beyond the website, the recommended path is inquiry, inspection, documented findings, prioritized estimate, approval, and follow-up on deferred work. [Tekmetric's operator stories](https://www.tekmetric.com/success-stories?e6db6dc3_page=1) describe inspection photos and text-based communication; its [inspection documentation](https://www.tekmetric.com/feature/digital-vehicle-inspection) describes preserving declined findings for later repair plans. These are vendor-hosted accounts and product capabilities, not guaranteed business outcomes. This task does not require buying or migrating shop software.

Measure qualified inquiries, confirmed appointments, approvals, and completed repair value by service after release. Website publication, photo rendering, and working intake are verification milestones; increased high-value work requires later business data.
