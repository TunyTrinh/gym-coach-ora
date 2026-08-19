import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url).pathname, "utf8");

describe("authoritative cache synchronization", () => {
  it("invalidates Client, Coach, Admin, room, discovery, and capacity views after booking changes", () => {
    const booking = read("app/(tabs)/book.tsx");
    for (const query of ["member.schedule", "availability.coachSchedule", "availability.mine", "availability.bookableAll", "availability.previewCapacity", "availability.previewRoomCapacity", "availability.roomSchedule", "availability.roomCalendar", "admin.roomSchedule"]) {
      expect(booking).toContain(`utils.${query}.invalidate()`);
    }
  });

  it("invalidates Coach discovery and calendars after authorization and availability changes", () => {
    const admin = read("app/(tabs)/admin.tsx");
    const availability = read("app/availability.tsx");
    expect(admin).toContain("utils.catalog.coaches.invalidate()");
    expect(admin).toContain("utils.availability.bookableAll.invalidate()");
    expect(availability).toContain("utils.availability.roomCalendar.invalidate()");
    expect(availability).toContain("utils.admin.roomSchedule.invalidate()");
  });
});
