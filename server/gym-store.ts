import {
  type Booking,
  type BookingStatus,
  type GymSnapshot,
  getBookingSlot,
  getService,
  getSlot,
  iso,
  seedGymData,
  formatShortDate,
} from "../shared/gym";

export type ServerMutationResult =
  | { success: true; booking?: Booking; message: string }
  | { success: false; error: string };

let snapshot: GymSnapshot = seedGymData();

const memberIdFor = (userId: number | string) => `member-${userId}`;

export function getGymSnapshot() {
  return snapshot;
}

export function resetGymSnapshot() {
  snapshot = seedGymData();
  return snapshot;
}

export function bookGymSlot(slotId: string, userId: number | string): ServerMutationResult {
  const memberId = memberIdFor(userId);
  const slot = getSlot(snapshot, slotId);
  if (!slot) return { success: false, error: "That session is no longer available." };
  if (slot.status !== "Open" || slot.bookedCount >= slot.maximumCapacity) return { success: false, error: "This session is full or no longer open." };
  if (snapshot.bookings.some((booking) => booking.memberId === memberId && booking.timeSlotId === slotId && ["Confirmed", "Pending"].includes(booking.status))) return { success: false, error: "You are already booked for this session." };
  if (new Date(slot.start).getTime() <= Date.now()) return { success: false, error: "Past sessions cannot be booked." };

  const service = slot.serviceTypeId ? getService(snapshot, slot.serviceTypeId) : undefined;
  if (slot.serviceTypeId && !service) return { success: false, error: "The selected service is unavailable." };
  const start = new Date(slot.start).getTime();
  const end = new Date(slot.end).getTime();
  const overlap = snapshot.bookings.some((booking) => {
    if (booking.memberId !== memberId || !["Confirmed", "Pending"].includes(booking.status)) return false;
    const bookedSlot = getBookingSlot(snapshot, booking);
    return bookedSlot ? start < new Date(bookedSlot.end).getTime() && end > new Date(bookedSlot.start).getTime() : false;
  });
  if (overlap) return { success: false, error: "This session overlaps with an existing booking." };

  const booking: Booking = { id: `booking-${Date.now()}`, memberId, timeSlotId: slotId, status: "Confirmed", bookingTime: iso(new Date()) };
  snapshot = {
    ...snapshot,
    slots: snapshot.slots.map((item) => item.id === slotId ? { ...item, bookedCount: item.bookedCount + 1, status: item.bookedCount + 1 >= item.maximumCapacity ? "Full" : "Open" } : item),
    bookings: [...snapshot.bookings, booking],
  };
  return { success: true, booking, message: `Booking confirmed for ${formatShortDate(slot.start)}.` };
}

export function cancelGymBooking(bookingId: string, userId: number | string, reason = "Plans changed"): ServerMutationResult {
  const memberId = memberIdFor(userId);
  const booking = snapshot.bookings.find((item) => item.id === bookingId && item.memberId === memberId);
  if (!booking) return { success: false, error: "Booking not found." };
  if (!["Confirmed", "Pending"].includes(booking.status)) return { success: false, error: "Only active bookings can be cancelled." };
  const slot = getBookingSlot(snapshot, booking);
  const service = slot?.serviceTypeId ? getService(snapshot, slot.serviceTypeId) : undefined;
  if (!slot || (slot.serviceTypeId && !service)) return { success: false, error: "Session details are unavailable." };
  if (service && Date.now() > new Date(slot.start).getTime() - service.cancellationWindowMinutes * 60_000) return { success: false, error: "This booking is past its cancellation cutoff." };

  snapshot = {
    ...snapshot,
    bookings: snapshot.bookings.map((item) => item.id === bookingId ? { ...item, status: "Cancelled", cancellationTime: iso(new Date()), cancellationReason: reason } : item),
    slots: snapshot.slots.map((item) => item.id === slot.id ? { ...item, bookedCount: Math.max(0, item.bookedCount - 1), status: "Open" } : item),
  };
  return { success: true, message: "Booking cancelled and capacity released." };
}

export function markGymAttendance(bookingId: string, status: Extract<BookingStatus, "Completed" | "No-show">): ServerMutationResult {
  const booking = snapshot.bookings.find((item) => item.id === bookingId);
  if (!booking) return { success: false, error: "Booking not found." };
  if (!["Confirmed", "Pending"].includes(booking.status)) return { success: false, error: "This booking already has an attendance result." };
  snapshot = {
    ...snapshot,
    bookings: snapshot.bookings.map((item) => item.id === bookingId ? { ...item, status, checkInTime: status === "Completed" ? (item.checkInTime ?? iso(new Date())) : item.checkInTime, checkedInBy: status === "Completed" ? "staff" : item.checkedInBy } : item),
  };
  return { success: true, message: status === "Completed" ? "Member marked completed." : "Member marked no-show." };
}
