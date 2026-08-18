import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url).pathname, "utf8");

describe("confirmed role navigation and visual system", () => {
  it("uses the exact four-item role navigation with confirmed hidden-route replacements", () => {
    const tabs = read("app/(tabs)/_layout.tsx");
    expect(tabs).toContain('isCoach ? "Today" : isAdmin ? "Overview"');
    expect(tabs).toContain('name="history" options={{ href: isClient ? undefined : null');
    expect(tabs).toContain('name="rooms" options={{ href: isAdmin ? undefined : null');
    expect(tabs).toContain('name="admin" options={{ href: isAdmin ? undefined : null');
    expect(tabs).toContain('name="reports" options={{ href: isAdmin ? undefined : null');
    expect(tabs).toContain('name="book" options={{ href: null }}');
  });

  it("keeps Client booking, Client progress, and Coach availability reachable by their confirmed replacement paths", () => {
    const home = read("app/(tabs)/index.tsx");
    const history = read("app/(tabs)/history.tsx");
    const schedule = read("app/(tabs)/schedule.tsx");
    expect(home).toContain('router.push("/book")');
    expect(history).toContain('"upcoming" | "past" | "progress"');
    expect(history).toContain('router.push("/progress")');
    expect(schedule).toContain('onPress={isCoach ? () => router.push("/book") : undefined}');
  });

  it("builds Admin Reports from existing room and booking summary procedures without a new backend route", () => {
    const reports = read("app/(tabs)/reports.tsx");
    expect(reports).toContain("trpc.admin.listRooms.useQuery");
    expect(reports).toContain("trpc.admin.roomSchedule.useQuery");
    expect(reports).toContain('type Period = "day" | "week"');
    expect(reports).toContain('const [coachName, setCoachName]');
  });

  it("centralizes the approved surface, status, and typography system in shared primitives", () => {
    const tokens = read("theme.config.js");
    const ui = read("components/gym-ui.tsx");
    expect(tokens).toContain("surface2");
    expect(tokens).toContain("surface3");
    expect(tokens).toContain("mutedStrong");
    expect(tokens).toContain("#34D399");
    expect(ui).toContain("export function StatCard");
    expect(ui).toContain("export function IconButton");
    expect(ui).toContain('fontSize: 22, fontWeight: "600"');
    expect(ui).toContain("backgroundColor: colors.surface2");
  });
});
