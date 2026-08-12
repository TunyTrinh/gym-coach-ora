# GymFlow Spectrum Redesign

## Product Direction

GymFlow is **simplicity-first**. A member should understand the next action without studying the screen, a coach should publish free time without filling out a scheduling form, and every screen should have one obvious primary action. The dark Spectrum visual language is secondary: it marks important decisions without competing with them. Gradient surfaces are reserved for the next session, the primary action, and confirmation; routine information stays calm, high contrast, and short.

The app remains optimized for portrait 9:16 use and one-handed operation. Required choices stay visible, secondary details move into detail pages or a clearly labelled **More options** section, and technical wording is replaced with plain language. Clients never see staff controls, and coaches never see client booking controls. Controls use large hit areas, readable type, and immediate pressed, loading, success, error, and permission states in line with Apple Human Interface Guidelines.

## Member-First Information Architecture

The primary member navigation is intentionally limited to **Home, Schedule, Book, Progress, and Profile**. This preserves immediate access to the five actions members perform most often: orienting to the next session, reviewing commitments, booking time, checking personal progress, and managing account settings. Attendance history remains available as a secondary destination from Profile so it is retained without competing with routine actions. Notifications remain available from the persistent Home header, which keeps important gym updates one tap away without introducing another primary tab.

| Destination | Member purpose | Information shown first | Content progressively disclosed |
|---|---|---|---|
| Home | Decide the next action in seconds | Greeting, next booked session or an empty-state prompt, one prominent booking action, today/upcoming count, health-summary signal | Notifications, membership details, gym announcements, and attendance history are reached only when requested. |
| Schedule | Review and manage commitments | Compact month calendar, session count, selected-day agenda | Check-in eligibility, cancellation controls, coach details, and other months appear after a day or session is selected. |
| Book | Find and reserve a suitable session | Step 1 date rail anchored to the local device clock | Step 2 optional service/coach refinement follows date selection; Step 3 shows only valid upcoming slots, followed by the existing confirmation sheet. |
| Progress | Understand personal body-measurement change | Latest selected metric, previous comparison, focused trend chart, add-check-in action | Other metrics and dated measurement history are available on demand, while privacy guidance remains quiet and contextual. |
| Profile | Manage the membership and discover secondary tools | Membership state, preferences, install/account actions | Attendance History, role preview, and self-hosted Google sign-in remain available as secondary actions. |

The design uses a single strong decision on each screen. Home has one primary action: **Book a session** for clients, **Add availability** for coaches, and **Open operations** for admins. Client booking is reduced to three screens: **1) choose a day, 2) choose a time, 3) confirm**. Coach publishing exposes only four required choices: **service, date, start time, and end time**; location, repeat, duration override, break, and note live under **More options**. Schedule, Progress, Profile, History, and Notifications show the essential summary first and reveal detail only after the user asks for it.

## Interaction and Motion Principles

The Spectrum gradient continues to mark high-value moments only: the next session, the main booking action, and the selected health signal. Routine cards remain dark and calm. Taps receive a modest opacity response and, where motion is permitted, a brief 0.97 scale response. Native primary actions may trigger light haptic feedback. When the operating system requests reduced motion, scale and entry-motion effects are removed while color, semantic status, loading labels, and disabled states continue to communicate outcome.

Every action should resolve visibly. Booking keeps the existing confirmation and error messages, calendar changes update the selected-day agenda immediately, and measurement saving closes only after a successful persisted save. Cancellation, check-in, authentication, notification, capacity, and locally time-aware availability rules remain unchanged.

## Screen List and Content

| Screen | Primary content | Spectrum treatment and function |
|---|---|---|
| Home | Next booking, one booking call to action, today/upcoming summary, compact health signal, notifications entry | Dark dashboard with one Spectrum next-session card and quiet action/support surfaces. Announcements and membership details move behind notification and profile actions. |
| Book | Ordered date selection, optional service/coach refinement, real-time upcoming availability, confirmation sheet | Time-aware scheduler starts on the device’s current local day, exposes a clear **Today** control, hides elapsed slots, and presents optional filters only after the member has chosen a day. |
| My Schedule | Month calendar, booked-day indicators, selected-day sessions, check-in and cancellation controls | A compact Spectrum calendar lets members scan multiple bookings at once, jump to Today, and reveal management controls only for a selected booked session. |
| Health Progress | Latest metric, previous comparison, trend chart, check-in action, on-demand detailed history | Private, local-first data uses a focused metric picker and pink-to-violet progress line, with full dated measurements available separately from the immediate summary. |
| History | Attendance records and activity summary | A retained secondary destination entered from Profile, with high-contrast filters and quiet historical cards. |
| Profile | Membership, preferences, PWA install guidance, role preview | Elevated settings surfaces with a compact Spectrum membership treatment. |
| Notifications | Booking reminders, announcements, membership messages | Unread notifications receive a subtle violet-to-blue edge state, retaining existing deep links. |
| Coach / Admin | Upcoming coach sessions, attendees, attendance controls | Spectrum staff summary card with semantic attendance actions and protected role behavior. |

## Local-Time Scheduler Interaction

