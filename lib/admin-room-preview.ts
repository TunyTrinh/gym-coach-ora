import { getBookingSlot, getCoach, type GymSnapshot } from "../shared/gym";

export type AdminPreviewRoom = {
  id: string;
  name: string;
  maximumCapacity: number;
};

export type AdminPreviewWindow = {
  id: string;
  roomId: string;
  startAt: string;
  endAt: string;
  status: string;
  maximumCapacity: number;
  location: string;
  note?: string;
  coachName: string;
};

export type AdminPreviewBooking = {
  id: string;
  status: string;
  checkInTime?: string;
  clientName?: string;
  startAt: string;
  endAt: string;
  availabilityId: string;
};

function fallbackRoomId(location: string) {
  return `preview-room:${location.trim().toLocaleLowerCase().replace(/\s+/g, " ")}`;
}

/**
 * Builds the Admin debug calendar from the same persisted local snapshot used
 * by Client and Coach preview flows. Production uses the server room-ID query.
 */
export function buildAdminPreviewRoomCalendar(snapshot: GymSnapshot) {
  const windows: AdminPreviewWindow[] = snapshot.availabilityShifts.map((window) => ({
    id: window.id,
    roomId: window.roomId ?? fallbackRoomId(window.location),
    startAt: window.start,
    endAt: window.end,
    status: window.status,
    maximumCapacity: window.maximumCapacity,
    location: window.location,
    note: window.note,
    coachName: getCoach(snapshot, window.coachId)?.fullName ?? "—",
  }));

  const windowsById = new Map(windows.map((window) => [window.id, window]));
  const roomsById = new Map<string, AdminPreviewRoom>();
  windows.forEach((window) => {
    const current = roomsById.get(window.roomId);
    roomsById.set(window.roomId, {
      id: window.roomId,
      name: window.location,
      maximumCapacity: Math.max(current?.maximumCapacity ?? 0, window.maximumCapacity),
    });
  });

  const bookings: AdminPreviewBooking[] = snapshot.bookings.flatMap((booking) => {
    const slot = getBookingSlot(snapshot, booking);
    const availabilityId = slot?.availabilityShiftId;
    if (!slot || !availabilityId || !windowsById.has(availabilityId)) return [];
    return [{
      id: booking.id,
      status: booking.status,
      checkInTime: booking.checkInTime,
      clientName: booking.memberName ?? (booking.memberId === snapshot.member.id ? snapshot.member.fullName : undefined),
      startAt: slot.start,
      endAt: slot.end,
      availabilityId,
    }];
  });

  return { rooms: [...roomsById.values()], windows, bookings };
}
