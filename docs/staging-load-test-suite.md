# Staging Load-Test Suite and Production Isolation Verification

The dedicated Coachora load-test suite is located in `load-tests/`. It uses actual Coachora HTTP/tRPC contracts, requires real staging session tokens obtained from normal OAuth, and has no application import, route, build hook, migration hook, startup hook, frontend Debug Mode, or test-only production feature.

| Isolation control | Implementation |
|---|---|
| Source boundary | All test code resides under the top-level `load-tests/` directory. Application source has no `load-tests/` import. |
| Docker boundary | `.dockerignore` excludes `/load-tests`, so it cannot enter Docker’s build context or runtime image. |
| Expo/Metro/PWA boundary | The directory is outside Expo routes/assets and is not imported by app, component, library, or server runtime modules. |
| Credentials | Tokens and database URLs are environment-only; `.runtime/`, `*.token`, and `*.secrets` are ignored. No secret is committed. |
| Environment guard | The scripts require an explicit staging confirmation and reject production-looking URL/database values. |
| Test-data boundary | Cleanup is denied unless the exact run ID and a deletion confirmation are present. It deletes only rows linked to `LOAD_TEST:<run-id>` availability records. |
| Deployment boundary | No `start`, `build`, migration, or application initialization script invokes the suite. Load runs are manual from a separate machine. |

The suite covers real authenticated session validation, Client availability browsing, capacity preview, booking/cancellation, Coach availability reads, and Admin availability management reads. The existing server API does not yet provide Coach discovery, Client schedule, progress, or booking-rescheduling procedures. Those operations are deliberately recorded as coverage gaps rather than replaced with invented endpoints or local-state shortcuts.

Before any staging execution, run `node load-tests/setup/assert-staging.mjs`; then run the k6 smoke profile from a separate machine. The full 1,000-user profile is a manual, approval-gated staging operation defined in `load-tests/README.md`. Retain k6 output and staging runtime/database metrics under `docs/load-test-results/<run-id>/`; that result directory is intentionally not part of application runtime or the Docker artifact.

## Verification Performed on `dev-test`

The application TypeScript check, ESLint, server production build, static PWA export, and complete Vitest suite passed after the isolation changes. The test suite reports six passed files and 21 passed tests; one pre-existing logout test remains intentionally skipped. The production server bundle is approximately 72.1 kB and the PWA export contains 19 routes.

The production artifact inspection confirmed that `web/load-tests` does not exist and that neither `dist/` nor `web/` contains a `load-tests` reference. The top-level Docker ignore rule excludes `/load-tests`, and the focused isolation test verifies the rule and the guard source. Syntax checks passed for each Node-based setup/cleanup script and the k6 scenario source.

The staging guard was executed with a synthetic staging/test URL and database URL, which passed without making a network or database call. It was then executed against the existing production-looking `gymflowpwa-hvqfc4hd.manus.space` domain and rejected the target before any test operation. No staging workload was run, no session token was supplied, and no database record was created or deleted during this verification.
