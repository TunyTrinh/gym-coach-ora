import { describe, expect, it } from "vitest";

import { buildAdminPreviewRoomCalendar } from "../lib/admin-room-preview";
import { seedGymData } from "../shared/gym";

describe("Admin debug room calendar", () => {
  it("uses the same availability room and Client booking identifiers as preview booking", () => {
    const snapshot = seedGymData(new Date("2026-08-15T08:00:00.000Z"));
    const availability = snapshot.availabilityShifts[0];
    availability.roomId = "preview-gym-floor";
    availability.location = "Gym floor";
    const slot = {
      id: "slot-preview-room-booking",
      availabilityShiftId: availability.id,
      gymId: availability.gymId,
      coachId: availability.coachId,
      roomId: availability.roomId,
      serviceTypeId: availability.serviceTypeId,
      start: availability.start,
      end: availability.end,
      maximumCapacity: availability.maximumCapacity,
      bookedCount: 1,
      status: "Full" as const,
      room: availability.location,
    };
    snapshot.slots.push(slot);
    snapshot.bookings.push({ id: "booking-preview-room", memberId: snapshot.member.id, memberName: snapshot.member.fullName, timeSlotId: slot.id, status: "Confirmed", bookingTime: availability.start });

    const calendar = buildAdminPreviewRoomCalendar(snapshot);
    const room = calendar.rooms.find((candidate) => candidate.id === availability.roomId);

    expect(room?.name).toBe("Gym floor");
    expect(calendar.windows.filter((window) => window.roomId === availability.roomId)).toHaveLength(1);
    expect(calendar.bookings.filter((booking) => booking.availabilityId === availability.id)).toHaveLength(1);
  });
});
