import { describe, expect, it } from "vitest";

import { isRoomEligibleForAvailability, roomAvailabilityReason } from "../shared/room-eligibility";

describe("authoritative room eligibility", () => {
  it("does not make inactive rooms selectable", () => {
    expect(isRoomEligibleForAvailability({ active: false, closed: false })).toBe(false);
    expect(roomAvailabilityReason({ totalRooms: 1, activeRooms: 0, closedRooms: 0 })).toBe("inactive");
  });

  it("allows an active and open room", () => {
    expect(isRoomEligibleForAvailability({ active: true, closed: false })).toBe(true);
    expect(roomAvailabilityReason({ totalRooms: 1, activeRooms: 1, closedRooms: 0 })).toBe("available");
  });

  it("keeps temporary closure separate from permanent active status", () => {
    expect(isRoomEligibleForAvailability({ active: true, closed: true })).toBe(false);
    expect(roomAvailabilityReason({ totalRooms: 1, activeRooms: 1, closedRooms: 1 })).toBe("closed");
  });

  it("makes the room selectable again after reopening", () => {
    expect(isRoomEligibleForAvailability({ active: true, closed: false })).toBe(true);
  });
});
