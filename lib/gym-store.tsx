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
import { canEditAvailabilityShift, generateAvailabilityIntervals, intervalsOverlap } from "@/lib/availability-shifts";

const STORAGE_KEY = "gymflow.snapshot.v1";

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
  const [snapshot, setSnapshot] = useState<GymSnapshot>(() => seedGymData());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<GymSnapshot>;
          setSnapshot((current) => {
            const restored = { ...current, ...parsed, measurements: Array.isArray(parsed.measurements) ? parsed.measurements : [] } as GymSnapshot;
            return restoreUpcomingAvailability(restored);
          });
        }
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)).catch(() => undefined);
  }, [hydrated, snapshot]);

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
      const managedShift = slot.availabilityShiftId ? snapshot.availabilityShifts.find((shift) => shift.id === slot.availabilityShiftId) : undefined;
      setSnapshot((current) => ({
        ...current,
        bookings: current.bookings.map((item) => item.id === bookingId ? { ...item, status: "Cancelled", cancellationTime: iso(new Date()), cancellationReason: reason } : item),
        slots: current.slots.map((item) => item.id === slot.id ? { ...item, bookedCount: Math.max(0, item.bookedCount - 1), status: managedShift ? "Cancelled" : "Open" } : item),
        availabilityShifts: managedShift ? current.availabilityShifts.map((shift) => shift.id === managedShift.id ? { ...shift, status: "Cancelled", updatedBy: current.member.id } : shift) : current.availabilityShifts,
        notifications: [{ id: `note-${Date.now()}`, type: "cancellation", title: "Booking cancelled", message: `${service.name} on ${formatShortDate(slot.start)} has been cancelled.${managedShift ? " Your coach can now re-open or block the released shift." : ""}`, createdAt: iso(new Date()), read: false, relatedBookingId: bookingId, priority: "Normal" }, ...current.notifications],
      }));
      return { success: true, message: managedShift ? "Booking cancelled. Your coach will choose whether to re-open the released shift." : "Booking cancelled and capacity released." };
    },
    [snapshot],
  );

  const createAvailability = useCallback(async (input: AvailabilityCreateInput): Promise<MutationResult> => {
    if (snapshot.member.role !== "coach" && snapshot.member.role !== "admin") return { success: false, error: "Coach access is required to create availability." };
    const coachId = String(input.coachId);
    if (!snapshot.coaches.some((coach) => coach.id === coachId)) return { success: false, error: "Choose a valid coach." };
    const intervals = generateAvailabilityIntervals(input);
    if (!intervals.length) return { success: false, error: "Choose a valid future period that fits at least one complete shift." };
    if (intervals.some((interval) => new Date(interval.start).getTime() <= Date.now())) return { success: false, error: "Availability must be in the future." };
    const conflicts = intervals.some((interval) => snapshot.availabilityShifts.some((shift) => shift.coachId === coachId && ["Available", "Booked", "Blocked"].includes(shift.status) && intervalsOverlap(interval.start, interval.end, shift.start, shift.end)) || snapshot.slots.some((slot) => slot.coachId === coachId && !slot.availabilityShiftId && ["Open", "Full", "Blocked"].includes(slot.status) && intervalsOverlap(interval.start, interval.end, slot.start, slot.end)));
    if (conflicts) return { success: false, error: "This overlaps an existing shift, booking, or blocked period." };
    const timestamp = Date.now();
    const recurrenceGroupId = input.recurrenceGroupId ?? `availability-${timestamp}`;
    setSnapshot((current) => {
      const nextShifts = intervals.map((interval, index) => ({ id: `${recurrenceGroupId}-${index + 1}`, gymId: current.gyms[0]?.id ?? "gym-peak", coachId, serviceTypeId: String(input.serviceTypeId), start: interval.start, end: interval.end, location: input.location, note: input.note, status: "Available" as const, createdBy: current.member.id, recurrenceGroupId }));
      const nextSlots = nextShifts.map((shift) => ({ id: `slot-${shift.id}`, availabilityShiftId: shift.id, gymId: shift.gymId, coachId: shift.coachId, serviceTypeId: shift.serviceTypeId, start: shift.start, end: shift.end, maximumCapacity: 1, bookedCount: 0, status: "Open" as const, room: shift.location }));
      return { ...current, availabilityShifts: [...current.availabilityShifts, ...nextShifts], slots: [...current.slots, ...nextSlots], notifications: [{ id: `note-${timestamp}`, type: "announcement", title: "Availability published", message: `${nextShifts.length} bookable coach shift${nextShifts.length === 1 ? "" : "s"} added to the schedule.`, createdAt: iso(new Date()), read: false, priority: "Normal" }, ...current.notifications] };
    });
    return { success: true, message: `${intervals.length} bookable shift${intervals.length === 1 ? "" : "s"} created.` };
  }, [snapshot]);

  const setAvailabilityStatus = useCallback(async (shiftId: string, status: "Available" | "Blocked"): Promise<MutationResult> => {
    const shift = snapshot.availabilityShifts.find((item) => item.id === shiftId);
    if (!shift) return { success: false, error: "Availability shift not found." };
    if (snapshot.member.role !== "admin" && (snapshot.member.role !== "coach" || shift.coachId !== "coach-maya")) return { success: false, error: "You can manage only your own availability." };
    if (!canEditAvailabilityShift(shift) || shift.status === "Booked") return { success: false, error: "Only future unbooked shifts can be changed." };
    setSnapshot((current) => ({ ...current, availabilityShifts: current.availabilityShifts.map((item) => item.id === shiftId ? { ...item, status, updatedBy: current.member.id } : item), slots: current.slots.map((slot) => slot.availabilityShiftId === shiftId ? { ...slot, status: status === "Available" ? "Open" : "Blocked" } : slot) }));
    return { success: true, message: status === "Blocked" ? "Shift blocked. Clients can no longer see it." : "Shift re-opened for booking." };
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

  const value = useMemo(() => ({ snapshot, hydrated, unreadCount: snapshot.notifications.filter((item) => !item.read).length, upcomingBookings, historyBookings, bookSlot, createAvailability, setAvailabilityStatus, releaseCancelledShift, cancelBooking, checkInBooking, markAttendance, saveMeasurement, markNotificationRead, markAllNotificationsRead, updateRole, resetDemoData }), [snapshot, hydrated, upcomingBookings, historyBookings, bookSlot, createAvailability, setAvailabilityStatus, releaseCancelledShift, cancelBooking, checkInBooking, markAttendance, saveMeasurement, markNotificationRead, markAllNotificationsRead, updateRole, resetDemoData]);

  return <GymContext.Provider value={value}>{children}</GymContext.Provider>;
}

export function useGym() {
  const context = useContext(GymContext);
  if (!context) throw new Error("useGym must be used inside GymProvider");
  return context;
}
