import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const routers = readFileSync(resolve(root, "server/routers.ts"), "utf8");
const bookingUi = readFileSync(resolve(root, "app/(tabs)/book.tsx"), "utf8");
const coachUi = readFileSync(resolve(root, "app/availability.tsx"), "utf8");

describe("visible room status and service-independent Client discovery", () => {
  it("provides canonical monthly calendar markers and selected-date room rows from one availability router", () => {
    expect(routers).toContain("roomCalendar: protectedProcedure");
    expect(routers).toContain('markers.push("partially_closed")');
    expect(routers).toContain('markers.push("availability_published")');
    expect(routers).toContain('markers.push("client_booking")');
    expect(routers).toContain("roomSchedule: protectedProcedure");
    expect(routers).toContain("serviceTypeId: availabilityShifts.serviceTypeId");
    expect(routers).toContain("coachId: availabilityShifts.coachId");
  });

  it("drives Client Coach discovery from the selected-date room schedule and retains blocked windows with reasons", () => {
    expect(bookingUi).toContain("trpc.availability.roomSchedule.useQuery({ date: localDayKey(selectedDate) }");
    expect(bookingUi).toContain("roomAvailabilityMessage");
    expect(bookingUi).toContain('window.statusReason === "available" && window.roomStatusReason === "available" ? "Available" as const : "Blocked" as const');
    expect(bookingUi).toContain('window.coachId === selectedWindow.coachId && window.status === "Available"');
  });

  it("uses accessible Coach calendar labels and refetches calendar state after mutations", () => {
    expect(coachUi).toContain("CoachRoomCalendar");
    expect(coachUi).toContain("roomCalendarLegend");
    expect(coachUi).toContain("accessibilityLabel");
    expect(coachUi).toContain("utils.availability.roomCalendar.invalidate()");
  });
});
