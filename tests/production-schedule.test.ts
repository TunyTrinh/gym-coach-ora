import { describe, expect, it } from "vitest";

import { adaptProductionSchedule } from "../lib/production-schedule";
import { seedGymData } from "../shared/gym";

describe("production schedule adapter", () => {
  it("uses authoritative rows instead of retaining demo bookings", () => {
    const snapshot = seedGymData(new Date("2026-08-16T08:00:00.000Z"));
    const result = adaptProductionSchedule(snapshot, {
      role: "client",
      user: { id: 71, name: "Alex Rivera", email: "alex@example.com" },
      rows: [{
        id: "booking-live-1",
        status: "confirmed",
        bookingTime: "2026-08-16T08:00:00.000Z",
        cancellationTime: null,
        cancellationReason: null,
        checkInTime: null,
        startAt: "2026-08-18T09:00:00.000Z",
        endAt: "2026-08-18T10:00:00.000Z",
        room: "Studio A",
        maximumCapacity: 3,
        serviceName: "Strength Training",
        availabilityId: "availability-live-1",
        coachName: "Maya Chen",
      }],
    });

    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0]).toMatchObject({ id: "booking-live-1", memberId: "member-71", status: "Confirmed" });
    expect(result.slots[0]).toMatchObject({ availabilityShiftId: "availability-live-1", room: "Studio A" });
    expect(result.member).toMatchObject({ fullName: "Alex Rivera", role: "client" });
  });
});
