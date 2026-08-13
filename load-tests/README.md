# Coachora Staging Load Tests

This directory is version-controlled **test infrastructure only**. It is not imported by Coachora application code, is excluded from the Docker build context, has no production startup hook, and requires explicit staging-only environment variables before it can run.

## Real contracts covered

The k6 scenario uses the existing `/api/auth/me` route and these tRPC procedures: `availability.bookable`, `availability.previewCapacity`, `availability.book`, `availability.cancel`, `availability.mine`, and `availability.adminList`. It sends Bearer tokens exactly as Coachora’s mobile/web tRPC client does. It does not add any API route, Debug Mode, authentication bypass, or generic test endpoint.

Coachora currently has no server API for Coach discovery, Client schedule, progress, or booking changes/rescheduling. Those views use the existing client-local data path or lack a matching tRPC procedure. This suite therefore refuses to pretend they are server-tested. They must be migrated to authoritative server procedures before they can be included in the authenticated production workload.

## Required staging inputs

Create real test accounts through the normal staging OAuth flow and collect their staging session tokens only in the secure load-test runner. Do not commit or place tokens in this repository. The runner needs JSON arrays of real Client tokens, plus optional Coach/Admin token arrays. Create one future Coach availability window using the real Coach UI/API, set its note to `LOAD_TEST:<run-id>`, and supply its real IDs/times.

```bash
export COACHORA_STAGING_URL='https://staging.example.test'
export COACHORA_STAGING_CONFIRMATION='I_CONFIRM_STAGING_ONLY'
export COACHORA_LOAD_RUN_ID="coachora-load-$(date +%Y%m%d-%H%M%S)"
export LOAD_TEST_DATABASE_URL='mysql://runner:password@mysql-staging.example.test/coachora_staging'
export COACHORA_CLIENT_TOKENS_JSON='["real-staging-client-session-token"]'
export COACHORA_COACH_TOKENS_JSON='["real-staging-coach-session-token"]'
export COACHORA_ADMIN_TOKENS_JSON='["real-staging-admin-session-token"]'
export COACHORA_TEST_COACH_ID='1'
export COACHORA_TEST_WINDOW_ID='availability-real-staging-id'
export COACHORA_DATE_START='2026-09-01T00:00:00.000Z'
export COACHORA_DATE_END='2026-09-02T00:00:00.000Z'
export COACHORA_BOOKING_START_AT='2026-09-01T09:00:00.000Z'
```

Validate the target before installing or invoking k6:

```bash
node load-tests/setup/assert-staging.mjs
```

The assertion rejects a missing confirmation, targets that look like production, a target equal to `PRODUCTION_APP_DOMAIN`, a database URL equal to `DATABASE_URL`, and database host/name combinations that do not contain `stage`, `staging`, or `test`.

## Localhost-only preflight

Localhost can verify the suite’s **isolation and health-check wiring**, but cannot replace a staging workload. It must use a separately provisioned local MySQL database whose host is localhost and whose name contains `local` or `test`; the active application database is deliberately rejected even when the app URL is localhost. Set the following values only in the local shell or a separately protected local environment file; do not commit credentials.

```bash
export COACHORA_LOCAL_SMOKE_URL='http://127.0.0.1:3000'
export COACHORA_LOCAL_SMOKE_DATABASE_URL='mysql://load_test:password@127.0.0.1:3306/coachora_local_test'
export COACHORA_LOCAL_SMOKE_CONFIRMATION='I_CONFIRM_LOCAL_ISOLATION'
node load-tests/setup/assert-local-smoke.mjs
```

This preflight issues only `GET /api/health`. It does not need OAuth tokens, create availability, book a session, write the database, or delete any record. Do not run k6 against localhost until Coachora is explicitly started with the separate local-test database and test OAuth/session configuration.

## Execution profiles

Run from a **separate load-generator machine** against staging. The default is a short smoke profile. Set `COACHORA_LOAD_PROFILE=full` only after staging monitoring and database backup/restore have been checked. The full profile provides: 10 users for 2 minutes; 100 users for 5 minutes; ramp to 1,000 over 10 minutes; sustain 1,000 for 30 minutes; a 200-to-1,000 booking spike; and recovery to 100 then zero users.

```bash
k6 run load-tests/k6/coachora-staging.js
COACHORA_LOAD_PROFILE=full k6 run load-tests/k6/coachora-staging.js
```

The workflow mix is encoded as 60% availability/browse/capacity reads, 20% profile/progress-equivalent reads where real APIs exist, 15% book/cancel, and 5% Coach/Admin reads. Booking-capacity rejections caused by deliberate races are tagged as expected business outcomes; malformed responses, unexpected authorization failures, and transport failures are recorded as workflow failures.

## Database integrity and cleanup

Run cleanup only after retaining metrics and confirming the run ID. Cleanup selects availability rows whose `note` equals `LOAD_TEST:<run-id>`, then deletes only bookings, notifications, time slots, availability records, and matching audit logs linked to those run-scoped windows. It does not delete users, Coach profiles, assignments, unrelated bookings, or any untagged row.

```bash
export COACHORA_LOAD_CLEANUP_CONFIRMATION='DELETE_ONLY_THIS_RUN'
node load-tests/setup/cleanup-run.mjs
```

## Required pass gates

Do not claim 1,000-user readiness unless the full staging profile passes with unexpected errors below 0.5%, normal API p95 below 1 second, booking API p95 below 2 seconds, CPU and total RAM below 75%, no process restart, no unbounded memory growth, no lost/duplicate bookings, no capacity breach, consistent Client/Coach schedules, and memory close to baseline after recovery.
