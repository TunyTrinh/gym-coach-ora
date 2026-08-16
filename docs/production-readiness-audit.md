# Coachora Production Readiness and Optimization Audit

**Audit date:** 13 August 2026 (GMT+7)  
**Scope:** Existing Coachora PWA, Expo web frontend, Express/tRPC API, MySQL/Drizzle schema, and the supplied self-hosted Docker Compose topology.  
**Method:** Static code and configuration review, schema review, targeted corrective changes, automated validation, PWA export, and bounded local HTTP measurements.

> **Overall assessment: conditionally ready for a controlled small-scale rollout, but not certified for 1,000 simultaneous authenticated users.** The project has a workable booking transaction design and passed its available automated checks. It still needs authoritative frontend/server convergence, production-like booking load tests, a cross-process rate-limiting strategy, database pool sizing, monitoring, and deployment capacity testing before a 1,000-active-user target can be accepted.

## 1. Architecture and Data-Flow Inventory

| Area | Observed implementation | Assessment |
|---|---|---|
| Frontend | Expo Router / React Native Web PWA, NativeWind, AsyncStorage-backed local state | Mobile-first and installable; bundle should be reduced before large-scale rollout. |
| API | Express + tRPC, OAuth routes, storage redirect proxy | Protected procedures and server validation exist. |
| Database | MySQL 8.4 via Drizzle, transactional availability/booking operations | Appropriate base for atomic interval bookings. |
| Deployment | One app container, one MySQL container, Caddy HTTPS proxy, backup sidecar | Suitable for one-machine deployment; no horizontal scaling or explicit resource limits. |
| Offline/PWA | Web export, manifest/service-worker assets, cache-control at proxy | Production PWA export succeeded. Offline behavior needs device acceptance testing. |
| Tests | Vitest availability, calendar/health, scheduler, gym-booking, and refresh suites | 19 passed; 1 auth logout test intentionally skipped. |

### Critical Architecture Finding

Several user-facing screens currently use the local `gym-store`/AsyncStorage path while the authoritative tRPC availability procedures have separate persistence and concurrency controls. This creates a **source-of-truth split**: a booking that looks correct locally may not be the booking recorded by the server/database. The audit preserved the existing behavior rather than silently rewriting flows, but recommends completing a staged migration of all booking, schedule, history, notification, and profile reads/writes to the tRPC API before a broad public rollout.

## 2. Correctness and Data-Integrity Review

| Control | Result | Evidence / action |
|---|---|---|
| Session fits availability | Pass | Server rejects starts before window start or ends after window end; equality at the end boundary is allowed. |
| Same-window capacity | Pass | Availability row is locked with `FOR UPDATE` before the overlap count and insert. |
| Cross-window client overlap | Improved | The booking mutation now locks the Client row and rejects a pending/confirmed session that overlaps an existing Client booking. |
| Availability publication conflict | Improved | Availability creation now locks the Coach row and checks conflicts inside the transaction. |
| External identifier collision | Improved | Timestamp-only IDs were replaced by UUID-derived IDs. |
| Booking-query indexes | Improved and applied | Added and applied composite indexes for availability/status/slot and member/status/slot overlap reads. |
| Cancellation / notification writes | Reviewed | Booking cancellation and notification writes remain transactional in the authoritative server path. |

### Applied Migration

The reviewed migration `drizzle/0006_ancient_outlaw_kid.sql` contains only the following additive indexes, and was applied successfully to the connected database:

```sql
CREATE INDEX `bookings_availability_status_slot_idx`
  ON `bookings` (`availabilityShiftId`, `status`, `timeSlotId`);

CREATE INDEX `bookings_member_status_slot_idx`
  ON `bookings` (`memberUserId`, `status`, `timeSlotId`);
```

No tables, columns, or existing data were dropped or altered.

## 3. Security Review

| Topic | Current state | Priority |
|---|---|---|
| Authentication and authorization | tRPC protected procedures and role checks exist; Coach and Admin procedures check role/ownership. | Medium: add authorization integration tests for every mutation. |
| Transport | Caddy configuration provides managed TLS, HSTS, compression, `nosniff`, strict referrer policy, and restrictive camera/microphone/geolocation permissions. | Good baseline. |
| Direct app port | Hardened during audit with `X-Request-ID`, `X-Content-Type-Options`, `X-Frame-Options`, referrer policy, permissions policy, and removal of `X-Powered-By`. | Improved. |
| Request parsing | Default parser limit changed from 50 MB to configurable 1 MB; URL-encoded parsing is now flat. | Improved. |
| CORS | Production API is designed for same-origin PWA/API operation; development preview remains cross-origin. | Verify `APP_DOMAIN` and proxy topology at deploy time. |
| Rate limiting | No shared rate limiter exists. | **High** before open registration/public exposure. Use a reverse-proxy or Redis-backed limiter rather than per-process memory. |
| CSP | No content-security policy was added because Expo web assets and OAuth require measured allowlists. | High: add and test report-only CSP first. |
| Dependency advisory scan | `pnpm audit --prod` was started but stopped when it stalled under sandbox memory pressure. | Medium: make `pnpm audit --prod --audit-level=high` a CI gate. |
| Secrets | Compose uses `.env`; an example file exists. | High: ensure production `.env` is non-repository, permission-restricted, rotated, and backed up separately. |

## 4. HTTP and Operational Hardening Applied

