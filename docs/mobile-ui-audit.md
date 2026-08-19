# Phase 3B — Professional mobile UI/UX audit

## Scope and environment

This audit ran only against a disposable local MySQL 8.4 database seeded with synthetic Client, Coach, Admin, room, availability, booking, notification, health, authorization, note, and closure data. No staging configuration was found and no production system or production data was used.

The rendered audit used Playwright Chromium 151.0.7922.34 against a production Expo web export at 320, 360, 390, 430, and 768 CSS pixels. A separate 844×390 landscape pass was also run. This certifies the responsive web/PWA rendering exercised here; it does not certify an installed iOS/Android build, physical-device safe-area behavior, a native virtual keyboard, or platform screen readers.

## Screen inventory

| Role | Rendered screens and workflows | Result |
| --- | --- | --- |
| Signed out | Google sign-in and protected local Admin sign-in entry | Passed at all five widths |
| Client | Home, room/Coach booking, Schedule, cancellation dialog, History, health progress, Profile, notifications | Passed at all five widths; cancellation dialog interaction captured |
| Coach | Today, room-status Schedule, booked Clients, Client information, private note read/write, availability, Profile | Passed at all five widths; note write/read interaction verified |
| Admin | Overview, Rooms, opening hours, closures, affected-booking controls, Coach authorization, Reports/audit log, availability oversight, booking calendar | Passed at all five widths |

The locked bottom navigation remains unchanged:

- Client: Home, Schedule, History, Profile
- Coach: Today, Schedule, Clients, Profile
- Admin: Overview, Rooms, Coaches, Reports

No Book or Availability tab was introduced, and the approved Coachora logo asset was not modified.

## Findings and disposition

| Severity | Finding | Disposition |
| --- | --- | --- |
| P0 | The Coach Clients tab rendered an unrelated availability call-to-action, so Coaches could not view booked Clients or Client information. | Fixed. The tab now lists only Clients with a pending/confirmed relationship and opens Client information. |
| P0 | Private Coach notes were write-only in the API/UI. A safe read path was missing. | Fixed. Added a relationship-scoped notes query using the same active-booking authorization guard as note writes; rendered read/write recovery was verified. |
| P1 | Feedback/confirmation dialogs in Rooms, Admin, and Schedule used separate modal foundations and some were positioned relative to bottom-sheet styling. | Fixed through the shared viewport-owned `CenteredDialog`; the cancellation result is captured in rendered evidence. Actual forms and pickers remain intentional bottom sheets. |
| P1 | Every audited page lacked a document title; the Admin closure-reason input lacked an accessible name. | Fixed. The global web title is `Coachora`, and audited form fields now expose labels. |
| P1 | Baseline axe testing found contrast failures in tabs, buttons, status badges, inactive calendar dates, and one avatar. | Fixed. The final 95-page axe WCAG A/AA pass has zero violations. |
| P1 | Many recurring controls were below the approximately 44×44 target, including header icons, calendar navigation, notification actions, history segments, room actions, and Coach/Admin actions. | Fixed where layout permits. The geometric detector fell from 523 to the final count recorded below. |
| P1 | The Preview debug switcher could overlap bottom navigation when enabled. | Fixed by docking it above the locked navigation region and enlarging its trigger. |
| P2 | Seven-column calendars necessarily render some geometric cell widths below 44 px at the narrowest viewport. | Remaining responsive-layout exception. Cells remain at least 32 px wide, are vertically enlarged where possible, have spacing/clear state, and pass automated WCAG A/AA checks. A horizontal calendar redesign was intentionally not introduced in this consistency pass. |
| P2 | Native virtual-keyboard resizing, notch safe areas, Dynamic Type/large-text scaling, VoiceOver/TalkBack, and installed-PWA behavior cannot be certified by desktop Chromium emulation. | Blocked by available device tooling; requires physical or simulator/device follow-up. |

## Automated results

| Measurement | Before | After |
| --- | ---: | ---: |
| Role/screen/width renders | 95 | 95 |
| Pages with document overflow | 0 | 0 |
| Pages with a sub-44 geometric target | 62 | 9 |
| Geometric sub-44 instances | 523 | 308 |
| Pages with axe violations | 95 | 0 |
| Axe violation records | 180 | 0 |
| Axe affected nodes | 455 | 0 |
| Unexpected page exceptions | 0 | 0 |

The five signed-out network records are the expected `401 GET /api/auth/me` session probe at each width, not application failures. Authenticated pages had no failed requests or console/page exceptions. The landscape Client booking pass had no overflow, unlabeled control, or sub-44 target.

The final audit also passed a delayed Coach Clients request with visible loading feedback and recovery, an interrupted request with visible error and successful retry, and offline state on an already loaded Client app. Results are stored under `stateChecks` in the after report.

## Evidence

- Baseline report: [`ui-audit-evidence/before/report.json`](ui-audit-evidence/before/report.json)
- Final report: [`ui-audit-evidence/after/report.json`](ui-audit-evidence/after/report.json)
- Baseline Coach Clients failure: [`ui-audit-evidence/before/coach-clients-390.png`](ui-audit-evidence/before/coach-clients-390.png)
- Corrected Coach Clients list: [`ui-audit-evidence/after/coach-clients-390.png`](ui-audit-evidence/after/coach-clients-390.png)
- Client information/private notes: [`ui-audit-evidence/after/coach-client-information-notes-390.png`](ui-audit-evidence/after/coach-client-information-notes-390.png)
- Centered cancellation dialog: [`ui-audit-evidence/after/client-cancellation-dialog-centered-390.png`](ui-audit-evidence/after/client-cancellation-dialog-centered-390.png)
- Landscape booking: [`ui-audit-evidence/after/client-book-landscape-844x390.png`](ui-audit-evidence/after/client-book-landscape-844x390.png)

The evidence directories also contain a representative 390 px screenshot of every audited authenticated screen and the signed-out screen at every requested width.
