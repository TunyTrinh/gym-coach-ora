import { afterEach, describe, expect, it } from "vitest";

import { gymDateKey, gymDayBounds, gymLocalDateTime } from "../shared/business-time";

const originalTimeZone = process.env.TZ;
afterEach(() => { process.env.TZ = originalTimeZone; });

describe("gym business timezone", () => {
  it("produces the same business instant under different server process timezones", () => {
    const results = ["UTC", "America/Los_Angeles", "Asia/Tokyo"].map((processTimeZone) => {
      process.env.TZ = processTimeZone;
      return gymLocalDateTime("2026-08-15", "09:30", "Asia/Ho_Chi_Minh")?.toISOString();
    });
    expect(results).toEqual(["2026-08-15T02:30:00.000Z", "2026-08-15T02:30:00.000Z", "2026-08-15T02:30:00.000Z"]);
    expect(gymDateKey(new Date("2026-08-14T18:00:00.000Z"), "Asia/Ho_Chi_Minh")).toBe("2026-08-15");
  });

  it("uses DST-safe calendar bounds and rejects a nonexistent wall-clock time", () => {
    const spring = gymDayBounds("2026-03-08", "America/New_York");
    const fall = gymDayBounds("2026-11-01", "America/New_York");
    expect(spring && spring.endAt.getTime() - spring.startAt.getTime()).toBe(23 * 60 * 60_000);
    expect(fall && fall.endAt.getTime() - fall.startAt.getTime()).toBe(25 * 60 * 60_000);
    expect(gymLocalDateTime("2026-03-08", "02:30", "America/New_York")).toBeNull();
    expect(gymLocalDateTime("2026-11-01", "01:30", "America/New_York")).toBeNull();
  });
});
