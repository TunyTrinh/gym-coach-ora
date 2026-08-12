# GymFlow Spectrum Redesign

## Product Direction

GymFlow will retain its mobile-first, one-handed booking experience while moving to an original **dark Spectrum** visual language. The design combines a near-black canvas with selectively applied pink, coral, orange, violet, and electric-blue energy. Gradient surfaces are reserved for decisive moments—booking, upcoming sessions, and staff focus—while routine information remains calm, high contrast, and fast to scan during a workout.

The app remains optimized for portrait 9:16 use. Tabs, confirmation actions, cancellation controls, and date selection all stay within comfortable thumb reach. Controls use large hit areas, readable type, compact secondary information, and immediate pressed or disabled states in line with Apple Human Interface Guidelines.

## Screen List and Content

| Screen | Primary content | Spectrum treatment and function |
|---|---|---|
| Home | Next booking, attendance progress, gym announcements, membership | Dark dashboard with a Spectrum next-session card and a quiet ambient glow behind key actions. |
| Book | Service and coach filters, date rail, real-time availability, confirmation sheet | Time-aware scheduler starts on the device’s current local day, exposes a clear **Today** control, and removes elapsed slots from booking. |
| My Schedule | Month calendar, booked-day indicators, selected-day sessions, check-in and cancellation controls | A compact Spectrum calendar lets members scan multiple bookings at once, jump to Today, and see session details in a single selected-day summary. |
| Health Progress | Dated measurement entries, current/previous comparison, deltas, and trend chart | Private, local-first data is displayed through a calm dark measurement dashboard with a focused metric picker and pink-to-violet progress line. |
| History | Attendance records, activity summary, and Health Progress entry point | High-contrast filters and quiet, compact historical cards. |
| Profile | Membership, preferences, PWA install guidance, role preview | Elevated settings surfaces with a compact Spectrum membership treatment. |
| Notifications | Booking reminders, announcements, membership messages | Unread notifications receive a subtle violet-to-blue edge state, retaining existing deep links. |
| Coach / Admin | Upcoming coach sessions, attendees, attendance controls | Spectrum staff summary card with semantic attendance actions and protected role behavior. |

## Local-Time Scheduler Interaction

The scheduler uses the **device’s local time** as its current clock. It derives a seven-day date rail from local midnight, initializes selection to today, and updates its now value on an interval so that a slot naturally becomes unavailable when its start time passes. A user may jump back to the current day with **Today** after browsing forward. Sessions that started in the past are never presented as bookable; existing booking, capacity, overlap, and cancellation validations remain unchanged.

## Key User Flows

| Flow | Steps |
|---|---|
| Book a session | Open Book → filter service or coach → select a locally dated day or tap Today → choose an upcoming open slot → review the Spectrum confirmation sheet → confirm booking → receive existing schedule and notification updates. |
| Check in | Open My Schedule near the session start → use Check in when the existing 30-minute window permits it → receive the current success message and stored attendance timestamp. |
| Staff attendance | Switch to the existing coach/admin preview → open Coach view → mark attendee Completed or No-show → retain current booking state behavior. |
| Review the month | Open My Schedule → use previous/next month or Today → tap a day with a booking signal → review all sessions for the selected day → use the existing check-in or cancellation action where available. |
| Record progress | Open Health Progress from History → select Add measurement → enter the fields available from weight, body fat, chest, waist, hips, arms, and thighs → save with the device-local date → compare current and prior values or change the chart metric. |

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
