import { describe, expect, it } from "vitest";

import { closureDateBounds } from "../server/db";

describe("room closure date validation", () => {
  it("returns one local calendar-day interval for a valid closure date", () => {
    const { startAt, endAt } = closureDateBounds("2026-08-15");

    expect(startAt.getFullYear()).toBe(2026);
    expect(startAt.getMonth()).toBe(7);
    expect(startAt.getDate()).toBe(15);
    expect(startAt.getHours()).toBe(0);
    expect(endAt.getDate()).toBe(16);
    expect(endAt.getTime() - startAt.getTime()).toBe(24 * 60 * 60 * 1_000);
  });

  it("accepts a real leap day and rejects impossible or malformed dates", () => {
    expect(closureDateBounds("2028-02-29").startAt.getDate()).toBe(29);
    expect(() => closureDateBounds("2027-02-29")).toThrow("Choose a valid closure date.");
    expect(() => closureDateBounds("2026-2-9")).toThrow("Choose a valid closure date.");
    expect(() => closureDateBounds("not-a-date")).toThrow("Choose a valid closure date.");
  });
});
