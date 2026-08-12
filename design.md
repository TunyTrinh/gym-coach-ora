# GymFlow Mobile App Interface Design

## Design Philosophy & HIG Standards
GymFlow is crafted as a first-party iOS and Android Progressive Web App (PWA) optimized for mobile portrait orientation (9:16) and effortless one-handed usage. Following Apple Human Interface Guidelines (HIG) and Material Design principles, the app prioritizes:
- **Ergonomic Reach**: Primary actions and navigation tabs are positioned within easy thumb reach at the bottom and center of the screen.
- **Visual Clarity**: High-contrast typography, clear hierarchy, and distinct card surfaces (`surface` background with subtle borders) separate active data states.
- **Immediate Feedback**: Haptic-aligned press responses, skeleton loaders, and inline validation ensure users instantly perceive system status.

---

## Screen List & Architecture

1. **Login & Welcome Screen** (`app/index.tsx` / auth)
   - *Content*: Brand logo, gym tagline, Google Sign-In button, PWA installation guide summary.
   - *Functionality*: OAuth authentication redirect, guest preview mode, error handling.

2. **Home Dashboard** (`app/(tabs)/index.tsx`)
   - *Content*: Greeting ("Welcome back, [Name]"), Next Upcoming Booking Card with countdown, Quick "Book Session" CTA, Today's Schedule preview, Latest Gym Announcement banner, Notification badge.
   - *Functionality*: Tap upcoming booking to view details/check-in, tap quick book to jump to booking flow, tap announcement to read full notice.

3. **Browse & Book** (`app/(tabs)/book.tsx`)
   - *Content*: Gym selector, Service Type pills (Personal Training, Group Class, Open Gym, Yoga), Coach selector, Date picker (7-day horizontal strip), Available Time Slots list with capacity indicators (e.g., "3 spots left").
   - *Functionality*: Filter slots by criteria, tap slot to open Booking Confirmation modal/sheet.

4. **My Schedule** (`app/(tabs)/schedule.tsx`)
   - *Content*: Upcoming bookings list, agenda view, booking status indicators (Confirmed, Pending), Check-In button (active within window), Cancel booking action with cancellation window checks.
   - *Functionality*: Perform check-in, cancel booking with reason prompt, view session directions/notes.

5. **History & Attendance** (`app/(tabs)/history.tsx`)
   - *Content*: Completed, cancelled, and no-show sessions list, date range and service filters, monthly attendance summary stats, streak counter.
   - *Functionality*: Review past workout frequency and attendance records.

6. **Notifications Center** (`app/(tabs)/notifications.tsx`)
   - *Content*: List of announcements, booking reminders, membership alerts; read/unread status badges.
   - *Functionality*: Mark single or all notifications as read, tap notification to jump to relevant booking or announcement.

7. **Profile & Settings** (`app/(tabs)/profile.tsx`)
   - *Content*: User avatar, membership plan details & expiry date, emergency contact info, notification preferences toggles (Push, Email), PWA installation instructions for iOS/Android, Logout button.
   - *Functionality*: Update profile preferences, trigger PWA install prompt, sign out safely.

8. **Coach & Admin Dashboard** (`app/coach/index.tsx` or role-restricted tab)
   - *Content*: Coach session schedule, attendee list per session, attendance marking controls (Completed / No-show), session cancellation action with required reason, broadcast message to attendees.
   - *Functionality*: Manage coach availability and attendance tracking.

---

## Key User Flows

1. **Member Booking Flow**:
   - Tap "Book" tab → Select Service / Gym / Coach / Date → Browse available slots → Tap slot → Confirm booking in bottom sheet → Immediate entry in "My Schedule".

2. **Check-In Flow**:
   - Open "My Schedule" on session day → When within check-in window, tap "Check In" → Success confirmation with timestamp and recorded actor.

3. **Cancellation Flow**:
   - Open upcoming booking in "My Schedule" → Tap "Cancel Booking" → Review cancellation policy & deadline → Enter reason (if applicable) → Confirm → Slot capacity released instantly.

---

## Color Choices & Branding (GymFlow Brand)
- **Primary Accent**: Electric Teal / Deep Cyan (`#0a7ea4` / `#22d3ee`) symbolizing energy, precision, and modern fitness.
- **Background**: Crisp adaptive background (`#ffffff` light, `#121212` dark).
- **Surface**: Elevated card background (`#f8fafc` light, `#1e293b` dark).
- **Success / Warning / Error**: Standard semantic colors (`#22c55e`, `#f59e0b`, `#ef4444`) for capacity and booking statuses.
