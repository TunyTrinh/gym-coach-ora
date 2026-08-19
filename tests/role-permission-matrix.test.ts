import { describe, expect, it } from "vitest";
import { appRouter } from "../server/routers";
import type { TrpcContext } from "../server/_core/context";

function context(role: "client" | "coach" | "admin"): TrpcContext {
  return {
    user: { id: 1, openId: `${role}-1`, email: `${role}@example.com`, emailNormalized: `${role}@example.com`, name: role, loginMethod: "google", passwordHash: null, role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("role permission matrix", () => {
  it("blocks Clients from Coach and Admin management", async () => {
    const caller = appRouter.createCaller(context("client"));
    await expect(caller.coach.clients()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.coach.notes({ clientUserId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.coach.saveNote({ clientUserId: 2, note: "private" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.availability.create({ startDate: "2026-08-20", startTime: "09:00", endTime: "10:00", maximumCapacity: 1, roomId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.admin.listUsers()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks Coaches from Client-private and Admin room operations", async () => {
    const caller = appRouter.createCaller(context("coach"));
    await expect(caller.member.schedule()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.member.measurements()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.admin.listRooms()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks Admin from Client-private health and booking operations", async () => {
    const caller = appRouter.createCaller(context("admin"));
    await expect(caller.member.measurements()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.availability.bookRoom({ roomId: 1, startAt: "2026-08-20T09:00:00.000Z", durationMinutes: 60 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
