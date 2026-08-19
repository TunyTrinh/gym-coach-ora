# Phase 3A database/schema synchronization audit

Audit date: 19 August 2026 (Asia/Ho_Chi_Minh)

This checkpoint covers the Drizzle models and relations, all SQL migrations and metadata, tRPC/database field mappings, constraint and index coverage, a fresh MySQL 8.4 installation, and an upgrade from migration `0014` with synthetic linked data. The repository still has no configured staging environment. No production endpoint or production data was used.

## Entity map

| Business entity | Database table | API/type | Relationships | Constraints | Status |
| --- | --- | --- | --- | --- | --- |
| Identity and role | `users` | Session context, `auth.*`, `admin.listUsers`, `User`/`InsertUser` | Parent of bookings, notifications, health, audit, Coach link, closure/availability actors | Unique `openId`; nullable-unique normalized email; role enum; timestamps | Synchronized |
| Gym | `gyms` | `admin.listActiveGyms`, room responses, `Gym`/`InsertGym` | Parent of rooms, Coaches, time slots, availability | Unique external ID; boolean check; deletion blocked while referenced | Synchronized |
| Room | `gymRooms` | `admin.*Room`, room calendar/choices, `GymRoom`/`InsertGymRoom` | Belongs to gym; parent of closures, slots, availability | Unique external ID and normalized name per gym; capacity, hours, active checks; lifecycle `deletedAt`; query index | Synchronized |
| Full-day room closure | `roomClosures` | Admin closure procedures, `RoomClosure`/`InsertRoomClosure` | Belongs to room; creator and optional updater are users | Unique room/date; date index; foreign keys; created/updated audit timestamps | Synchronized for the approved full-gym-day rule |
| Coach profile | `coaches` | Catalog, Coach/Admin account procedures, `Coach`/`InsertCoach` | Optional gym/user; parent of authorization, availability, slots, Clients, notes | Unique external ID and linked user; active/name index; boolean check; foreign keys | Synchronized |
| Coach authorization | `coachAuthorizations` | Google authorization and role resolution, `CoachAuthorization` types | One authorization per Coach; one normalized email per authorization | Two unique keys, status enum, Coach foreign key | Synchronized |
| Legacy service catalog | `serviceTypes` | No production booking API; `ServiceType` types | Optional legacy links from slots/availability | Unique external ID; legacy links protected by foreign keys | Legacy-readable; removal deferred by explicit instruction |
| Booking interval | `timeSlots` | Internal schedule/booking query result, `TimeSlot` types | Gym required; Coach/room/legacy service optional; parent of bookings | Unique external ID; interval/capacity/booked-count checks; room/Coach indexes; foreign keys | Synchronized; new writes set service to `null` |
| Coach availability | `availabilityShifts` | `availability.*`, `AvailabilityShift` types | Gym/Coach required; room required by current API; optional legacy service/member/booking; creator/updater | Unique external ID; lowercase status enum; interval/capacity checks; four scheduler indexes; foreign keys | Synchronized; runtime is service-free |
| Booking | `bookings` | Member/Coach schedules and booking mutations, `Booking` types | Required member/time slot; optional Coach availability; optional check-in actor | Unique external ID; lowercase status enum; three overlap indexes; foreign keys | Synchronized; interval race certification remains Phase 4 |
| Notification | `notifications` | Recipient-scoped member API, `Notification` types | Required recipient; optional booking | Type/priority enums, read check, user/time index, foreign keys | Synchronized |
| Stored Coach/Client assignment | `coachClients` | No current authority API; production relationship is derived from active bookings | Coach, Client, optional assigning user | Unique Coach/Client pair; primary flag check; foreign keys | Retained compatibility data; not an authorization source |
| Private Coach note | `coachNotes` | `coach.saveNote`, `CoachNote` types | Coach and Client | Private flag check; Coach/Client/time index; foreign keys | Write path synchronized; read UI/API remains an open P1 |
| Client health | `healthMeasurements` | Client-only measurement API, `HealthMeasurement` types | Subject and recorder are users | Scaled value ranges, at least one value, user/date index, foreign keys | Synchronized; units are documented in ORM |
| Audit event | `auditLogs` | `admin.auditLogs`, `AuditLog` types | Required actor, optional target user | Foreign keys and recent-event index | Synchronized |

