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
    const bookingRoute = routers.slice(routers.indexOf("book: protectedProcedure"), routers.indexOf("bookRoom: protectedProcedure"));
    const bookingScreen = readFileSync(resolve(root, "app/(tabs)/book.tsx"), "utf8");
    const translations = readFileSync(resolve(root, "lib/i18n.ts"), "utf8");
    expect(createRoute).not.toContain("No active coaching service is available.");
    expect(createRoute).not.toContain("serviceTypeId: input");
    expect(createRoute).toContain("serviceTypeId: null");
    expect(bookingRoute).not.toContain("serviceTypeId: z.number");
    expect(bookingRoute).not.toContain("Select an active coaching service");
    expect(bookingRoute).toContain("serviceTypeId: null");
    expect(bookingScreen).not.toContain("catalog.services");
    expect(bookingScreen).not.toContain("chooseServiceForBooking");
    expect(translations).not.toContain("chooseServiceForBooking");
    expect(translations).not.toContain("noActiveServicesForBooking");
    expect(routers).toContain("bookRoom: protectedProcedure");
  });
});
