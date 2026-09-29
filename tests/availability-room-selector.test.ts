import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildAvailabilityRoomChoices } from "../shared/availability-room-collection";

describe("Coach Add Availability room selector", () => {
  it("retains all three sequentially created rooms instead of overwriting earlier rooms", () => {
    const sequentiallyCreatedRooms = [
      { id: 1, gymId: 1, active: true, name: "Room 1" },
      { id: 2, gymId: 1, active: true, name: "Room 2" },
      { id: 3, gymId: 1, active: true, name: "Room 3" },
    ];

    const choices = buildAvailabilityRoomChoices(sequentiallyCreatedRooms, new Set(), 1);

    expect(choices.map((room) => room.name)).toEqual(["Room 1", "Room 2", "Room 3"]);
    expect(choices.every((room) => room.eligible)).toBe(true);
    expect(choices.filter((room) => room.defaultGym)).toHaveLength(3);
  });

  it("keeps inactive and temporarily closed rooms visible while preventing selection", () => {
    const choices = buildAvailabilityRoomChoices([
      { id: 1, gymId: 1, active: true, name: "Open" },
      { id: 2, gymId: 1, active: false, name: "Inactive" },
      { id: 3, gymId: 1, active: true, name: "Closed" },
    ], new Set([3]), 1);

    expect(choices).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Open", eligible: true, statusReason: "available" }),
      expect.objectContaining({ name: "Inactive", eligible: false, statusReason: "inactive" }),
      expect.objectContaining({ name: "Closed", eligible: false, statusReason: "temporarily_closed" }),
    ]));
  });

  it("refetches the authoritative room collection whenever the availability sheet opens", () => {
    const availabilityUi = readFileSync(resolve(__dirname, "../app/availability.tsx"), "utf8");
    expect(availabilityUi).toContain("showCreate &&");
    expect(availabilityUi).toContain('refetchOnMount: "always"');
    expect(availabilityUi).toContain("roomPickerQuery.data?.rooms");
  });
});
