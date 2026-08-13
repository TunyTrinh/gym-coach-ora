# Coachora Production Optimization Completion Report

**Date:** 13 August 2026 (GMT+7)  
**Branch:** `optimize-program`  
**Scope:** The existing Coachora PWA, Expo web frontend, Express/tRPC API, MySQL/Drizzle schema, continuous-availability booking path, self-hosted deployment assets, and live development/process footprint.

> **Decision summary.** The verified changes are backward-compatible and preserve Coachora’s existing booking, availability, localization, role, and PWA behavior. The application is suitable for a controlled rollout after environment configuration, but it is **not certified for 1,000 concurrent authenticated users**. The missing proof is a production-like database-backed booking workload, not a failed functional test.

## 1. Scope and Method

The review inventoried the application structure, active process tree, dependencies, MySQL schema and migrations, tRPC router, local booking store, PWA export, deployment configuration, existing test suite, and selected Client/Coach/Admin flows. The review then applied only additive or behavior-preserving changes, ran static and regression validation, exported the PWA, started a separate production-mode Node process, and executed bounded local HTTP measurements.

The review did not delete data, change confirmed business rules, rewrite the UI, change the availability model, install a dependency, or merge into `main`.

| Requirement from supplied specification | Status | Evidence |
|---|---|---|
| Full project/data/deployment inventory | Completed | Source, router, schema, local-store, Docker/Caddy, PWA, process, and migration review completed. |
| Safe production improvements only | Completed | All modifications are additive hardening, indexes, controlled pool configuration, and debug-log removal. |
| Functional/regression/build validation | Completed | TypeScript, ESLint, Vitest, server build, PWA export, and HTTP checks passed. |
| Resource comparison between development and production | Completed with RSS/CPU data | Development and separate production processes were measured; JavaScript heap was not sampled because an intrusive inspector/snapshot was intentionally avoided. |
| 30-minute, 1,000-user authenticated booking test | Not run; blocked by safe-environment limit | See Sections 6 and 8. |
| One Markdown completion report | Completed | This file. |

## 2. Architecture and Data-Flow Findings

| Layer | Current design | Review result |
|---|---|---|
| Mobile/PWA frontend | Expo Router, React Native Web, NativeWind, AsyncStorage, English/Vietnamese catalog | Installable web export succeeds; secondary bundle loading remains an improvement opportunity. |
| API | Express with tRPC procedures, OAuth/storage routes, same-origin production hosting | Core booking mutations are protected and use server-side checks. |
| Database | MySQL via Drizzle, continuous availability windows, time slots, bookings, notifications, audit logs | Transactional interval-capacity design exists; indexes and race protections were strengthened. |
| Deployment | Caddy TLS proxy, app, MySQL, backup container, static PWA served from the app container | Appropriate single-machine baseline; no multi-instance scaling or formal observability layer yet. |
| Client state | Local `gym-store` supports offline/demo state in multiple screens; tRPC server path separately manages authoritative transactions | **Highest architecture risk:** the two paths must be converged before a broad multi-device production rollout. |

### Data Consistency and Booking Review

The server still enforces the key continuous-availability invariant: the selected Client interval must start inside the Coach window and end on or before the window end. Concurrent capacity is calculated from overlapping confirmed/pending bookings in the authoritative API path. Existing interval helper tests confirm the inclusive end-boundary behavior.

The audit identified and addressed three safe concurrency weaknesses. First, timestamp-derived external booking and availability IDs could theoretically collide under concurrent writes. Second, overlapping availability publications for the same Coach were checked outside the creation transaction. Third, a Client could attempt overlapping bookings in different Coach windows without a Client-level serialization point. The applied changes use UUID-derived external identifiers, lock the Coach row before availability conflict checking, lock the Client row before booking, and reject overlaps with the Client’s confirmed or pending bookings.

## 3. Implemented Changes

