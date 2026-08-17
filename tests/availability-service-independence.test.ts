import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");

describe("service-independent availability contract", () => {
  it("keeps service identifiers nullable and applies the non-destructive migration", () => {
    const schema = readFileSync(resolve(root, "drizzle/schema.ts"), "utf8");
    const migration = readFileSync(resolve(root, "drizzle/0013_amused_silk_fever.sql"), "utf8");
    expect(schema).toContain('serviceTypeId: int("serviceTypeId"),');
    expect(migration).toContain("ALTER TABLE `availabilityShifts` MODIFY COLUMN `serviceTypeId` int;");
    expect(migration).toContain("ALTER TABLE `timeSlots` MODIFY COLUMN `serviceTypeId` int;");
    expect(migration).toContain("ADD `openingTime`");
  });

  it("publishes Coach availability without selecting or inferring an active service", () => {
    const routers = readFileSync(resolve(root, "server/routers.ts"), "utf8");
    const createRoute = routers.slice(routers.indexOf("create: protectedProcedure"), routers.indexOf("setStatus: protectedProcedure"));
    expect(createRoute).not.toContain("No active coaching service is available.");
    expect(createRoute).toContain("serviceTypeId: null");
    expect(routers).toContain("bookRoom: protectedProcedure");
  });
});
