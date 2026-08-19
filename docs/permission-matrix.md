# Phase 1 Permission Matrix

This matrix is the backend authorization contract. Frontend visibility is not an authorization boundary. Role gates live in `server/_core/trpc.ts`; ownership and relationship checks remain next to the database operation in `server/routers.ts`.

| Endpoint or action | Client | Coach | Admin | Required object-level check |
| --- | --- | --- | --- | --- |
| `auth.me`, `auth.logout`, `/api/auth/me`, `/api/auth/logout` | Own session | Own session | Own session | Session signature, expiry, issuer, audience, application ID, and current persisted account state |
| `/api/auth/google*` | Verified Google identity | Verified Google identity plus active Admin authorization | Not an Admin login path | OAuth state, verified Google email, allowlisted native callback, single-use native exchange code |
| `/api/auth/local/login` | Deny | Deny | Allow | Persisted local account must already have Admin role; rate limited |
| `member.schedule`, health measurements | Own only | Deny | Deny | `memberUserId` or `userId` equals the authenticated user |
| Member notifications | Own only | Own only | Own only | `notifications.userId` equals the authenticated user |
| `catalog.coaches` | Read active | Read active | Read active | Active Coach records only |
| `admin.listUsers`, `admin.auditLogs` | Deny | Deny | Allow | Returns persisted MySQL users without password hashes; audit list has a bounded page size |
| Admin room, closure, Coach-account procedures | Deny | Deny | Allow | Target exists; destructive/conflicting booking rules are handled in later approved phases |
| `coach.clients` | Deny | Allow related | Allow all active relationships | Client must have a pending or confirmed booking through that Coach's availability |
| `coach.saveNote` | Deny | Allow related | Allow for selected Coach | Selected Coach and Client must have a pending or confirmed booking relationship |
| Availability room calendar/schedule | Read public operational fields | Read relevant operational fields | Read plus diagnostics | Diagnostics are Admin-only; no private Client fields |
| Availability room choices, own availability, publish/block/reopen | Deny | Own Coach authorization only | Allow; Coach filter optional for list views | Coach account active; mutation target belongs to Coach unless Admin; room eligibility checks |
| Bookable availability and capacity preview | Allow | Deny | Deny | Only eligible active availability/rooms are returned |
| Coach or room booking | Own booking | Deny | Deny | Authenticated Client becomes `memberUserId`; availability/room/capacity validation |
| Cancel booking | Own | Own Coach-led booking | Any | Booking owner, availability owner, or Admin; active status required |
| Check-in | Own booking | Deny | Deny | Booking owner only |
| Attendance | Deny | Own Coach-led booking | Any | Availability belongs to Coach unless Admin |
| Admin availability list and audit/report data | Deny | Deny | Allow | Optional filters must not be required to establish Admin access |
| Legacy `gym.*` process-global demo API | Disabled | Disabled | Disabled | Not registered in the production tRPC router |
| `/manus-storage/*` arbitrary storage proxy | Disabled | Disabled | Disabled | Not registered; no ownership model existed |
| Preview account switching | Deny | Deny | Development-preview Admin only | Non-production managed-preview host plus authenticated Admin control session |

## Phase 1 security findings

| Severity | Finding | Phase 1 disposition |
| --- | --- | --- |
| P0 | Missing/weak `JWT_SECRET` could permit insecure signing, and JWT verification omitted issuer, audience, and exact application ID. | Fixed; startup and token operations fail closed, and all required claims are verified. |
| P0 | Native builds invoked Google sign-in but the mobile exchange endpoint returned `410`; the legacy callback also accepted session tokens in URLs. | Fixed; native uses an allowlisted deep link and a two-minute, single-use opaque exchange code. Tokens are returned only in the HTTPS response body and stored in SecureStore. |
| P0 | Externally reachable `gym.*` routes used process-global demo state rather than MySQL. | Fixed by removing the namespace from the production router. |
| P0 | The public storage proxy had no authentication or object-ownership policy. | Contained by removing route registration; the unused implementation remains for Phase 5 cleanup. |
| P0 | Static Coach/Client assignments could expose sensitive Client identity without an active booking relationship. | Fixed for Coach client listing and notes by requiring pending/confirmed Coach-led bookings. |
| P0 | A persisted Google account with an Admin role could retain Admin access through Google sign-in. | Fixed; Google sync can assign only Client or pre-authorized Coach, and session authentication rejects non-local Admin accounts. |
| P1 | Role enforcement was repeated inline, increasing drift and inconsistent error behavior. | Core Client, Coach-or-Admin, and Admin operations now use centralized middleware; object checks remain query-bound. |
| P1 | Authentication utilities logged token prefixes and private user objects. | Fixed; sensitive debug output was removed. |

## Deliberate Phase 1 boundary

This phase does not certify database constraints, transactional correctness, migrations, concurrency, or deployed OAuth behavior. The native one-time exchange registry is process-local and therefore suitable only for the repository's current single application instance. A shared short-lived store is required before horizontal scaling; until that is implemented and staging-tested, multi-instance native OAuth is a **P0 release blocker**.
