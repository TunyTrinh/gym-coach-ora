import { describe, expect, it } from "vitest";

import { closureDateBounds } from "../server/db";

describe("room closure date validation", () => {
  it("returns one configured gym calendar-day interval for a valid closure date", () => {
    const { startAt, endAt } = closureDateBounds("2026-08-15", "Asia/Ho_Chi_Minh");

    expect(startAt.toISOString()).toBe("2026-08-14T17:00:00.000Z");
    expect(endAt.toISOString()).toBe("2026-08-15T17:00:00.000Z");
    expect(endAt.getTime() - startAt.getTime()).toBe(24 * 60 * 60 * 1_000);
  });

  it("accepts a real leap day and rejects impossible or malformed dates", () => {
    expect(closureDateBounds("2028-02-29", "UTC").startAt.toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(() => closureDateBounds("2027-02-29")).toThrow("Choose a valid closure date.");
    expect(() => closureDateBounds("2026-2-9")).toThrow("Choose a valid closure date.");
    expect(() => closureDateBounds("not-a-date")).toThrow("Choose a valid closure date.");
  });
});
