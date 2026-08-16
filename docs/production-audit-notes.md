# Coachora Production Audit Notes

## Initial Inventory

Coachora is an Expo SDK 54 / React Native web PWA with an Express and tRPC backend, Drizzle ORM, MySQL migrations, custom localization, service-worker assets, and Vitest regression coverage. The primary runtime procedures are in `server/routers.ts`; booking, availability, and coach UI share domain types from `shared/gym.ts` and helpers under `lib/`.

## Booking and Permission Findings

The server validates availability inputs with Zod, restricts Coach availability management through `managedCoachId`, restricts bookable availability and booking mutations to the Client role, and uses an availability-row `FOR UPDATE` lock during the booking transaction. The booking transaction validates the whole interval and counts overlapping confirmed or pending bookings before inserting a confirmed booking and notifications. This is a strong starting point for preventing over-capacity bookings under concurrent requests.

The audit must further verify schema indexes, booking identifier uniqueness, time-zone behavior, legacy single-shift cancellation paths, client-side store parity, and whether every route uses an appropriate authorization check.

## Data Model and Client-State Findings

The database schema includes unique external IDs and indexes for availability by coach/start and status/start. However, the concurrent booking query filters by availability shift, booking status, and joined slot interval without a dedicated booking composite index. The audit should add an index only if an inspected migration and test evidence confirm it is safe.

The current mobile UI uses `GymProvider` and an AsyncStorage-persisted seeded snapshot for core client interactions. Its interval checks, capacity checks, and availability rules mirror the server at a high level, but this is a demo/local state path rather than durable multi-user synchronization. Production booking authority must remain server-side; the audit will document this architectural gap and prevent local-only operations from being represented as cross-device guarantees.

## Scope and Evidence Standard

The requested scope requires a complete frontend, backend, API, database, permission, PWA, localization, dependency, deployment, concurrency, and resource audit while preserving confirmed business rules and existing data. The requested traffic objective is 1,000 concurrently active users with an explicit instruction not to claim that level without evidence. The managed production runtime’s 1 vCPU / 512 MB ceiling means a 1,000-user certification cannot be safely inferred from local development results; the report will distinguish local bounded tests from production-capacity evidence and state any required infrastructure explicitly.

## Critical Architecture Mismatch

`app/_layout.tsx` mounts both the tRPC provider and `GymProvider`, while `app/(tabs)/book.tsx` currently calls `useGym().bookAvailability` rather than the server booking mutation. Consequently, the visible Client booking flow is operating against AsyncStorage-persisted seeded data instead of the atomic server transaction. Replacing the entire front-end data layer would be an architectural migration beyond a safe automatic audit fix. The final report must request confirmation before that migration, while safe server and local-state hardening can proceed.

## HTTP and Deployment Findings

The HTTP server correctly trusts one reverse proxy hop, permits cross-origin preview traffic only outside production, serves production API and PWA from the same origin, and disables caching for HTML, manifest, and service-worker files. It exposes a basic health endpoint but has no readiness database check, request correlation ID, graceful shutdown path, rate limiting, or explicit security headers. JSON and URL-encoded payload limits are both 50 MB, which is unnecessarily high for the current text-and-metadata API surface. The storage proxy supports GET redirects only and does not require the large global parser limit.

## Self-Hosted Deployment Findings

The Docker Compose topology has a single Node application instance, one MySQL container, Caddy TLS termination, and a backup sidecar. It has health checks and restart policies, but no CPU/memory reservations, horizontal replicas, database pool configuration, backup-restore verification, or configured request/connection limits. Caddy already supplies compression, HTTPS, HSTS, `nosniff`, strict referrer policy, and restrictive camera/microphone/geolocation permissions. It does not provide a content-security policy or rate limiting.

Under this single-instance topology, a 1,000-active-user certification would require a measured production-like environment and additional infrastructure; it cannot be responsibly claimed from the current local configuration.

## Migration and Index Safety Findings

The continuous-availability migration removes the old one-booking-per-availability unique index and adds `maximumCapacity`, which is necessary for concurrent interval bookings. The migration history contains legacy schema transformations that must be retained for deployed instances. A new index for active booking overlap reads can be added as a strictly additive migration, but the legacy schema history confirms that no destructive cleanup or model replacement should occur automatically.

## Database Client and Identifier Findings

The server creates a lazy Drizzle MySQL client from `DATABASE_URL` but does not expose explicit pool limits, connection timeouts, or readiness verification. Booking external IDs currently include a `Date.now()` suffix. The availability row lock serializes same-window booking writes, but cross-window requests in the same millisecond could still collide with the unique external-ID constraint. Replacing the timestamp suffix with a cryptographic UUID segment is a safe backward-compatible correction.

## Applied Hardening

The audit added two reviewed composite indexes for availability and member overlap lookups, applied them successfully to the connected database, and preserved the corresponding generated migration. Availability creation now locks the Coach row before testing for conflicts; booking now locks the Client row and rejects a booking that overlaps the Client’s existing confirmed or pending session, even if a different Coach window is involved. Timestamp-based external IDs were replaced with UUID-based IDs.

The HTTP server now disables the Express fingerprint header, assigns a validated request identifier, adds direct-port defensive headers, caps parsers at a configurable 1 MB default, and shuts down gracefully on `SIGTERM` or `SIGINT`. A cross-process rate limiter, database pool sizing, CSP, and high-availability architecture require deployment-specific validation and are reported as remaining work rather than guessed changes.
