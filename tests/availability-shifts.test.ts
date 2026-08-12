import { describe, expect, it } from "vitest";

import { canEditAvailabilityShift, generateAvailabilityIntervals, intervalsOverlap, shiftDisplayStatus } from "../lib/availability-shifts";
import type { AvailabilityShift } from "../shared/gym";

const baseInput = {
  coachId: "coach-maya",
  serviceTypeId: "service-pt",
  startDate: "2026-08-17",
  startTime: "09:00",
  endTime: "12:00",
  durationMinutes: 60 as const,
  location: "Studio A",
};

function shift(overrides: Partial<AvailabilityShift> = {}): AvailabilityShift {
  return {
    id: "availability-test",
    gymId: "gym-apex",
    createdBy: "coach-maya",
    coachId: "coach-maya",
    serviceTypeId: "service-pt",
    start: "2026-08-17T09:00:00.000Z",
    end: "2026-08-17T10:00:00.000Z",
    location: "Studio A",
    status: "Available",
    ...overrides,
  };
}

describe("coach availability shifts", () => {
  it("builds bookable periods with the requested break between shifts", () => {
    const intervals = generateAvailabilityIntervals({ ...baseInput, breakMinutes: 15 });

    expect(intervals).toHaveLength(2);
    expect(new Date(intervals[1].start).getTime() - new Date(intervals[0].end).getTime()).toBe(15 * 60_000);
  });

  it("creates a weekly recurrence only on the selected weekday", () => {
    const intervals = generateAvailabilityIntervals({ ...baseInput, endDate: "2026-09-07", weekdays: [1], breakMinutes: 0 });

    expect(intervals).toHaveLength(12);
    expect(new Set(intervals.map((interval) => new Date(interval.start).getDay()))).toEqual(new Set([1]));
  });

  it("refuses invalid availability periods before any shift can be published", () => {
    expect(generateAvailabilityIntervals({ ...baseInput, startTime: "12:00", endTime: "09:00" })).toEqual([]);
    expect(generateAvailabilityIntervals({ ...baseInput, startTime: "not-a-time", endTime: "12:00" })).toEqual([]);
  });

  it("recognizes only real interval conflicts", () => {
    expect(intervalsOverlap("2026-08-17T09:00:00.000Z", "2026-08-17T10:00:00.000Z", "2026-08-17T09:30:00.000Z", "2026-08-17T10:30:00.000Z")).toBe(true);
    expect(intervalsOverlap("2026-08-17T09:00:00.000Z", "2026-08-17T10:00:00.000Z", "2026-08-17T10:00:00.000Z", "2026-08-17T11:00:00.000Z")).toBe(false);
  });

  it("marks elapsed availability as expired and prevents its future management", () => {
    const now = new Date("2026-08-17T11:00:00.000Z");
    const elapsed = shift();
    const future = shift({ start: "2026-08-17T12:00:00.000Z", end: "2026-08-17T13:00:00.000Z" });

    expect(shiftDisplayStatus(elapsed, now)).toBe("Expired");
    expect(canEditAvailabilityShift(elapsed, now)).toBe(false);
    expect(canEditAvailabilityShift(future, now)).toBe(true);
  });
});
