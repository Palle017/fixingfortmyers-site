# Injector cleaning — draft source change

Adds a homepage service card and directory link to the injector-cleaning section of the existing fuel-system page. The section's request action uses the existing single repair form with a fixed Injector cleaning service category on both homepage and standalone form, preserving the service in the saved lead alongside callback and vehicle details. No new endpoint, booking flow or operator/address wording.

## Content and visual provenance

The owner explicitly confirmed on October 25, 2026 that the shop owns multiple professional injector-cleaning systems. No equipment models, injector compatibility, ultrasonic features, flow testing, pricing, results or turnaround were verified or promised. Tony confirms suitability and work for the vehicle.

A bounded image search found no reuse-cleared equipment photograph. The supplied manufacturer page (https://www.hpmm.com.cn/product/hp-6a-fuel-testingcleaning-systems/) reserves rights; the research/Commons candidate used a noncommercial license; PIXTA required an unapproved purchase. None was copied.

assets/injector-cleaning-illustration.svg is an original unbranded vector created for this change, with no third-party image or reference traced/copied. Source: this PR. Third-party license/attribution: not applicable; no external licensed asset is incorporated. Public caption: Illustration of professional injector-cleaning equipment. Representative illustration; shop equipment may differ. It is a temporary representative illustration, not a photograph of shop equipment or proof of capability; replace the SVG and its caption/alt text when an owner-supplied photograph is available. No before/after is used.

## Verification path (injector-cleaning.request)

Open home → Services or Explore all repair services → Injector Cleaning → fuel-system page #injector-cleaning → Ask about injector cleaning → existing repair form. Fixed selectors: #services a[href$="#injector-cleaning"], #service-pages a[href$="#injector-cleaning"], #injector-cleaning, #injector-cleaning a[href="/?service=injector#contact"], #request-service, #bookingForm. Native links remain keyboard-operable; the existing dialog supplies Escape/close handling.

Use the loopback preview with analytics and external messages disabled. Verify entry links, visible image/caption, 320/390/820/1440 layout without horizontal overflow, form service preselection, name/vehicle fields and Escape. Existing mocked contact-handoff regression checks one saved lead with injector-cleaning intent, name, callback and vehicle on both form pages. No production form submission or customer message.

Release boundary: draft PR only; independent Lead Mechanic review of exact head. DO NOT MERGE OR DEPLOY under this request. Existing private-runtime and calendar/provider gates remain closed.