The Express server now disables framework fingerprinting, returns a validated/generated request ID, applies defensive headers when accessed directly, limits request bodies by default to 1 MB, and handles `SIGTERM`/`SIGINT` by closing the HTTP server before exit. These changes preserve existing API routes and payload formats.

The deployment configuration already includes a health check, restart policies, an internal MySQL network, HTTPS through Caddy, and a backup sidecar. The following production controls remain necessary: tested backup restore, alerting, log aggregation, OS firewalling, resource limits, MySQL connection pool settings, slow-query monitoring, and a documented rolling-restart plan.

## 5. Frontend, Localization, PWA, and Performance Review

| Check | Result |
|---|---|
| TypeScript | Passed with `NODE_OPTIONS=--max-old-space-size=1024 npx tsc --noEmit`. |
| ESLint | Passed with `pnpm lint`. |
| Automated tests | Passed: 5 suites / 19 tests; 1 auth logout test skipped. |
| Server production bundle | Passed with `pnpm build`; generated `dist/index.js` (70.6 kB). |
| PWA export | Passed with bounded memory; 19 static routes exported. |
| Web bundle observation | Main JS bundle reported approximately 2.7 MB. |
| Localization | Shared type-safe English/Vietnamese catalog exists; user-created content is intentionally not translated. |
| Mobile UI | Current time selectors use explicit, independently snapping hour/minute/AM-PM wheels in both Client and Coach availability flows. |

The web bundle is functional but materially larger than ideal for mobile networks. Before a high-scale launch, establish bundle-size budgets, inspect route-level imports, lazy-load infrequent administrative/history screens, and audit third-party dependencies. These should be measured in a separate performance task rather than removed speculatively.

## 6. Bounded Load Measurements

The following measurements used the local `/api/health` endpoint after the hot-reload process settled. The harness used pooled keep-alive connections and measured only HTTP health responses—not login, database, booking, capacity locks, or real client browser behavior.

| Concurrent connections | Duration | Completed | Failures | Throughput | p50 latency | p95 latency | p99 latency |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 25 | 8.0 s | 40,515 | 0 | 5,047 req/s | 4.39 ms | 8.32 ms | 9.73 ms |
| 100 | 8.0 s | 40,867 | 0 | 5,086 req/s | 18.73 ms | 25.33 ms | 30.59 ms |
| 250 | 8.1 s | 40,164 | 0 | 4,974 req/s | 48.61 ms | 60.57 ms | 85.95 ms |

The initial health run overlapped a development hot reload and is excluded: it showed connection refusals caused by the process restart, not an HTTP application response. This was diagnosed from server logs and rerun after the server was stable.

> These results demonstrate that the local health endpoint can remain responsive at **250 pooled local connections** on this sandbox. They do **not** demonstrate that Coachora can support 1,000 concurrent authenticated Clients, a live MySQL workload, real internet latency, one-machine CPU/RAM limits, or transaction-heavy booking peaks.

## 7. Assessment of the 1,000-Active-User Target

**Current conclusion: not yet proven and should not be advertised as supported.** A single Node/Express container and one MySQL container can potentially serve 1,000 active users with the right machine and workload profile, but active users are not equivalent to simultaneous booking mutations. The critical risk is a concentrated booking period involving authentication, availability reads, capacity checks, row locks, writes, notifications, and local-state/server-state convergence.

Before accepting the target, test a production-like environment with: a measured VM specification; TLS/Caddy; MySQL with realistic data volume; Redis or reverse-proxy rate limiting; correct session/auth setup; 70–90% read traffic and realistic booking/cancel mix; 1,000 concurrent virtual users; 15–30 minute ramp and steady-state windows; p95/p99 latency, error rate, database connection/pool use, lock waits, CPU, memory, and network metrics. Define acceptance thresholds before testing rather than after observing results.

## 8. Prioritized Next Steps

| Priority | Recommendation | Why it matters |
|---|---|---|
| P0 | Move all real Client booking, schedule, history, and notification flows to the authoritative tRPC/MySQL path. | Eliminates the current local-state/server-state divergence. |
| P0 | Add mutation-level authorization, booking overlap, cancellation, and race-condition integration tests against MySQL. | Protects the most important data and concurrency rules. |
| P0 | Add shared rate limiting, audit logging visibility, error monitoring, and tested backup restore. | Required operational/security baseline for public exposure. |
| P1 | Configure production MySQL pool limits, CPU/memory limits, health/readiness monitoring, and slow-query logging. | Allows capacity decisions based on evidence. |
| P1 | Run the defined 1,000-user authenticated workload in a production-like environment. | Converts the target from assumption to evidence. |
| P1 | Add a report-only CSP and test OAuth/PWA flows, then enforce it. | Reduces script-injection impact without breaking the PWA. |
| P2 | Create route-level bundle budgets and lazy-load secondary screens. | Improves mobile startup and data consumption. |

## 9. Files Added or Changed by This Audit

- `server/routers.ts` — UUID identifiers; serialized Coach availability creation; Client-overlap protection.
- `server/_core/index.ts` — safe request headers, request-body limit, request IDs, graceful shutdown.
- `drizzle/schema.ts` — declared overlap-query indexes.
- `drizzle/0006_ancient_outlaw_kid.sql` — generated additive index migration.
- `scripts/load-health.mjs` — bounded, dependency-free HTTP health test harness.
- `docs/production-audit-notes.md` — working audit evidence.
- `docs/production-readiness-audit.md` — this final report.
