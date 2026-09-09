# Website counters

The public website sends anonymous, deduplicated page-view events to POST /hooks/analytics/visit. The private loopback receiver exposes GET /api/metrics for Bay One's Website Inbox > Website Counters tab. Public access to totals is not provided.

Today follows America/New_York. Visitors are unique browser identifiers, not verified people. Page views include returning browsers and refreshes. Tracking starts at deployment; historical visitor counts are unavailable. AI counts include completed replies and estimates, exclude failures and retries, and persist in daily aggregate rows after the seven-day conversation cleanup. Existing retained chat history seeds the initial count once.

The app refreshes every ten seconds and retains the last successful counters offline. Appointment/request actions and reviewed customer creation remain in the neighboring tab.

Run node --test server.test.mjs metrics.test.mjs. Source here is excluded from GitHub Pages output by _config.yml. The active Windows receiver is deployed separately with its existing launcher and data directory.