All database foreign keys use `NO ACTION`. Historical booking, audit, health, notification, and legacy-service data is never deleted automatically. Product deletion flows must explicitly resolve dependents, and the existing room/Coach flows preserve referenced records.

## Migration and metadata audit

- The journal contains 17 ordered, unique entries, `0000` through `0016`, and every SQL file is journaled.
- `0007_bright_firestar.sql` is the one documented custom reconciliation migration without its own snapshot. Its tables were already represented in the `0002` metadata snapshot; the SQL uses `CREATE TABLE IF NOT EXISTS` to bring physical databases up to that recorded model. `0008` correctly continues from the `0006` snapshot ID.
- Migration `0004` created `coaches_gymId_gyms_id_fk`, but snapshots and ORM definitions had omitted it. The ORM and `0015` snapshot now record it. `0015` intentionally does not add it a second time.
- `0015_schema_integrity.sql` performs duplicate, domain, boolean, health-value, and orphan preflight checks before any constraint DDL. It then adds preservation-first foreign keys, database checks, unique keys, and query indexes.
- `0016_room_lifecycle_metadata.sql` additively introduces room deletion metadata and closure update metadata. Runtime writes and response types use the new fields.
- `pnpm db:validate:history` verifies SQL/journal equality, sequence and timestamp order, snapshot coverage, the documented custom migration, and that the latest migration does not remove legacy service storage.
- `drizzle-kit check` reports the metadata chain as valid.

Older migrations include irreversible operations: `0003` normalizes status/role values, `0004` backfills and temporarily requires Coach gym ownership, `0005` drops a uniqueness constraint, and `0012`/`0013` change nullability. They are appropriate for ordered forward migration but are not down migrations.

The SQL files are not designed to be executed directly twice. Exactly-once application is provided by `__drizzle_migrations`. MySQL DDL implicitly commits, so an infrastructure failure during constraint creation could leave partial DDL before the journal records completion. Do not blindly rerun SQL files; inspect `information_schema` or restore the pre-deploy backup.

## Legacy-service removal strategy

No table or column is dropped in this checkpoint. Current room-only and Coach booking writes persist `serviceTypeId = null`; runtime APIs neither request nor return a service selection.

A later removal requires separate confirmation and deployment:

1. Measure non-null `timeSlots.serviceTypeId` and `availabilityShifts.serviceTypeId` rows and export the legacy service catalog plus references.
2. Confirm the retention policy for historical service names/prices. If history must remain visible after catalog removal, first copy immutable service display snapshots into historical records.
3. Deploy code that no longer imports legacy service ORM relations or types while columns remain readable.
4. Back up and restore-test the target database.
5. Drop the two foreign keys, then the nullable columns, then `serviceTypes`, in a separately approved migration.
6. Verify historical schedules/reports and retain the export for the required retention period.

## Disposable MySQL 8.4 evidence

The test instance was named `coachora-phase3a-mysql`, bound only to `127.0.0.1:33307`, and stored `/var/lib/mysql` on tmpfs.

