import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const theme = readFileSync(resolve(root, "theme.config.js"), "utf8");
const ui = readFileSync(resolve(root, "components/gym-ui.tsx"), "utf8");
const calendar = readFileSync(resolve(root, "components/capacity-calendar.tsx"), "utf8");
const schedule = readFileSync(resolve(root, "app/(tabs)/schedule.tsx"), "utf8");
const book = readFileSync(resolve(root, "app/(tabs)/book.tsx"), "utf8");
const home = readFileSync(resolve(root, "app/(tabs)/index.tsx"), "utf8");

describe("Coachora visual system", () => {
  it("defines the approved shared dark surfaces, role accents, and functional status colors", () => {
    ["#0B0B0F", "#16161B", "#1D1D24", "#2A2A33", "#F5F5F7", "#9B9BA8", "#5C5C68", "#45C9C0", "#F2B84B", "#FF6F91", "#34D399", "#FBBF24", "#6B6B76", "#60A5FA"].forEach((token) => expect(theme).toContain(token));
  });

  it("centralizes role-aware headers, one-gradient heroes, flat surfaces, secondary actions, and dot-bearing status pills", () => {
    expect(ui).toContain("export function HeroCard");
    expect(ui).toContain("The only full-gradient container");
    expect(ui).toContain("export function SecondaryButton");
    expect(ui).toContain("roleBadge");
    expect(ui).toContain("statusDot");
    expect(ui).toContain("ROLE_ACCENTS");
  });

  it("uses one shared calendar rendering signature for Coach, Admin, and Client capacity views", () => {
    expect(calendar).toContain("export function CapacityCalendar");
    expect(calendar).toContain("utilization");
    expect(calendar).toContain("bookedByViewer");
    expect(calendar).toContain("SelectedFill");
    expect(calendar).toContain("CapacityRing");
    expect(schedule).toContain('role="coach"');
    expect(schedule).toContain('role={isCoach ? "coach" : "client"}');
    expect(book).toContain('role="admin"');
  });

  it("removes the duplicate Client home action and disables unavailable room access rather than presenting a contradictory booking action", () => {
    expect(home).not.toContain("primaryAction");
    expect(book).toContain("disabled={!available}");
    expect(book).toContain("accessibilityState={{ selected, disabled: !available }}");
    expect(book).toContain("<SecondaryButton title={busy ? t(\"publishing\") : t(\"roomAccessBooking\")}");
  });
});
