import { describe, expect, it } from "vitest";

import { restoreUpcomingAvailability } from "../lib/availability";
import { seedGymData } from "../shared/gym";

describe("restoreUpcomingAvailability", () => {
  it("preserves member records while adding future open slots to a stale persisted snapshot", () => {
    const staleSnapshot = seedGymData(new Date("2024-01-01T09:00:00"));
    const now = new Date("2026-08-12T09:00:00");
    const refreshed = restoreUpcomingAvailability(staleSnapshot, now);
    const freshOpenSlotCount = seedGymData(now).slots.filter((slot) => slot.status === "Open" && new Date(slot.start).getTime() > now.getTime()).length;

    expect(refreshed.bookings).toEqual(staleSnapshot.bookings);
    expect(refreshed.measurements).toEqual(staleSnapshot.measurements);
    expect(refreshed.slots).toHaveLength(staleSnapshot.slots.length + freshOpenSlotCount);
    expect(refreshed.slots.some((slot) => slot.status === "Open" && new Date(slot.start).getTime() > now.getTime())).toBe(true);
  });

  it("does not duplicate availability when a saved snapshot already has future open slots", () => {
    const now = new Date("2026-08-12T09:00:00");
    const currentSnapshot = seedGymData(now);

    expect(restoreUpcomingAvailability(currentSnapshot, now)).toBe(currentSnapshot);
  });
});
