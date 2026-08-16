# Preview and Public PWA Evidence

## Public PWA inspection — 2026-08-16

- Public URL inspected: `https://coachora-pwa-382sq9pq.manus.space/`.
- The document title was **Coachora**, but the rendered application remained on its `Loading…` screen after two inspections.
- This establishes an observable public-versus-Preview divergence: the current Preview had rendered the Coachora home screen from checkpoint `b63595fd`, while the public PWA did not complete startup in the same browser session.
- The public page HTML was captured at `/home/ubuntu/browser_html/coachora-pwa-382sq9pq_manus_space_page_1786898560849.html` for asset and cache analysis.

## Deployed asset evidence

The public document referenced the release entry `/_expo/static/js/web/entry-6a7865de0fd51f046a6a2d9fc821048b.js`, while the current tested source export referenced `/_expo/static/js/web/entry-767d3216591d48bd5d29cec99fdae144.js`. The public entry responded with HTTP 200 and JavaScript content, but it did not appear in browser resource timing and the root remained `Loading…`. No service worker was registered and no Cache Storage entries existed in that browser context, so stale service-worker cache was not the direct cause of that observed loading failure.

The public HTML was last modified at 15:43:20 UTC and its entry bundle at 15:43:20 UTC, whereas the current source export was produced after later workflow changes. This demonstrates that the current Preview source and public PWA are different release artifacts rather than two actively synchronized environments.