| File | Change | Expected effect |
|---|---|---|
| `server/routers.ts` | Replaced timestamp-only external IDs with UUID-derived values. | Removes realistic same-millisecond ID collision risk. |
| `server/routers.ts` | Moved Coach availability conflict checking inside a locked transaction. | Prevents two concurrent availability publications from bypassing the overlap check. |
| `server/routers.ts` | Added Client-row serialization and existing-Client-overlap protection before booking. | Prevents one Client holding overlapping sessions across windows. |
| `server/routers.ts` | Locked cancellation records within the cancellation transaction and preserved the original API response. | Prevents concurrent cancellation updates from racing. |
| `server/routers.ts` | Tightened object-level authorization for Coach-client note access. | Prevents a Coach from accessing notes outside their managed Client relationship. |
| `drizzle/schema.ts` | Declared two composite booking overlap indexes. | Reduces scan cost for capacity and Client-overlap checks. |
| `drizzle/0006_ancient_outlaw_kid.sql` | Generated additive index migration. | Provides tracked schema evolution; no destructive operations. |
| Connected database | Applied the reviewed additive indexes. | The live connected database now has the query-supporting indexes. |
| `server/db.ts` | Added a lazy, bounded mysql2 promise pool (default 30, configurable 1–50), keep-alive, connect timeout, and close hook. | Avoids uncontrolled database connection growth while retaining lazy local tooling behavior. |
| `server/_core/index.ts` | Added direct-port defensive headers, request ID, 1 MB default request limit, and graceful HTTP/database shutdown. | Limits oversized metadata requests and improves traceability/restart behavior. |
| `lib/theme-provider.tsx` | Removed a shipped `console.log` invoked repeatedly during static export. | Eliminates repeated production build/runtime debug logging. |
| `scripts/load-health.mjs` | Added a bounded, dependency-free pooled HTTP load harness. | Makes baseline measurements repeatable without adding packages. |

No confirmed UI behavior, Vietnamese/English text, business rule, availability model, or user data was changed.

## 4. Validation Evidence

