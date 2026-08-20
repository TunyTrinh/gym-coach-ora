# Preview and Public PWA Parity Audit — 2026-08-19

## Initial Runtime Inventory

| Surface | Observation | Evidence |
|---|---|---|
| Local audited workspace API | Available | `GET http://127.0.0.1:3000/api/health` returned HTTP 200 after the project-managed signing-secret correction. |
| Direct Preview URL from earlier deployment metadata | Unavailable in My Browser | `https://8081-in00c1z1x68hw3q45nbr6-51292775.sg1.manus.computer` returned the Manus Sandbox unavailable page in the connected browser. This host-level result must not be treated as the active managed Preview artifact. |
| Active managed Preview | Available | The managed Preview capture from the current workspace rendered the Coachora sign-in screen at 390×844, including Google sign-in and protected-account entry. |
| Public PWA | Available | Public `/`, `/api/health`, `/release.json`, `/sw.js`, and `/manifest.json` each returned HTTP 200. |
| Source under audit | Local only | Current branch is `deploy-audit-program` at local commit `a6bab49`, with signing-secret and test changes intentionally uncommitted. No push or checkpoint publication is authorized. |

## Audit Guardrails

The audit will preserve room, booking, gym, user, Coach, availability, and migration data. It will not publish a checkpoint, push to GitHub, apply production migrations, reset data, or make a destructive schema change without explicit approval.

## Confirmed Release and API Findings

| Area | Preview/workspace state | Public PWA state | Parity assessment |
|---|---|---|---|
| Source branch | Local `deploy-audit-program` at `a6bab49`, with additional uncommitted signing-secret safety changes | Served release descriptor reports `da44ad2e76fb00f8b049` and `sourceRevision: local` | **Different release artifacts.** The public PWA predates the current tested workspace export. |
| Web entry bundle | Current local export references `entry-bfd06bd809842f70e68547c4d586bf58.js` | Public root references `entry-1cf4da59b63ae09349e5992c78caa6a1.js` | **Different release artifacts.** |
| Application API | Local `/api/health` returned 200 | Public `/api/health` returned 200 | Both routes are healthy. |
| Shared signed-out API contract | Local and public `auth.me` tRPC requests returned HTTP 200 with byte-identical response bodies when no cookie was supplied | Same | Shared API contract remains aligned for the tested signed-out call. |
| Web API-origin rule | One shared resolver uses the paired Preview API host only on managed `8081-*.manus.computer` hosts; non-Preview web hosts use same-origin APIs | Public health and tRPC calls succeed on the public origin | Intentional environment-specific network boundary, not duplicate business logic. |
| Service worker | Current source uses a single release-namespaced cache, `skipWaiting`, `clients.claim`, `updateViaCache: none`, and network-first handling for navigation and cacheable assets | Public `sw.js` uses cache `coachora-shell-da44ad2e76fb00f8b049` | Cache mechanism is versioned and release-aware; the public bundle is old because it has not been promoted from the current workspace, not because it retained the same cache name. |
| Release-critical cache headers | Current server marks HTML, `sw.js`, `manifest.json`, and `release.json` as no-store/no-cache in production code | Public `release.json` returned `Cache-Control: no-cache, no-store, must-revalidate` | Release metadata caching is correctly configured. |
| Schema journal | Source journal has 17 entries through `0016_room_lifecycle_metadata` | Preserved database has 14 recorded applied migrations and lacks the additive lifecycle columns | The shared source/schema migration path is versioned, but production migration promotion remains intentionally pending explicit approval. |

## Preliminary Root Cause

The evidence does not show two active implementations of Coachora. The remaining user-visible difference is primarily a **release-promotion gap**: the managed Preview runs the current workspace source, while the public domain is still serving an earlier stamped PWA artifact. The old public release descriptor does not expose a Git revision because the prior deployment had no Git metadata, so its `sourceRevision` is `local`.

## Safe Consolidation Applied Locally

The shared release-stamping script now emits a truthful `sourceRevision` in all cases: an explicitly supplied revision when available, a Git commit only when the working tree is clean, and otherwise `artifact:<artifactFingerprint>`. This preserves the same single export path for Preview and public PWA while preventing a manifest from claiming an unverifiable `local` revision. The freshly validated local export reports release `0d9e7aaa612009abf7af` with source revision `artifact:0d9e7aaa612009abf7af`.

Validation completed locally: static type check and lint passed; 43 test files and 130 tests passed with one expected environment-dependent integration skip; and `pnpm build:web` completed successfully with the stamped PWA artifact. No public promotion, GitHub push, production migration, or production data change was performed.

## Cross-Surface Validation Boundary

The active managed Preview renders the current Coachora sign-in flow from the tested workspace. The public PWA health endpoint, release descriptor, manifest, service worker, and signed-out `auth.me` API contract remain available and valid, but its root document still points to the older `entry-1cf4da59b63ae09349e5992c78caa6a1.js` artifact. Consequently, one newly consolidated feature cannot honestly be claimed to appear on both surfaces until the user authorizes promotion of the tested `0d9e7aaa612009abf7af` export.
