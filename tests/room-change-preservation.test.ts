import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const db = readFileSync(new URL("../server/db.ts", import.meta.url).pathname, "utf8");
const routers = readFileSync(new URL("../server/routers.ts", import.meta.url).pathname, "utf8");
const rooms = readFileSync(new URL("../app/(tabs)/rooms.tsx", import.meta.url).pathname, "utf8");

describe("Admin room change preservation contract", () => {
  it("previews both room-only and Coach booking rows and requires an exact confirmation snapshot", () => {
    expect(routers).toContain("previewRoomChange: adminProcedure");
    expect(db).toContain("availabilityId: availabilityShifts.externalId");
    expect(db).toContain("assertImpactConfirmed(affectedBookings, input.confirmedAffectedBookingIds)");
    expect(rooms).toContain("affectedBookingsPreserved");
    expect(rooms).toContain("confirmedAffectedBookingIds: preview.affectedBookingIds");
  });

  it("preserves bookings for closures, deactivation, and referenced-room deletion", () => {
    const closure = db.slice(db.indexOf("export async function setRoomClosure"), db.indexOf("export async function removeRoomClosure"));
    const deactivate = db.slice(db.indexOf("export async function updateGymRoom"), db.indexOf("export async function deleteCoachAccount"));
    const deletion = db.slice(db.indexOf("export async function deleteGymRoom"), db.indexOf("export async function getRoomClosures"));
    expect(closure).toContain("preservedBookingCount");
    expect(closure).not.toContain('status: "cancelled"');
    expect(deactivate).toContain("preserved ${affectedBookings.length}");
    expect(deactivate).not.toContain('status: "cancelled"');
    expect(deletion).toContain("SOFT_DELETE_GYM_ROOM");
    expect(deletion).toContain("preservedBookingCount");
    expect(deletion).not.toContain('status: "cancelled"');
  });
});