| Validation | Result | Detail |
|---|---|---|
| TypeScript | Passed | `NODE_OPTIONS=--max-old-space-size=1024 npx tsc --noEmit` completed with no errors. |
| Lint | Passed | `pnpm lint` completed. Node emitted a non-blocking module-type warning for `eslint.config.js`; see remaining risks. |
| Automated tests | Passed | 5 test files passed, 19 tests passed, 1 logout test remained intentionally skipped. |
| Server production bundle | Passed | `pnpm build` produced `dist/index.js` at approximately 72.1 kB. |
| PWA production export | Passed | `pnpm run build:web` exported 19 routes. |
| HTTP health route | Passed | Separate `NODE_ENV=production` process returned `200` on `/api/health`. |
| Response headers | Passed | `X-Request-ID`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy` were observed. |
| Request body limit | Passed | A 1.1 MB JSON request returned `413`. |
| PWA manifest cache policy | Passed | `/manifest.json` returned `Cache-Control: no-cache, no-store, must-revalidate`. |

The Expo web export created a **4.2 MB** static directory. Its primary JavaScript asset was **2,698,926 bytes (about 2.7 MB)** and the primary CSS asset was approximately **9.4 kB**. This is functional, but a clear optimization target for mobile startup and bandwidth.

## 5. Resource Measurements

The development process tree and separate production-mode process were measured on this sandbox. RSS is resident memory, not unique memory: parent/child processes share pages, so summed development RSS is an upper-bound indicator rather than an exact total.

| Mode / process | Measured RSS | Current CPU at sample | Interpretation |
|---|---:|---:|---|
| Metro / Expo web bundler | ~1,028 MB | 2.6% | Dominant development-only cost. |
| API server (development) | ~93 MB | ~0% | API baseline before audit changes. |
| NativeWind helpers (3 processes) | ~261 MB combined | <0.5% | Development transform overhead. |
| TypeScript lightweight watcher | ~45 MB | ~0% | Development-only verification process. |
| Development process-tree sum | ~1.72 GB RSS | Low when idle | Overcounts shared memory; explains prior sandbox pressure. |
| Production-mode Node process at first health check | ~116 MB RSS | Initial startup sample | Metro and TypeScript watcher absent. |
| Production-mode Node process after bounded load | ~182 MB RSS | 52.9% at sample | Measured while completing the short local load test. |

The sandbox had 3.8 GiB RAM, roughly 1.3 GiB available during the production-load sample, and no swap consumption. Production deployment should not run Metro, Expo development services, browser renderer processes, or the TypeScript watcher; its runtime footprint is therefore materially lower than the development sandbox footprint.

## 6. Bounded Load and Spike Measurements

The harness used keep-alive sockets against the separate production-mode `/api/health` endpoint. It measures Node/HTTP responsiveness only. It does **not** exercise OAuth, browser rendering, MySQL, row locks, rate limits, notifications, or authenticated booking mutations.

| Concurrent pooled connections | Duration | Completed requests | Errors | Throughput | p50 | p95 | p99 |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 25 | 8.0 s | 40,515 | 0 | 5,047 req/s | 4.39 ms | 8.32 ms | 9.73 ms |
| 100 | 8.0 s | 40,867 | 0 | 5,086 req/s | 18.73 ms | 25.33 ms | 30.59 ms |
| 250 | 8.1 s | 40,164 | 0 | 4,974 req/s | 48.61 ms | 60.57 ms | 85.95 ms |
| 250 | 15.1 s | 62,717 | 0 | 4,154 req/s | 53.07 ms | 98.36 ms | 143.83 ms |

The lower 15-second throughput is expected under the separate production process and sustained 250-connection run. A preliminary run overlapping a hot reload was excluded because its connection refusals came from the development service restart, not an application response regression.

> The measurements show that the local health endpoint remained responsive at 250 pooled local connections. They are **not evidence of 1,000 authenticated concurrent Clients** or of MySQL-backed booking capacity.

## 7. Remaining Risks and Recommended Work

| Priority | Risk | Impact | Required resolution |
|---|---|---|---|
| P0 | Local `gym-store` and authoritative tRPC/MySQL booking paths coexist. | Cross-device data divergence and bypass of server concurrency checks in user-facing flows. | Move Client booking, schedule, history, notification, and availability reads/writes fully to the server source of truth; validate migration with real data. |
| P0 | No production-like authenticated booking test exists. | Cannot make a credible 1,000-user claim. | Build a controlled staging environment and run a real booking/cancel/read workload with realistic database size. |
| P0 | No shared production rate limiter or monitoring stack. | Higher abuse risk and limited incident diagnosis. | Add reverse-proxy/Redis-backed rate limiting, structured logs, error monitoring, dashboards, and alerts. |
| P1 | Production connection limit is configurable but not set per machine in Compose/environment. | Pool can be mis-sized relative to MySQL capacity. | Set `DB_CONNECTION_LIMIT` after measuring MySQL `max_connections`, application replicas, and expected peak queries. |
| P1 | No CSP has been enforced. | Lower defense against script injection. | Start with a tested report-only CSP that accommodates Expo and OAuth, then enforce it. |
| P1 | 2.7 MB primary JavaScript bundle. | Slower mobile first load and unnecessary bandwidth. | Establish bundle budgets; lazy-load non-primary routes and inspect high-cost imports with a bundle analyzer. |
| P2 | ESLint config produces a Node module-type warning. | Minor startup/tooling overhead and noise. | Resolve deliberately after confirming project-wide CommonJS/ESM policy; do not make a speculative package-type flip. |
| P2 | Dependency advisory query did not finish in the memory-constrained sandbox. | Vulnerability status is incomplete. | Run `pnpm audit --prod --audit-level=high` in CI with registry/network availability and retain output as release evidence. |

## 8. 1,000-User Test: Blocker and Safe Test Plan

The requested 30-minute sustained 1,000-active-user test, spike test, and booking-race test were not run in this 3.8 GiB shared sandbox. Running that workload here would create misleading results, risk destabilizing the working development preview, and would still omit production network, Caddy/TLS, real authentication, and representative MySQL behavior.

The following test must be approved and executed in staging before the target is accepted:

| Parameter | Proposed evidence-based test |
|---|---|
| Environment | Dedicated staging VM matching or smaller than planned production; Caddy/TLS, production environment variables, MySQL with a production-like dataset, and monitoring enabled. |
| Duration | 5-minute ramp, 30-minute 1,000-active-user steady state, then 10-minute recovery observation. |
| Traffic mix | 70–80% availability/schedule reads, 10–15% session/profile/history reads, 5–10% booking/cancellation mutations, and an intentional simultaneous-booking race case. |
| Measurements | p50/p95/p99 HTTP latency, errors by endpoint, Node RSS/CPU/event-loop lag, MySQL pool utilization, active connections, lock waits, slow queries, Caddy metrics, and container restarts. |
| Draft acceptance criteria | Zero confirmed booking-capacity violations; zero unauthorized data exposure; error rate under 1%; p95 reads below 500 ms; p95 booking/cancel below 1,000 ms; no sustained memory growth; no database lock-wait backlog. These thresholds require product-owner approval before use. |
| Decision gate | Do not claim 1,000-user readiness until this environment produces retained test artifacts and the results meet the agreed thresholds. |

## 9. Files Added or Modified During the Expanded Audit

- `server/routers.ts`
- `server/db.ts`
- `server/_core/index.ts`
- `drizzle/schema.ts`
- `drizzle/0006_ancient_outlaw_kid.sql`
- `scripts/load-health.mjs`
- `lib/theme-provider.tsx`
- `docs/production-audit-notes.md`
- `docs/production-readiness-audit.md`
- `docs/production-optimization-report.md`

## 10. Final Status

The safe hardening and validation work requested for the current branch is complete. The branch preserves confirmed Coachora behavior, passes the available code and regression gates, produces an installable PWA export, demonstrates bounded local production HTTP stability, and documents the missing production-scale evidence honestly.

The remaining P0 work is intentionally not auto-applied because it changes the application’s source-of-truth architecture and needs a staged migration/test plan. The remaining 1,000-user work needs a dedicated staging environment and explicit success criteria.
