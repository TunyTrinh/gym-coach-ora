import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import {
  type AvailabilityCreateInput,
  type Booking,
  type BookingStatus,
  type GymSnapshot,
  type HealthMeasurementInput,
  type NotificationItem,
  type Role,
  type TimeSlot,
  formatShortDate,
  getBookingSlot,
  getCoach,
  getService,
  getSlot,
  iso,
  seedGymData,
} from "@/shared/gym";
import { restoreUpcomingAvailability } from "@/lib/availability";
import { canEditAvailabilityShift, createAvailabilityWindow, intervalsOverlap } from "@/lib/availability-shifts";
import { useAuth } from "@/hooks/use-auth";

const storageKeyFor = (userId?: number | null) => userId ? `coachora.snapshot.v1.${userId}` : "coachora.snapshot.local";

export type MutationResult =
  | { success: true; booking?: Booking; message?: string }
  | { success: false; error: string };

type GymContextValue = {
  snapshot: GymSnapshot;
  hydrated: boolean;
  unreadCount: number;
  upcomingBookings: Booking[];
  historyBookings: Booking[];
  bookSlot: (slotId: string) => Promise<MutationResult>;
  bookAvailability: (windowId: string, startAt: string, durationMinutes: number) => Promise<MutationResult>;
  createAvailability: (input: AvailabilityCreateInput) => Promise<MutationResult>;
  setAvailabilityStatus: (shiftId: string, status: "Available" | "Blocked") => Promise<MutationResult>;
  releaseCancelledShift: (shiftId: string, release: "reopen" | "block") => Promise<MutationResult>;
  cancelBooking: (bookingId: string, reason?: string) => Promise<MutationResult>;
  checkInBooking: (bookingId: string) => Promise<MutationResult>;
  markAttendance: (bookingId: string, status: Extract<BookingStatus, "Completed" | "No-show">) => Promise<MutationResult>;
  saveMeasurement: (measurement: HealthMeasurementInput) => Promise<MutationResult>;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  updateRole: (role: Role) => void;
  resetDemoData: () => void;
};

const GymContext = createContext<GymContextValue | null>(null);

