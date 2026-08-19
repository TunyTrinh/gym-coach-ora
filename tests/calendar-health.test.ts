import { describe, expect, it } from "vitest";

import { addMonths, buildMonthGrid, isSameLocalDay, localDayKey, startOfMonth } from "../lib/calendar";
import { HEALTH_MEASUREMENT_KEYS } from "../shared/gym";

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
  it("keeps every supported authoritative measurement key", () => {
    expect(HEALTH_MEASUREMENT_KEYS).toEqual(["weightKg", "bodyFatPercentage", "chestCm", "waistCm", "hipsCm", "armsCm", "thighsCm"]);
  });
});
