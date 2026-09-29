import { describe, expect, it } from "vitest";

import { defaultAvailabilityRoomId } from "../lib/availability-room-default";

describe("defaultAvailabilityRoomId", () => {
  const rooms = [
    { id: 11, defaultGym: false },
    { id: 12, defaultGym: true },
    { id: 13, defaultGym: false },
  ];

  it("prefers an active room in the Coach's assigned gym", () => {
    expect(defaultAvailabilityRoomId(rooms, null)).toBe(12);
  });

  it("keeps an explicit active-room choice", () => {
    expect(defaultAvailabilityRoomId(rooms, 13)).toBe(13);
  });

  it("falls back to the first active room when no default gym is assigned", () => {
    expect(defaultAvailabilityRoomId([{ id: "a" }, { id: "b" }], null)).toBe("a");
  });

  it("returns null when there are no active rooms", () => {
    expect(defaultAvailabilityRoomId([], null)).toBeNull();
  });

  it("never defaults to a visible but ineligible room", () => {
    expect(defaultAvailabilityRoomId([
      { id: "inactive", defaultGym: true, eligible: false },
      { id: "open", defaultGym: false, eligible: true },
    ], "inactive")).toBe("open");
  });
});
