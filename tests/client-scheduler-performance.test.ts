import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const bookingScreen = readFileSync(resolve(root, "app/(tabs)/book.tsx"), "utf8");
const tabLayout = readFileSync(resolve(root, "app/(tabs)/_layout.tsx"), "utf8");
const routers = readFileSync(resolve(root, "server/routers.ts"), "utf8");
const schema = readFileSync(resolve(root, "drizzle/schema.ts"), "utf8");

describe("Client scheduler performance contract", () => {
  it("uses one selected-date room schedule observer for both room access and Coach availability", () => {
    expect(bookingScreen.match(/availability\.roomSchedule\.useQuery/g)).toHaveLength(1);
    expect(bookingScreen).toContain("rooms={productionRoomSchedule.data?.rooms}");
    expect(bookingScreen).toContain("roomsLoading={productionRoomSchedule.isLoading}");
    expect(bookingScreen).not.toContain("const schedule = trpc.availability.roomSchedule.useQuery");
  });

  it("cancels obsolete date reads, prefetches immediate neighbors, and retains short-lived live availability caching", () => {
    expect(bookingScreen).toContain("utils.availability.roomSchedule.cancel({ date: previousDate })");
    expect(bookingScreen).toContain("utils.availability.roomSchedule.prefetch");
    expect(bookingScreen).toContain("staleTime: 10_000");
    expect(bookingScreen).toContain("refetchInterval: 15_000");
    expect(bookingScreen).toContain("refetchIntervalInBackground: false");
    expect(bookingScreen).toContain("BookingScheduleSkeleton");
  });

  it("parallelizes independent selected-date and weekly-calendar reads while omitting raw booking rows from the Client schedule response", () => {
    expect(routers).toContain("const [closures, bookingRows, availabilityRows] = roomIds.length ? await Promise.all");
    expect(routers).toContain("const [closures, windows, bookingRows] = roomIds.length ? await Promise.all");
    expect(routers).not.toContain("bookings: activeBookings");
    expect(routers).not.toContain("serviceTypeId: availabilityShifts.serviceTypeId");
  });

  it("defines indexes for room and Coach date lookups plus booking overlap joins", () => {
    expect(schema).toContain('index("availability_shifts_room_status_start_idx").on(table.roomId, table.status, table.startAt)');
    expect(schema).toContain('index("time_slots_room_start_idx").on(table.roomId, table.startAt)');
    expect(schema).toContain('index("time_slots_coach_start_idx").on(table.coachId, table.startAt)');
    expect(schema).toContain('index("bookings_time_slot_status_idx").on(table.timeSlotId, table.status)');
  });

  it("orders visible Client tabs as Home, Schedule, History, Profile without changing their routes", () => {
    const historyIndex = tabLayout.indexOf('<Tabs.Screen name="history"');
    const profileIndex = tabLayout.indexOf('<Tabs.Screen name="profile"');
    expect(historyIndex).toBeGreaterThan(tabLayout.indexOf('<Tabs.Screen name="schedule"'));
    expect(historyIndex).toBeLessThan(profileIndex);
    expect(tabLayout).toContain('name="history" options={{ href: isClient ? undefined : null, title: t("history")');
    expect(tabLayout).toContain('name="profile" options={{ href: isAdmin ? null : undefined, title: t("profile")');
  });
});
