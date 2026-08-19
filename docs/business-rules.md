# Phase 2 business rules and source ownership

Phase 2 checkpoint scope: authoritative source-of-truth convergence and business-rule correctness. MySQL through the role-scoped tRPC API is the only production authority for rooms, closures, availability, bookings, schedules, notifications, profiles, and health measurements. The Expo app, web Preview, and PWA use the same contracts. API failure produces loading, empty, offline, or error presentation; it never switches to seeded booking state.

No migration or database command was run in this phase. There is no configured or verified staging target in this repository. Browser automation is not installed, so this phase does not claim screenshots, authenticated E2E, database-backed integration, migration, or concurrency certification.

## Data ownership

| Data | Authoritative owner | Read/write boundary |
| --- | --- | --- |
| Identity and role | `users` plus verified Coach authorization | The server reloads the persisted user for each authenticated request. Google accounts can be Client or authorized Coach; Admin remains a protected local-account role. |
| Rooms and closures | `gymRooms`, `roomClosures`, and the room's `gyms.timezone` | Admin-only mutation; authenticated role-appropriate schedule reads. |
| Coach availability | `availabilityShifts` | Owning active/authorized Coach or Admin. New and edited windows must identify a room and never require a service. |
| Bookings and session intervals | `bookings` plus `timeSlots` | Client creates room-only or Coach bookings and can cancel only their own; owning Coach/Admin can operate only the permitted attendance/cancellation path. |
| Client health | `healthMeasurements` | The Client account only. |
| Notifications | `notifications` | Recipient-scoped reads and updates. |
| Audit history | `auditLogs` | Admin read; server-side business mutations write. |

## Final role rules

Admin can create/edit rooms, change capacity/hours/active state, manage dated closures, preview affected future room-only and Coach bookings, manage Coach authorization, and view users/schedules/reports/audit logs. Closure, deactivation, and deletion require a fresh affected-booking preview and exact confirmation. Existing bookings are preserved. A referenced room is soft-deleted by becoming inactive; only an unused room is hard-deleted after typed confirmation.

Coach can publish and edit room/date/start/end/capacity availability, block/reopen/cancel it, view room status and their own bookings, and see participating Clients only through active Coach-booking relationships. Publication and edits re-read active authorization, lock authoritative records, reject incompatible Coach overlap, and validate the full room interval. Coach cannot manage rooms or roles.

Client can discover published Coach availability, book a Coach directly, book room-only access, and view/cancel/check in to only their own bookings. Client profile and health records are object-scoped to the authenticated account. No booking flow accepts or returns a runtime service selection.

Locked bottom navigation remains:

- Client: Home, Schedule, History, Profile
- Coach: Today, Schedule, Clients, Profile
- Admin: Overview, Rooms, Coaches, Reports

Client Book remains hidden and reachable from Home. Coach availability remains reachable through Today/Schedule. No Book or Availability tab was added, and the approved logo was not changed.

## Room and time rules

All roles use `shared/room-interval-eligibility.ts`. The overlap predicate is `existingStart < requestedEnd && existingEnd > requestedStart`; adjacent intervals do not overlap. Occupancy is peak concurrent occupancy in the requested interval, not the number of bookings in a calendar day. Both room-only and Coach booking time slots count toward room capacity.

Eligibility returns status/reason, gym-timezone opening hours, closure start/end/reason, current occupancy, maximum and remaining capacity, and next available time when derivable from the loaded interval set. Inactive, closed, and otherwise unavailable rooms stay visible and are disabled with their reason.

Gym-local wall clocks and calendar bounds are converted with the configured `gyms.timezone`; timestamps are persisted/read as UTC (`mysql2` is configured with `timezone: "Z"`). DST-short and DST-long days are not assumed to be 24 hours, nonexistent local times are rejected, and the calculation does not use the server process timezone.

Authenticated tRPC responses use `Cache-Control: private, no-store`; the service worker bypasses `/api/` and cannot replay stale booking or health data. Relevant Client, Coach, Admin, discovery, room, and capacity queries are invalidated after room, closure, availability, booking, cancellation, and Coach-access changes.

