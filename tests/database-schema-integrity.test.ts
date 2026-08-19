import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const schema = readFileSync(path.join(root, "drizzle/schema.ts"), "utf8");
const integrityMigration = readFileSync(path.join(root, "drizzle/0015_schema_integrity.sql"), "utf8");
const databaseService = readFileSync(path.join(root, "server/db.ts"), "utf8");

describe("database schema integrity checkpoint", () => {
  it("keeps service storage legacy-readable while new runtime references stay nullable", () => {
    expect(schema).toContain("export const serviceTypes");
    expect(schema.match(/serviceTypeId: int\("serviceTypeId"\)/g)).toHaveLength(2);
    expect(schema).not.toMatch(/serviceTypeId: int\("serviceTypeId"\)\.notNull/);
    expect(integrityMigration).not.toMatch(/DROP\s+TABLE\s+`?serviceTypes`?/i);
    expect(integrityMigration).not.toMatch(/DROP\s+(?:COLUMN\s+)?`?serviceTypeId`?/i);
  });

  it("preflights upgrades before adding relational constraints", () => {
    const preflightPosition = integrityMigration.indexOf("CALL `coachora_preflight_0015`()");
    const firstConstraintPosition = integrityMigration.indexOf("ADD CONSTRAINT");
    expect(preflightPosition).toBeGreaterThan(-1);
    expect(firstConstraintPosition).toBeGreaterThan(preflightPosition);
    expect(integrityMigration).toContain("0015 preflight: orphan in booking data");
    expect(integrityMigration).toContain("0015 preflight: duplicate Coach/Client assignments");
  });

  it("records preservation-first foreign keys and database checks", () => {
    expect(integrityMigration).toContain("bookings_timeSlotId_timeSlots_id_fk");
    expect(schema).toContain('references(() => timeSlots.id, { onDelete: "no action", onUpdate: "no action" })');
    expect(schema).toContain("time_slots_interval_check");
    expect(schema).toContain("health_measurements_value_required_check");
    expect(integrityMigration).not.toContain("ON DELETE cascade");
  });

  it("keeps room and closure lifecycle writes synchronized with their columns", () => {
    expect(schema).toContain('deletedAt: timestamp("deletedAt")');
    expect(schema).toContain('updatedBy: int("updatedBy").references');
    expect(databaseService).toContain("audited additive lifecycle migration is awaiting explicit approval");
    expect(databaseService).toContain("Explicit legacy-safe columns avoid Drizzle emitting a missing deletedAt");
    expect(databaseService).toContain("INSERT INTO \\`gymRooms\\`");
    expect(databaseService).toContain("INSERT INTO \\`roomClosures\\`");
  });
});