export function GymProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const storageKey = storageKeyFor(user?.id);
  const [snapshot, setSnapshot] = useState<GymSnapshot>(() => seedGymData());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    setHydrated(false);
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (raw && active) {
          const parsed = JSON.parse(raw) as Partial<GymSnapshot>;
          setSnapshot((current) => {
            const restored = {
              ...current,
              ...parsed,
              member: current.member,
              measurements: Array.isArray(parsed.measurements) ? parsed.measurements : [],
              availabilityShifts: Array.isArray(parsed.availabilityShifts)
                ? parsed.availabilityShifts.map((shift: any) => ({ ...shift, maximumCapacity: Number(shift.maximumCapacity ?? 1) })) as GymSnapshot["availabilityShifts"]
                : current.availabilityShifts,
            } as GymSnapshot;
            return restoreUpcomingAvailability(restored);
          });
        }
      })
      .catch(() => undefined)
      .finally(() => { if (active) setHydrated(true); });

    return () => { active = false; };
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(storageKey, JSON.stringify(snapshot)).catch(() => undefined);
  }, [hydrated, snapshot, storageKey]);

  useEffect(() => {
    if (!user) return;
    setSnapshot((current) => {
      const fullName = user.name?.trim() || current.member.fullName;
      const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || current.member.initials;
      const member = { ...current.member, id: `member-${user.id}`, fullName, email: user.email ?? current.member.email, initials, role: user.role };
      return current.member.id === member.id && current.member.fullName === member.fullName && current.member.email === member.email && current.member.initials === member.initials && current.member.role === member.role ? current : { ...current, member };
    });
  }, [user]);

  const upcomingBookings = useMemo(
    () =>
      snapshot.bookings
        .filter((booking) => booking.memberId === snapshot.member.id && (booking.status === "Confirmed" || booking.status === "Pending"))
        .filter((booking) => {
          const slot = getBookingSlot(snapshot, booking);
          return slot ? new Date(slot.start).getTime() > Date.now() : false;
        })
        .sort((a, b) => new Date(getBookingSlot(snapshot, a)?.start ?? 0).getTime() - new Date(getBookingSlot(snapshot, b)?.start ?? 0).getTime()),
    [snapshot],
  );

  const historyBookings = useMemo(
    () =>
      snapshot.bookings
        .filter((booking) => booking.memberId === snapshot.member.id && ["Completed", "Cancelled", "No-show"].includes(booking.status))
        .sort((a, b) => new Date(getBookingSlot(snapshot, b)?.start ?? 0).getTime() - new Date(getBookingSlot(snapshot, a)?.start ?? 0).getTime()),
    [snapshot],
  );

  const bookSlot = useCallback(
    async (slotId: string): Promise<MutationResult> => {
      const slot = getSlot(snapshot, slotId);
      if (!slot) return { success: false, error: "That session is no longer available." };
      if (slot.status !== "Open" || slot.bookedCount >= slot.maximumCapacity) {
        return { success: false, error: "This session is full or no longer open." };
      }
      if (snapshot.bookings.some((booking) => booking.memberId === snapshot.member.id && booking.timeSlotId === slotId && ["Confirmed", "Pending"].includes(booking.status))) {
        return { success: false, error: "You are already booked for this session." };
      }
      const service = getService(snapshot, slot.serviceTypeId);
      if (!service) return { success: false, error: "The selected service is unavailable." };
      const start = new Date(slot.start).getTime();
      const end = new Date(slot.end).getTime();
      const overlap = snapshot.bookings.some((booking) => {
        if (booking.memberId !== snapshot.member.id || !["Confirmed", "Pending"].includes(booking.status)) return false;
        const bookedSlot = getBookingSlot(snapshot, booking);
        if (!bookedSlot) return false;
        return start < new Date(bookedSlot.end).getTime() && end > new Date(bookedSlot.start).getTime();
      });
      if (overlap) return { success: false, error: "This session overlaps with an existing booking." };
      if (new Date(slot.start).getTime() <= Date.now()) return { success: false, error: "Past sessions cannot be booked." };

      const managedShift = slot.availabilityShiftId ? snapshot.availabilityShifts.find((shift) => shift.id === slot.availabilityShiftId) : undefined;
      if (slot.availabilityShiftId && (!managedShift || managedShift.status !== "Available")) {
        return { success: false, error: "This coach shift is no longer available." };
      }

      const booking: Booking = {
        id: `booking-${Date.now()}`,
        memberId: snapshot.member.id,
        timeSlotId: slotId,
        status: "Confirmed",
        bookingTime: iso(new Date()),
      };
      const coach = getCoach(snapshot, slot.coachId);
      setSnapshot((current) => ({
        ...current,
        slots: current.slots.map((item) => item.id === slotId ? { ...item, bookedCount: item.bookedCount + 1, status: item.bookedCount + 1 >= item.maximumCapacity ? "Full" : "Open" } : item),
        bookings: [...current.bookings, booking],
        availabilityShifts: managedShift ? current.availabilityShifts.map((shift) => shift.id === managedShift.id ? { ...shift, status: "Booked", memberId: current.member.id, bookingId: booking.id, updatedBy: current.member.id } : shift) : current.availabilityShifts,
        notifications: [
          { id: `note-${Date.now()}`, type: "confirmation", title: "Booking confirmed", message: `${service.name} on ${formatShortDate(slot.start)} at ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(slot.start))}${coach ? ` with ${coach.fullName}` : ""}.${managedShift ? " Your coach has been notified." : ""}`, createdAt: iso(new Date()), read: false, relatedBookingId: booking.id, priority: "Important" },
          ...current.notifications,
        ],
      }));
      return { success: true, booking, message: "You’re booked. Your session is now in My Schedule." };
    },
    [snapshot],
  );

  const bookAvailability = useCallback(
    async (windowId: string, startAtIso: string, durationMinutes: number): Promise<MutationResult> => {
      if (snapshot.member.role !== "client") return { success: false, error: "Only clients can book a coach session." };
      const supportedDuration = durationMinutes === 30 || durationMinutes === 45 || (durationMinutes >= 60 && durationMinutes <= 240 && durationMinutes % 15 === 0);
      if (!supportedDuration) return { success: false, error: "Choose 30, 45, or a 15-minute duration from 60 to 240 minutes." };
      const availability = snapshot.availabilityShifts.find((item) => item.id === windowId);
      if (!availability || availability.status !== "Available") return { success: false, error: "This coach availability is no longer open." };
      const startAt = new Date(startAtIso);
      const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
      if (Number.isNaN(startAt.getTime()) || startAt <= new Date()) return { success: false, error: "Choose a future start time." };
      if (startAt < new Date(availability.start) || endAt > new Date(availability.end)) return { success: false, error: "Your complete session must fit inside the coach’s available time." };
      const clientOverlap = snapshot.bookings.some((booking) => {
        if (booking.memberId !== snapshot.member.id || !["Confirmed", "Pending"].includes(booking.status)) return false;
        const bookedSlot = getBookingSlot(snapshot, booking);
        return bookedSlot ? intervalsOverlap(startAt.toISOString(), endAt.toISOString(), bookedSlot.start, bookedSlot.end) : false;
      });
      if (clientOverlap) return { success: false, error: "This session overlaps with one of your existing bookings." };
      const overlappingClients = snapshot.bookings.filter((booking) => {
        if (!["Confirmed", "Pending"].includes(booking.status)) return false;
        const bookedSlot = getBookingSlot(snapshot, booking);
        return bookedSlot?.availabilityShiftId === windowId && intervalsOverlap(startAt.toISOString(), endAt.toISOString(), bookedSlot.start, bookedSlot.end);
      });
      if (overlappingClients.length >= availability.maximumCapacity) return { success: false, error: "That time has reached the coach’s maximum client capacity. Choose another time." };
      const service = getService(snapshot, availability.serviceTypeId) ?? snapshot.services[0];
      if (!service) return { success: false, error: "The selected service is unavailable." };
      const bookingId = `booking-${Date.now()}`;
      const slot: TimeSlot = {
        id: `booking-slot-${bookingId}`,
        availabilityShiftId: availability.id,
        gymId: availability.gymId,
        coachId: availability.coachId,
        roomId: availability.roomId,
        serviceTypeId: availability.serviceTypeId,
        start: startAt.toISOString(),
        end: endAt.toISOString(),
        maximumCapacity: availability.maximumCapacity,
        bookedCount: 1,
        status: "Full",
        room: availability.location,
      };
      const booking: Booking = { id: bookingId, memberId: snapshot.member.id, memberName: snapshot.member.fullName, timeSlotId: slot.id, status: "Confirmed", bookingTime: iso(new Date()), durationMinutes };
      const coach = getCoach(snapshot, availability.coachId);
      setSnapshot((current) => ({
        ...current,
        slots: [...current.slots, slot],
        bookings: [...current.bookings, booking],
        notifications: [
          { id: `note-client-${Date.now()}`, type: "confirmation", title: "Booking confirmed", message: `${service.name} on ${formatShortDate(slot.start)} is confirmed.${coach ? ` Your coach is ${coach.fullName}.` : ""}`, createdAt: iso(new Date()), read: false, relatedBookingId: booking.id, priority: "Important", audience: "client" },
          { id: `note-coach-${Date.now()}`, type: "confirmation", title: "New client booking", message: `A client booked ${formatShortDate(slot.start)} from ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(startAt)} to ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(endAt)}.`, createdAt: iso(new Date()), read: false, relatedBookingId: booking.id, priority: "Important", audience: "coach" },
          ...current.notifications,
        ],
      }));
      return { success: true, booking, message: "You’re booked. Your session is now in My Schedule." };
    },
    [snapshot],
  );

  const cancelBooking = useCallback(
    async (bookingId: string, reason = "Plans changed"): Promise<MutationResult> => {
      const booking = snapshot.bookings.find((item) => item.id === bookingId && item.memberId === snapshot.member.id);
      if (!booking) return { success: false, error: "Booking not found." };
      if (!["Confirmed", "Pending"].includes(booking.status)) return { success: false, error: "Only active bookings can be cancelled." };
      const slot = getBookingSlot(snapshot, booking);
      const service = slot ? getService(snapshot, slot.serviceTypeId) : undefined;
      if (!slot || !service) return { success: false, error: "Session details are unavailable." };
      const deadline = new Date(slot.start).getTime() - service.cancellationWindowMinutes * 60_000;
      if (Date.now() > deadline) return { success: false, error: `This booking can no longer be cancelled. The cutoff was ${formatShortDate(new Date(deadline).toISOString())}.` };
      setSnapshot((current) => ({
        ...current,
        bookings: current.bookings.map((item) => item.id === bookingId ? { ...item, status: "Cancelled", cancellationTime: iso(new Date()), cancellationReason: reason } : item),
        slots: current.slots.map((item) => item.id === slot.id ? { ...item, bookedCount: 0, status: "Cancelled" } : item),
        notifications: [
          { id: `note-client-cancel-${Date.now()}`, type: "cancellation", title: "Booking cancelled", message: `${service.name} on ${formatShortDate(slot.start)} has been cancelled.`, createdAt: iso(new Date()), read: false, relatedBookingId: bookingId, priority: "Normal", audience: "client" },
          ...(slot.availabilityShiftId ? [{ id: `note-coach-cancel-${Date.now()}`, type: "cancellation" as const, title: "Client session cancelled", message: `A client cancelled a session on ${formatShortDate(slot.start)}. Your availability remains open for other times.`, createdAt: iso(new Date()), read: false, relatedBookingId: bookingId, priority: "Normal" as const, audience: "coach" as const }] : []),
          ...current.notifications,
        ],
      }));
      return { success: true, message: "Booking cancelled and capacity released for that time." };
    },
    [snapshot],
  );

  const createAvailability = useCallback(async (input: AvailabilityCreateInput): Promise<MutationResult> => {
    if (snapshot.member.role !== "coach" && snapshot.member.role !== "admin") return { success: false, error: "Coach access is required to create availability." };
    const coachId = String(input.coachId);
    if (!snapshot.coaches.some((coach) => coach.id === coachId)) return { success: false, error: "Choose a valid coach." };
    if (!input.roomId) return { success: false, error: "Select an active room for this availability." };
    const window = createAvailabilityWindow(input);
    if (!window) return { success: false, error: "Choose an end time after the start time." };
    if (new Date(window.start).getTime() < Date.now() + 30 * 60_000) return { success: false, error: "Today’s availability must start at least 30 minutes from now." };
    const conflicts = snapshot.availabilityShifts.some((shift) => shift.coachId === coachId && ["Available", "Booked", "Blocked"].includes(shift.status) && intervalsOverlap(window.start, window.end, shift.start, shift.end));
    if (conflicts) return { success: false, error: "This overlaps an existing availability window or blocked period." };
    const timestamp = Date.now();
    setSnapshot((current) => {
      const serviceTypeId = String(input.serviceTypeId ?? current.services[0]?.id ?? "service-strength");
      const nextWindow = { id: `availability-${timestamp}`, gymId: current.gyms[0]?.id ?? "gym-peak", coachId, roomId: input.roomId ? String(input.roomId) : undefined, serviceTypeId, start: window.start, end: window.end, maximumCapacity: input.maximumCapacity, location: input.location, note: input.note, status: "Available" as const, createdBy: current.member.id };
      return { ...current, availabilityShifts: [...current.availabilityShifts, nextWindow], notifications: [{ id: `note-${timestamp}`, type: "announcement", title: "Availability published", message: "Your continuous availability window is open for booking.", createdAt: iso(new Date()), read: false, priority: "Normal", audience: "coach" }, ...current.notifications] };
    });
    return { success: true, message: "Your continuous availability window is now open for booking." };
  }, [snapshot]);

  const setAvailabilityStatus = useCallback(async (shiftId: string, status: "Available" | "Blocked"): Promise<MutationResult> => {
    const shift = snapshot.availabilityShifts.find((item) => item.id === shiftId);
    if (!shift) return { success: false, error: "Availability shift not found." };
    if (snapshot.member.role !== "admin" && (snapshot.member.role !== "coach" || shift.coachId !== "coach-maya")) return { success: false, error: "You can manage only your own availability." };
    if (!canEditAvailabilityShift(shift)) return { success: false, error: "Only future availability windows can be changed." };
    setSnapshot((current) => ({ ...current, availabilityShifts: current.availabilityShifts.map((item) => item.id === shiftId ? { ...item, status, updatedBy: current.member.id } : item) }));
    return { success: true, message: status === "Blocked" ? "Availability blocked. Clients can no longer see it." : "Availability reopened for booking." };
  }, [snapshot]);

  const releaseCancelledShift = useCallback(async (shiftId: string, release: "reopen" | "block"): Promise<MutationResult> => {
    const shift = snapshot.availabilityShifts.find((item) => item.id === shiftId);
    if (!shift || shift.status !== "Cancelled") return { success: false, error: "Only a cancelled shift can be released." };
    if (snapshot.member.role !== "admin" && (snapshot.member.role !== "coach" || shift.coachId !== "coach-maya")) return { success: false, error: "You can manage only your own availability." };
    return setAvailabilityStatus(shiftId, release === "reopen" ? "Available" : "Blocked");
  }, [setAvailabilityStatus, snapshot]);

  const checkInBooking = useCallback(
    async (bookingId: string): Promise<MutationResult> => {
      const booking = snapshot.bookings.find((item) => item.id === bookingId && item.memberId === snapshot.member.id);
      const slot = booking ? getBookingSlot(snapshot, booking) : undefined;
      if (!booking || !slot) return { success: false, error: "Booking not found." };
      if (booking.status !== "Confirmed") return { success: false, error: "Only confirmed bookings can be checked in." };
      const minutesFromStart = (Date.now() - new Date(slot.start).getTime()) / 60_000;
      if (minutesFromStart < -30 || minutesFromStart > 30) return { success: false, error: "Check-in opens 30 minutes before your session and closes 30 minutes after it starts." };
      setSnapshot((current) => ({ ...current, bookings: current.bookings.map((item) => item.id === bookingId ? { ...item, checkInTime: iso(new Date()), checkedInBy: current.member.id } : item) }));
      return { success: true, message: "You’re checked in. Have a great session." };
    },
    [snapshot],
  );

  const markAttendance = useCallback(async (bookingId: string, status: Extract<BookingStatus, "Completed" | "No-show">): Promise<MutationResult> => {
    const booking = snapshot.bookings.find((item) => item.id === bookingId);
    if (!booking) return { success: false, error: "Booking not found." };
    if (!["Confirmed", "Pending"].includes(booking.status)) return { success: false, error: "This booking already has an attendance result." };
    setSnapshot((current) => ({
      ...current,
      bookings: current.bookings.map((item) => item.id === bookingId ? { ...item, status, checkInTime: status === "Completed" ? (item.checkInTime ?? iso(new Date())) : item.checkInTime, checkedInBy: status === "Completed" ? "staff-demo" : item.checkedInBy } : item),
    }));
    return { success: true, message: status === "Completed" ? "Member marked completed." : "Member marked no-show." };
  }, [snapshot]);

  const saveMeasurement = useCallback(async (measurement: HealthMeasurementInput): Promise<MutationResult> => {
    const recordedAt = new Date(measurement.recordedAt);
    if (Number.isNaN(recordedAt.getTime())) return { success: false, error: "Choose a valid measurement date." };
    const hasValue = Object.entries(measurement).some(([key, value]) => key !== "recordedAt" && typeof value === "number" && Number.isFinite(value) && value > 0);
    if (!hasValue) return { success: false, error: "Add at least one positive measurement." };
    const record = { ...measurement, id: `measurement-${Date.now()}` };
    setSnapshot((current) => ({
      ...current,
      measurements: [record, ...current.measurements].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()),
    }));
    return { success: true, message: "Measurement saved to your private progress history." };
  }, []);

  const markNotificationRead = useCallback((notificationId: string) => {
    setSnapshot((current) => ({ ...current, notifications: current.notifications.map((item) => item.id === notificationId ? { ...item, read: true } : item) }));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setSnapshot((current) => ({ ...current, notifications: current.notifications.map((item) => ({ ...item, read: true })) }));
  }, []);

  const updateRole = useCallback((role: Role) => {
    setSnapshot((current) => ({ ...current, member: { ...current.member, role } }));
  }, []);

  const resetDemoData = useCallback(() => {
    setSnapshot(seedGymData());
  }, []);

  const visibleNotifications = snapshot.notifications.filter((item) => !item.audience || item.audience === "all" || item.audience === snapshot.member.role);
  const value = useMemo(() => ({ snapshot: { ...snapshot, notifications: visibleNotifications }, hydrated, unreadCount: visibleNotifications.filter((item) => !item.read).length, upcomingBookings, historyBookings, bookSlot, bookAvailability, createAvailability, setAvailabilityStatus, releaseCancelledShift, cancelBooking, checkInBooking, markAttendance, saveMeasurement, markNotificationRead, markAllNotificationsRead, updateRole, resetDemoData }), [snapshot, visibleNotifications, hydrated, upcomingBookings, historyBookings, bookSlot, bookAvailability, createAvailability, setAvailabilityStatus, releaseCancelledShift, cancelBooking, checkInBooking, markAttendance, saveMeasurement, markNotificationRead, markAllNotificationsRead, updateRole, resetDemoData]);

  return <GymContext.Provider value={value}>{children}</GymContext.Provider>;
}

export function useGym() {
  const context = useContext(GymContext);
  if (!context) throw new Error("useGym must be used inside GymProvider");
  return context;
}
