import { describe, expect, it } from "vitest";

import { addMonths, buildMonthGrid, isSameLocalDay, localDayKey, startOfMonth } from "../lib/calendar";
import { seedGymData } from "../shared/gym";

describe("calendar overview helpers", () => {
  it("creates a stable local calendar key and compares local days", () => {
    expect(localDayKey(new Date(2026, 7, 12, 8, 30))).toBe("2026-08-12");
    expect(isSameLocalDay(new Date(2026, 7, 12, 8, 30), new Date(2026, 7, 12, 22, 15))).toBe(true);
    expect(isSameLocalDay(new Date(2026, 7, 12), new Date(2026, 7, 13))).toBe(false);
  });

  it("builds a six-week grid and moves month controls predictably", () => {
    const august = startOfMonth(new Date(2026, 7, 12));
    const grid = buildMonthGrid(august);
    expect(grid).toHaveLength(42);
    expect(localDayKey(grid[0])).toBe("2026-07-26");
    expect(localDayKey(addMonths(august, 1))).toBe("2026-09-01");
  });
});

describe("health measurement contract", () => {
  it("seeds dated measurements with every supported body metric", () => {
    const snapshot = seedGymData(new Date(2026, 7, 12, 9, 0));
    const latest = snapshot.measurements[0];
    expect(snapshot.measurements).toHaveLength(3);
    expect(latest).toMatchObject({
      weightKg: expect.any(Number),
      bodyFatPercentage: expect.any(Number),
      chestCm: expect.any(Number),
      waistCm: expect.any(Number),
      hipsCm: expect.any(Number),
      armsCm: expect.any(Number),
      thighsCm: expect.any(Number),
      recordedAt: expect.any(String),
    });
  });
});