## Phase 2 findings and disposition

| Severity | Finding | Disposition |
| --- | --- | --- |
| P0 | Production screens and `/coach` could read/mutate AsyncStorage or process-global seeded snapshots, creating a second booking authority. | Fixed. Provider/store wiring, seeded stores, legacy preview calendar helpers, and the unused server store were removed; History and Coach surfaces now use role-scoped tRPC data. |
| P0 | Room-day and closure calculations depended on the server process timezone. | Fixed in runtime logic with explicit gym-timezone conversion and UTC pool configuration; cross-process-timezone and DST tests were added. |
| P0 | Room fullness was derived from whole-day booking counts, which could reject disjoint intervals and miss the authoritative overlap rule. | Fixed with one shared sweep-line interval evaluator used by preview and mutations. |
| P0 | Room closure and deletion cancelled future Coach bookings, contrary to the preservation rule; deactivation did not preview every affected booking. | Fixed. Admin now previews room-only and Coach bookings, explicitly confirms the current ID set, preserves bookings, and retains conflicts for manual resolution/audit. |
| P0 | Coach deletion cancelled future bookings, and direct booking did not revalidate Coach authorization after locking availability. | Fixed. Coach access removal preserves bookings, and booking re-reads active authorization before insert. |
| P0 | Native OAuth one-time exchange codes remain in a process-local `Map`. Multi-instance deployment could route exchange to a different instance. | **Open release blocker.** Move exchange codes to a shared short-lived atomic store and staging-test single-use behavior before horizontal scaling. |
| P0 | There is no atomic Client reschedule/change procedure. Cancellation and a new booking are separate operations and cannot safely promise an all-or-nothing change under contention. | **Open release blocker for a product promise of direct “change booking.”** Implement and database-test an atomic reschedule in the Phase 4 concurrency checkpoint; current UI supports own cancellation followed by a new booking. |
| P0 | No configured staging environment, authenticated browser runner, or disposable MySQL test target exists. | **Verification blocker, not code-certified here.** Database-backed concurrency, authenticated E2E, screenshots, and deployed PWA/App synchronization remain unverified. |
| P1 | Closure storage represents one full gym-local date, not arbitrary start/end periods. | Runtime now returns exact full-day UTC boundaries and reason. Add period columns/constraints in Phase 3 before supporting partial-day closures. |
| P1 | Some relational integrity is enforced only by application code because most booking/room/availability columns lack database foreign keys. | Phase 3 schema work; audit orphan data before adding constraints. |
| P1 | Referenced rooms have only an `active` flag, not a dedicated deletion timestamp/status. | Runtime soft deletion is safe but semantically coarse. Add `deletedAt`/lifecycle metadata in Phase 3. |
| P2 | Historical display names are duplicated in `availabilityShifts.location` and `timeSlots.room`; a room rename does not rewrite historical labels. | Preserve history now; define immutable snapshot/display semantics in Phase 3. |

## Phase 3 schema requirements

- P1: Remove legacy `serviceTypes`, `serviceTypeId` columns, and ORM relations only after auditing existing data and deploying an ordered migration. Phase 2 continues writing `null` solely for schema compatibility.
- P1: Add and validate foreign keys for room, closure, availability, time-slot, booking, member, Coach, creator/updater, and notification relationships.
- P1: Add partial-day closure start/end timestamps and constraints if the product requires closure periods shorter than a gym-local day.
- P1: Add explicit room soft-deletion lifecycle fields and indexes.
- P1: Evaluate uniqueness/idempotency constraints for semantically duplicate Client interval bookings before Phase 4 transaction/load certification.

## Verification completed

The Phase 2 gate runs TypeScript typecheck, Expo ESLint, the full Vitest suite, and the production web/server build. Unit/source-contract coverage includes authoritative production paths, absence of demo fallback, service-independent Coach/room booking contracts, published discovery, room statuses and overlap concurrency, closure preview/preservation, deactivation preservation, cache invalidation, timezone invariance/DST, role middleware, object-scope source contracts, locked navigation, and English/Vietnamese messages.
