import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const clientBookingUi = readFileSync(resolve(__dirname, "../app/(tabs)/book.tsx"), "utf8");

describe("Client weekly booking calendar", () => {
  it("renders the complete local seven-day rail as accessible date cards", () => {
    expect(clientBookingUi).toContain("createLocalDateRail(now, 7)");
    expect(clientBookingUi).toContain("clientWeekGrid");
    expect(clientBookingUi).toContain('accessibilityRole="tablist"');
    expect(clientBookingUi).toContain('accessibilityRole="tab"');
    expect(clientBookingUi).toContain("accessibilityState={{ selected: active }}");
  });

  it("loads weekly status markers and preserves the selected date for both room and Coach booking queries", () => {
    expect(clientBookingUi).toContain("trpc.availability.roomCalendar.useQuery");
    expect(clientBookingUi).toContain("weekStatusByDate");
    expect(clientBookingUi).toContain("visibleRoomCalendarMarkers");
    expect(clientBookingUi).toContain("trpc.availability.roomSchedule.useQuery({ date: localDayKey(selectedDate) }");
    expect(clientBookingUi).toContain("<RoomAccessPanel selectedDate={selectedDate}");
  });
});
