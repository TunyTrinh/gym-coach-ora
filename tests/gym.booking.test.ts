import { beforeEach, describe, expect, it } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import { appRouter } from "../server/routers";
import { getGymSnapshot, resetGymSnapshot } from "../server/gym-store";

type User = NonNullable<TrpcContext["user"]>;

function createContext(user: User | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

const member: User = { id: 42, openId: "member-42", email: "member@example.com", emailNormalized: "member@example.com", name: "Alex Morgan", loginMethod: "manus", passwordHash: null, role: "client", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
const admin: User = { ...member, id: 99, openId: "admin-99", role: "admin" };

beforeEach(() => {
  resetGymSnapshot();
});

describe("gym.snapshot", () => {
  it("returns a schedule with open capacity", async () => {
    const caller = appRouter.createCaller(createContext(member));
    const snapshot = await caller.gym.snapshot();
    expect(snapshot.gyms[0]?.name).toBe("Northstar Downtown");
    expect(snapshot.slots.some((slot) => slot.status === "Open")).toBe(true);
  });
});

describe("gym.book", () => {
  it("rejects unauthenticated booking attempts", async () => {
    const caller = appRouter.createCaller(createContext(null));
    const openSlot = getGymSnapshot().slots.find((slot) => slot.status === "Open")!;
    await expect(caller.gym.book({ slotId: openSlot.id })).rejects.toThrow("Please login");
  });

  it("books once and rejects duplicate bookings", async () => {
    const caller = appRouter.createCaller(createContext(member));
    const openSlot = getGymSnapshot().slots.find((slot) => slot.status === "Open")!;
    const first = await caller.gym.book({ slotId: openSlot.id });
    expect(first.success).toBe(true);
    const second = await caller.gym.book({ slotId: openSlot.id });
    expect(second).toEqual({ success: false, error: "You are already booked for this session." });
  });

  it("books an upcoming Open Gym time slot", async () => {
    const caller = appRouter.createCaller(createContext(member));
    const openGymSlot = getGymSnapshot().slots.find((slot) => slot.serviceTypeId === "service-open" && slot.status === "Open" && new Date(slot.start).getTime() > Date.now());
    expect(openGymSlot).toBeDefined();
    const result = await caller.gym.book({ slotId: openGymSlot!.id });
    if (!result.success) throw new Error(result.error);
    expect(result.booking?.timeSlotId).toBe(openGymSlot!.id);
  });
});

describe("gym.cancel", () => {
  it("cancels an active booking and releases capacity", async () => {
    const caller = appRouter.createCaller(createContext(member));
    const openSlot = getGymSnapshot().slots.find((slot) => slot.status === "Open")!;
    const created = await caller.gym.book({ slotId: openSlot.id });
    if (!created.success || !created.booking) throw new Error("Expected a booking in setup");
    const cancelled = await caller.gym.cancel({ bookingId: created.booking.id, reason: "Test cancellation" });
    expect(cancelled).toEqual({ success: true, message: "Booking cancelled and capacity released." });
    expect(getGymSnapshot().slots.find((slot) => slot.id === openSlot.id)?.bookedCount).toBe(openSlot.bookedCount);
  });
});

describe("gym.attendance", () => {
  it("allows staff to mark a booking completed", async () => {
    const memberCaller = appRouter.createCaller(createContext(member));
    const openSlot = getGymSnapshot().slots.find((slot) => slot.status === "Open")!;
    const created = await memberCaller.gym.book({ slotId: openSlot.id });
    if (!created.success || !created.booking) throw new Error("Expected a booking in setup");
    const adminCaller = appRouter.createCaller(createContext(admin));
    const result = await adminCaller.gym.attendance({ bookingId: created.booking.id, status: "Completed" });
    expect(result).toEqual({ success: true, message: "Member marked completed." });
  });
});
