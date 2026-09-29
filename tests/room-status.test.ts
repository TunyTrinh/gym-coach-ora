import { describe, expect, it } from "vitest";

import { isWithinRoomHours, roomScheduleStatus } from "../shared/room-status";

describe("authoritative room schedule status", () => {
  const start = new Date(2026, 7, 19, 9, 0, 0);
  const end = new Date(2026, 7, 19, 10, 0, 0);

  it("distinguishes inactive, temporary closure, out-of-hours, full, and available states", () => {
    expect(roomScheduleStatus({ active: false, closed: false, occupancy: 0, maximumCapacity: 12 })).toBe("inactive");
    expect(roomScheduleStatus({ active: true, closed: true, occupancy: 0, maximumCapacity: 12 })).toBe("temporarily_closed");
    expect(roomScheduleStatus({ active: true, closed: false, withinHours: false, occupancy: 0, maximumCapacity: 12 })).toBe("outside_hours");
    expect(roomScheduleStatus({ active: true, closed: false, occupancy: 12, maximumCapacity: 12 })).toBe("full");
    expect(roomScheduleStatus({ active: true, closed: false, occupancy: 11, maximumCapacity: 12 })).toBe("available");
  });

  it("requires every room-only booking to fit inside one operating day and configured hours", () => {
    expect(isWithinRoomHours({ openingTime: "08:00", closingTime: "20:00", startAt: start, endAt: end })).toBe(true);
    expect(isWithinRoomHours({ openingTime: "08:00", closingTime: "20:00", startAt: new Date(2026, 7, 19, 7, 45), endAt: start })).toBe(false);
    expect(isWithinRoomHours({ openingTime: "08:00", closingTime: "20:00", startAt: new Date(2026, 7, 19, 19, 30), endAt: new Date(2026, 7, 19, 20, 30) })).toBe(false);
    expect(isWithinRoomHours({ openingTime: "00:00", closingTime: "23:59", startAt: new Date(2026, 7, 19, 23, 30), endAt: new Date(2026, 7, 20, 0, 15) })).toBe(false);
  });
});
