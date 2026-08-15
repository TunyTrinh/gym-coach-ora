# Coachora Local 10-User Smoke Test Evidence

**Author:** Manus AI  
**Date:** 2026-08-13  
**Branch:** `dev-test`  
**Result:** **Passed in a localhost-only environment**

## Scope and Isolation

This validation exercised the approved fixed-duration profile against a production-style Coachora API at `http://127.0.0.1:3100` and an isolated MySQL database named `coachora_load_test` on loopback port `3307`. It did not access the deployed Coachora site, the cloud application database, or any staging environment.

The load scripts require both an explicit localhost URL and a localhost test/local database name. They also reject a target equal to the application or production database URL. The run generated 12 temporary users, one Coach availability window, and all related records under the exact tag `LOAD_TEST:coachora-local-smoke-20260813-002`. The relevant guard and fixture scripts remain outside application runtime and Docker build inputs.[1] [2]

| Control | Evidence |
|---|---|
| API target | `http://127.0.0.1:3100` health check returned `ok: true` before and after the run. |
| Database target | `coachora_load_test` on `127.0.0.1:3307`; the command asserted its expected loopback/test-only connection pattern before every database action. |
| Run identity | `coachora-local-smoke-20260813-002`. |
| Test duration and users | Fixed **120 seconds** with **10 Client workers**. |
| Real contracts | Authenticated tRPC availability browse, capacity preview, booking, cancellation, plus one deliberate unauthenticated request. |
| Deletion boundary | A separate confirmation-gated cleanup routine deleted only the exact run’s generated users and linked records.[3] |

## Repair Applied Before the Run

The first local attempt, `coachora-local-smoke-20260813-001`, did authenticate successfully: it issued booking calls as the seeded users and the deliberate unauthenticated request was rejected. Its bookings instead rolled back at the audit-log insert because a fresh migrated database lacked `auditLogs`. The initial interpretation of a Bearer-token/JWT mismatch was therefore not supported by the results file.

The missing-table issue exposed broader fresh-schema drift. Migration `0007_bright_firestar.sql` safely creates, only when absent, the four current Drizzle-schema tables omitted from prior migration files: `auditLogs`, `coachClients`, `coachNotes`, and `healthMeasurements`. The migration was applied through the normal Drizzle runner only to the isolated local database and verified there. A localhost-only cleanup script and focused isolation test were also added.[4] [5]

> The migration uses additive `CREATE TABLE IF NOT EXISTS` statements. It performs no data deletion, no column change, and no destructive operation.

## Measured Smoke Results

| Metric | Result |
|---|---:|
| Total HTTP/tRPC requests | 10,603 |
| Successful bookings | 763 |
| Successful cancellations | 763 |
| Expected capacity rejections | 0 |
| Expected unauthenticated rejections | 1 |
| Unexpected failures | 0 |
| Active bookings at end of run | 0 |
| Configured concurrent capacity | 3 |
| Orphaned booking/time-slot records | 0 |
| Booking p95 latency | 23.252 ms |

The test completed with an empty failure list. Every successful booking was subsequently cancelled by the same Client, leaving no active booking above the configured capacity and no booking referencing a missing time slot. The result artifact is intentionally ignored from version control because it is a generated local runtime record.[6]

## Recovery and Cleanup Evidence

The post-run API health check remained successful. The local API process changed from approximately **74 MB RSS** before the profile to approximately **114 MB RSS** after it; the local MySQL container reported approximately **688 MB** before the run and **707 MB** afterward. These are point-in-time sandbox measurements, not production sizing estimates.

The scoped cleanup then removed the exact run’s fixtures: 12 users, one availability window, 763 bookings, and 763 time slots. Direct post-cleanup queries reported zero matching users, availability records, bookings, and slots. The API remained healthy after cleanup.

## Regression Validation

The following checks passed after the repair:

| Check | Outcome |
|---|---|
| TypeScript | `npx tsc --noEmit` passed with a 1 GB Node heap limit. |
| Lint | `pnpm lint` passed. |
| Automated tests | 6 test files passed; 22 tests passed; 1 pre-existing logout test remained skipped. |
| Load-test isolation test | 3 focused tests passed, including the new localhost cleanup guard coverage. |
| Server build | `pnpm build` completed; `dist/index.js` measured 72.1 kB. |
| PWA export | `expo export --platform web` completed with 19 static routes. |

## Limits and Next Decision

This is **not** evidence of staging or production readiness at 1,000 concurrent users. The profile used only 10 temporary Clients, ran on one sandbox host, and intentionally cancelled bookings immediately. It confirms the repaired fresh schema, real authenticated contracts, normal capacity-related data integrity, cleanup, and local recovery under this narrow profile. It does not replace monitoring, backup/restore verification, production-like network latency, rate-limit testing, or the approval-gated staging plan.

No staging or higher-load test was started. Any staging run or load test above this approved 10-user profile remains blocked pending explicit user approval and a separately monitored staging environment.

## References

[1]: ../load-tests/lib/guard.mjs "Localhost and staging target guards"
[2]: ../load-tests/local/smoke-10-users.mjs "Fixed 10-user authenticated local smoke profile"
[3]: ../load-tests/local/cleanup-local.mjs "Confirmation-gated run-scoped localhost cleanup"
[4]: ../drizzle/0007_bright_firestar.sql "Additive fresh-schema parity migration"
[5]: ../tests/load-test-isolation.test.ts "Load-test isolation regression coverage"
[6]: ../load-tests/local/.runtime/coachora-local-smoke-20260813-002-results.json "Ignored generated local smoke result"