The scheduler uses the **device’s local time** as its current clock. It derives a seven-day date rail from local midnight, initializes selection to today, and updates its now value on an interval so that a slot naturally becomes unavailable when its start time passes. A user may jump back to the current day with **Today** after browsing forward. Sessions that started in the past are never presented as bookable; existing booking, capacity, overlap, and cancellation validations remain unchanged.

## Coach Availability and Free Shifts

Coach accounts receive a dedicated **Availability** tab in place of the member booking tab. The default view has one primary action, **Add availability**, followed by a short list of future shifts. Counts, status filters, coach switching, and release controls are secondary; Admin-only controls are hidden from Coaches. The add sheet asks for only **Service**, **Date**, **Starts**, and **Ends**. A clearly labelled **More options** disclosure contains location, repeat, duration override, break, and note. Clients see only Available shifts and never see blocked, cancelled, private-note, or administrative information.

| Role | What the role can see | What the role can change |
|---|---|---|
| Client | Only future `Available` coach shifts, grouped by coach and local date; no private notes or blocked periods | Confirm one available shift after the existing booking checks pass. |
| Coach | Their own Available, Booked, Blocked, Completed, Cancelled, and Expired shifts, with private notes | Create one or recurring shifts, block a period, edit or delete a future unbooked shift, and decide whether a cancelled booking should be re-opened or remain blocked. |
| Admin | All coaches’ shifts, including status, actor trail, and filters | Create, edit, block, remove, and review future shifts for any coach; configure policy defaults in the protected backend. |

An availability shift is an explicit, coach-owned record with a start and end time, service type, location, optional note, and status. It may generate a matching bookable slot for the existing scheduler, but a booking retains a reference to the originating availability shift. Status uses labels as well as subtle semantic color: **Available**, **Booked**, **Blocked**, **Completed**, **Cancelled**, and **Expired**. Past available shifts naturally read as Expired and are never returned as bookable.

Creating multiple shifts happens in a review-first sheet. The coach supplies a date or range, start/end time, duration of 30/45/60/90 minutes, optional break, weekdays, recurrence end, location, session type, and note. The UI previews each generated interval before submission. Server validation rejects invalid intervals, past time, overlap with another managed shift, and conflicts with existing booked or blocked time. The server creates shifts in a transaction and records the actor in the audit log.

The client booking journey becomes **coach → locally dated availability → specific shift → confirmation**. The confirmation sheet names the coach, date, start/end, location, and service. Immediately before confirmation, the server atomically changes the selected shift from `Available` to `Booked`, creates the booking that references it, and records both member and booking IDs. An affected-row check and the one-booking-per-shift constraint prevent two clients from reserving the same time. When a member cancels, the booking is retained as `Cancelled`, both parties receive a notification, and the associated shift is held as `Cancelled` until the coach chooses **Re-open** or **Keep blocked**.

## Key User Flows

| Flow | Steps |
|---|---|
| Book a session | Open Book → Step 1: select a locally dated day or tap Today → Step 2: optionally refine by service or coach → Step 3: choose an upcoming open slot → review the Spectrum confirmation sheet → confirm booking → receive existing schedule and notification updates. |
| Check in | Open My Schedule near the session start → use Check in when the existing 30-minute window permits it → receive the current success message and stored attendance timestamp. |
| Staff attendance | Switch to the existing coach/admin preview → open Coach view → mark attendee Completed or No-show → retain current booking state behavior. |
| Review the month | Open My Schedule → use previous/next month or Today → tap a day with a booking signal → review all sessions for the selected day → use the existing check-in or cancellation action where available. |
| Record progress | Open Progress from the primary tab or Home summary → review the latest selected metric and its change from the previous check-in → change the metric or open detailed history as needed → select Add measurement → enter any available fields from weight, body fat, chest, waist, hips, arms, and thighs → save with the device-local date. |
| Create coach availability | Sign in as a Coach → Availability → Add availability → choose Service, Date, Starts, and Ends → optionally open More options → publish → see the new shift in the short list. |
| Book a coach shift | Open Book as a Client → choose a day → choose one Available time with the coach and service shown → confirm on the final screen → receive the existing booking and notification updates. |
| Release a cancelled shift | Client cancels within the existing policy → booking remains in history as Cancelled and the shift is held → coach opens shift details → choose Re-open or Keep blocked → both client and coach receive the existing semantic feedback. |

## Color and Surface Tokens

| Token | Value | Use |
|---|---:|---|
| Background | `#0D0D0F` | Primary dark canvas |
| Elevated background | `#151518` | Navigation and modal layers |
| Surface | `#1D1D21` | Cards and date tiles |
| Surface hover / active | `#26262B` / `#303036` | Pressed and selected support states |
| Text | `#F7F7F8` / `#B4B4BD` / `#777780` | Primary, secondary, and muted hierarchy |
| Spectrum | Pink → coral → orange → violet → blue | Gradient-only identity and primary emphasis |
| Semantic | Success `#32D77B`, warning `#FFBD2E`, danger `#FF453A` | Capacity, attendance, and cancellation states |

The primary Spectrum gradient is `linear-gradient(135deg, #E53F87 0%, #ED5F68 25%, #D87870 45%, #9660BD 70%, #5266E6 100%)`. It is reproduced in the native UI as a reusable SVG gradient, not as a copied third-party asset.
