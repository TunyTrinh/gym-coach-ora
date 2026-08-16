import { describe, expect, it } from "vitest";
import { addLocalDays, createLocalDateRail, isSameLocalDay, isUpcomingAtLocalTime, startOfLocalDay } from "../lib/scheduler";

describe("local booking scheduler", () => {
  it("anchors the date rail to local midnight and advances by calendar days", () => {
    const localNoon = new Date(2026, 7, 12, 12, 45, 30);
    const rail = createLocalDateRail(localNoon, 3);

    expect(rail).toHaveLength(3);
    expect(rail[0]).toEqual(new Date(2026, 7, 12, 0, 0, 0, 0));
    expect(rail[1]).toEqual(new Date(2026, 7, 13, 0, 0, 0, 0));
    expect(rail[2]).toEqual(new Date(2026, 7, 14, 0, 0, 0, 0));
  });

  it("compares dates by the device’s local calendar day", () => {
    const morning = new Date(2026, 7, 12, 0, 5);
    const evening = new Date(2026, 7, 12, 23, 55);
    const tomorrow = addLocalDays(morning, 1);

    expect(isSameLocalDay(morning, evening)).toBe(true);
    expect(isSameLocalDay(morning, tomorrow)).toBe(false);
    expect(startOfLocalDay(evening)).toEqual(new Date(2026, 7, 12, 0, 0, 0, 0));
  });

  it("never considers an elapsed or simultaneous start time bookable", () => {
    const now = new Date(2026, 7, 12, 18, 0, 0);

    expect(isUpcomingAtLocalTime(new Date(2026, 7, 12, 17, 59, 59).toISOString(), now)).toBe(false);
    expect(isUpcomingAtLocalTime(new Date(2026, 7, 12, 18, 0, 0).toISOString(), now)).toBe(false);
    expect(isUpcomingAtLocalTime(new Date(2026, 7, 12, 18, 1, 0).toISOString(), now)).toBe(true);
  });
});
