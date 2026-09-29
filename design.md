# Coachora Mobile Interface Design

## Product Direction

Coachora is a mobile-first gym and coach booking experience for members, coaches, and administrators. The interface should feel like a focused first-party iOS utility: calm, direct, touch-friendly, and optimized for one-handed portrait use. The primary interaction model is a bottom tab bar with modal sheets for short actions and native-feeling navigation for deeper workflows.

## Screen List

| Screen | Primary content and functionality |
|---|---|
| Home | Role-aware greeting, upcoming session summary, quick actions, attendance/progress snapshot, and important notifications. |
| Schedule | Calendar or date-strip view, upcoming and past sessions, filters by coach/status, and session detail navigation. |
| Book | Coach discovery, availability, session type, date/time selection, and booking confirmation. |
| Coach Detail | Coach profile, specialties, availability, rating or activity summary, and a clear booking action. |
| Availability | Coach-facing availability editor with day/time slots, recurring schedule controls, and save feedback. |
| Progress | Member progress metrics, attendance history, and trend summaries presented in compact cards. |
| History | Completed, cancelled, and missed sessions with date, coach, and status details. |
| Notifications | System and booking updates, unread state, and read/clear interactions. |
| Profile | User identity, role, preferences, and account-related actions. |
| Admin Dashboard | Admin overview of members, coaches, bookings, and operational alerts. |
| Authentication Gate | Entry point for unauthenticated users and handoff to the connected auth flow; should not block public shell rendering before auth is configured. |

## Key User Flows

### Member booking flow

1. The member opens **Home** and taps the next-session card or the primary booking action.
2. Coachora opens **Book**, where the member filters or selects a coach.
3. The member opens **Coach Detail**, reviews specialties and availability, then taps **Book a session**.
4. The member selects a session type, date, and available time slot.
5. A confirmation sheet summarizes the booking and provides a final confirm action.
6. After confirmation, the member returns to **Schedule** with success feedback and the new booking visible.

### Coach availability flow

1. A coach opens **Availability** from the role-aware navigation or dashboard.
2. The coach selects a weekday and adjusts one or more time slots.
3. The coach saves the schedule and receives immediate success feedback.
4. Updated availability becomes visible in the booking flow.

### Session follow-up flow

1. The member opens **Schedule** and selects a session.
2. The detail view shows coach, time, location or meeting information, and booking status.
3. The member may cancel or reschedule when the current status and policy permit.
4. The updated status is reflected in **History** and **Notifications**.

### Authentication handoff flow

1. An unauthenticated user reaches a protected action.
2. Coachora displays a concise authentication prompt without losing the intended destination.
3. The user completes the external or connected authentication flow.
4. Coachora returns to the original action and refreshes role-aware content.

## Color Choices

Coachora uses a disciplined fitness-oriented palette rather than a generic template palette. The primary brand color is **Coachora Green `#0E8F63`**, used for primary actions, active navigation, and positive progress states. The dark anchor color is **Deep Slate `#13221E`**, used for high-emphasis text and dark surfaces. The light background is **Warm Mist `#F6F8F5`**, with **Pure White `#FFFFFF`** for elevated cards. Secondary text uses **Graphite `#5E6B66`**, borders use **Sage Line `#DCE6E0`**, warning states use **Amber `#C9821A`**, and errors use **C84B4B**. Progress and confirmation states should reuse the primary green with lighter tints rather than introducing additional accent colors.

## Interaction and Layout Rules

All screens assume portrait orientation and one-handed use. Primary actions should sit within the lower half of the screen when possible, use minimum 44-point touch targets, and provide pressed-state feedback. Long content belongs in a `FlatList` or `ScrollView` with safe-area handling. Cards should use moderate corner radii, restrained shadows, and strong text hierarchy. Destructive actions should be separated visually and require a confirmation sheet. Empty, loading, and error states must be explicit rather than showing placeholder metrics.

## Accessibility and Responsiveness

Text must remain legible at larger system sizes, color must not be the sole indicator of status, and interactive controls must have accessible labels. The web/PWA layout may expand to a centered mobile-width content column on desktop while preserving the same portrait-first hierarchy. Navigation should remain understandable without relying on hover states.