| Validation | Result |
| --- | --- |
| Empty database to latest | Passed: 15 application tables and 17 journaled migrations. |
| Current schema (`0014`) to latest | Passed with linked synthetic users, gym, room, Coach authorization, closure, notes, health, audit, notifications, two availability rows and two bookings. |
| Existing data preservation | Passed: two bookings, two availability rows, one notification, one legacy service/link, and one current service-free slot remained after migration. |
| Legacy and service-free data together | Passed: one non-null legacy service link and one null current link remained readable. |
| Invalid upgrade preflight | Passed: a duplicate Coach/Client pair raised SQLSTATE `45000`; 15 migrations and both rows remained, with no new uniqueness DDL applied. |
| Recovery after preflight failure | Passed: correcting only the synthetic duplicate and rerunning applied migrations 15 and 16, retained the valid row, and removed the temporary preflight procedure. |
| Foreign-key behavior | Passed: an orphan room insert was rejected with `ER_NO_REFERENCED_ROW_2`; deletion of a referenced Client was rejected with `ER_ROW_IS_REFERENCED_2`. |
| Unique/check/enum behavior | Passed: duplicate assignment, reversed room hours, and invalid status were rejected. |
| App startup | Passed against the upgraded disposable schema: Express listened on port 33123, `/api/health` and public tRPC `system.health` returned success, and SIGINT closed the HTTP/database process cleanly. This is not staging evidence. |

## Findings and release decisions

| Severity | Finding | Disposition |
| --- | --- | --- |
| P0 | The physical database had only one foreign key, leaving most relationships vulnerable to orphan records and allowing invalid domain values. | Fixed in `0015`; synthetic fresh/upgrade enforcement passed. |
| P0 | No staging database or real-data inventory is configured. Existing production-like data could fail `0015` preflight, and no pre-deploy backup/restore has been demonstrated for the real target. | **Open release blocker.** Run the preflight against a restored staging backup, remediate reported rows, take and restore-test a target backup, then deploy. The migration fails before new DDL when data is invalid. |
| P0 | MySQL forward DDL is not transactionally rollback-safe or directly rerunnable after a mid-DDL infrastructure failure. | **Open operational release blocker until deployment runbook/backup is exercised.** Restore the pre-deploy backup or have a DBA reconcile `information_schema`; never mark the journal complete manually without verification. |
| P0 | Atomic reschedule and production-like booking contention remain outside Phase 3A. | Open for Phase 4; current cancel-then-book behavior must not be advertised as atomic change. |
| P0 | Native OAuth exchange state is process-local. | Open from Phase 2; blocks horizontal multi-instance release. |
| P1 | Drizzle omitted the already-deployed `coaches.gymId` foreign key from ORM/snapshots. | Fixed without duplicate DDL. |
| P1 | One user could link to multiple Coach profiles and `coachClients` allowed duplicates. | Fixed with nullable-user uniqueness and Coach/Client pair uniqueness; invalid-upgrade behavior tested. |
| P1 | Room deletion and closure edits lacked lifecycle/update metadata. | Fixed additively in `0016` and runtime writes. |
| P1 | Scheduler/supporting reads lacked notification, health, audit, Coach-note, and Coach-list indexes. | Fixed with indexes matching current filters/order. |
| P1 | `coachNotes` has a protected write API but no protected read procedure or rendered notes history. | **Open before declaring Coach Client-information workflow complete.** Add an ownership-scoped read contract/UI in an approved application phase. |
| P1 | Legacy service storage remains even though booking runtime is service-free. | Deliberately retained per instruction; removal strategy above requires confirmation. |
| P1 | Partial-day closures cannot be represented; closure is one full gym-local date. | Not a current schema mismatch because the approved rule is full-day closure. Add start/end instants only if product scope changes. |
| P2 | `availabilityShifts.memberUserId`/`bookingId` and `coachClients` are retained compatibility fields/tables but are not current authorization authorities. | Documented and protected by foreign keys; review during later legacy cleanup. |
| P2 | `availabilityShifts.location` and `timeSlots.room` duplicate room names. | Deliberate immutable historical display snapshots; do not rewrite on room rename. |

## Deployment recovery requirements

Before applying to any non-disposable database: stop writes or enter maintenance mode; take a consistent backup; restore that backup into staging; run the full migration and application smoke test; record pre/post table counts and orphan queries; then deploy. If the preflight raises SQLSTATE `45000`, fix or explicitly migrate the named data issue and retry. If the process fails after constraint DDL begins, restore the backup or reconcile the exact constraints/indexes with a DBA before rerunning the migration runner.

This report does not certify production data, staging, booking concurrency, or browser E2E behavior.
