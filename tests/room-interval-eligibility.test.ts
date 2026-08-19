import { describe, expect, it } from "vitest";

import { evaluateRoomInterval, intervalsOverlap, maximumConcurrentOccupancy } from "../shared/room-interval-eligibility";

const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 7, 15, hour, minute));
const base = {
  active: true,
  openingTime: "08:00",
  closingTime: "18:00",
  maximumCapacity: 2,
  timeZone: "UTC",
  startAt: at(10),
  endAt: at(11),
  occupiedIntervals: [] as { startAt: Date; endAt: Date }[],
};

describe("shared room interval eligibility", () => {
  it("uses strict overlap boundaries and peak concurrency rather than daily totals", () => {
    expect(intervalsOverlap({ startAt: at(9), endAt: at(10) }, { startAt: at(10), endAt: at(11) })).toBe(false);
    expect(intervalsOverlap({ startAt: at(9, 59), endAt: at(10, 1) }, { startAt: at(10), endAt: at(11) })).toBe(true);
    const disjoint = [{ startAt: at(10), endAt: at(10, 30) }, { startAt: at(10, 30), endAt: at(11) }];
    expect(maximumConcurrentOccupancy(disjoint, { startAt: at(10), endAt: at(11) })).toBe(1);
  });

  it.each([
    ["inactive", { ...base, active: false }],
    ["temporarily_closed", { ...base, closure: { closureDate: "2026-08-15", reason: "Maintenance" } }],
    ["outside_hours", { ...base, startAt: at(7), endAt: at(8) }],
    ["full", { ...base, occupiedIntervals: [{ startAt: at(9), endAt: at(12) }, { startAt: at(10), endAt: at(10, 30) }] }],
    ["available", base],
  ] as const)("returns structured %s status", (status, input) => {
    const result = evaluateRoomInterval(input);
    expect(result.status).toBe(status);
    expect(result.openingHours).toEqual({ openingTime: "08:00", closingTime: "18:00", timeZone: "UTC" });
    expect(result.maximumCapacity).toBe(2);
    if (status === "temporarily_closed") expect(result.closure).toMatchObject({ reason: "Maintenance" });
  });
});
