import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { bookGymSlot, cancelGymBooking, getGymSnapshot, markGymAttendance } from "./gym-store";
import { getDb } from "./db";
import { availabilityShifts, auditLogs, bookings, coachClients, coachNotes, coaches, notifications, serviceTypes, timeSlots, users } from "../drizzle/schema";
import { and, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const availabilityInput = z.object({
  coachId: z.number().int().positive().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  maximumCapacity: z.number().int().min(1).max(12),
  location: z.string().trim().min(1).max(128),
  note: z.string().trim().max(600).optional(),
});

const durationInput = z.number().int().min(30).max(240).refine(
  (value) => value === 30 || value === 45 || (value >= 60 && value % 15 === 0),
  "Choose 30, 45, or a 15-minute duration from 60 to 240 minutes.",
);

function localDateTime(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const value = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(value.getTime()) ? null : value;
}

function ensureBookableInterval(window: { startAt: Date; endAt: Date; status: string }, startAt: Date, durationMinutes: number) {
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
  if (window.status !== "available") throw new Error("This availability is not open for booking.");
  if (startAt <= new Date()) throw new Error("Choose a future start time.");
  if (startAt < window.startAt || endAt > window.endAt) throw new Error("Your complete session must fit inside the coach’s available time.");
  return endAt;
}

async function managedCoachId(db: any, actor: { id: number; role: string }, requestedCoachId?: number) {
  if (actor.role === "admin") {
    if (!requestedCoachId) throw new Error("Select a coach before managing availability.");
    return requestedCoachId;
  }
  if (actor.role !== "coach") throw new Error("Coach access is required to manage availability.");
  const ownCoach = await db.select({ id: coaches.id }).from(coaches).where(eq(coaches.userId, actor.id)).limit(1);
  if (!ownCoach[0]) throw new Error("Your coach profile is unavailable.");
  return ownCoach[0].id;
}

async function canManageShift(db: any, actor: { id: number; role: string }, shiftId: string) {
  const shift = await db.select().from(availabilityShifts).where(eq(availabilityShifts.externalId, shiftId)).limit(1);
  if (!shift[0]) throw new Error("Availability shift not found.");
  const coachId = await managedCoachId(db, actor, actor.role === "admin" ? shift[0].coachId : undefined);
  if (coachId !== shift[0].coachId) throw new Error("You can manage only your own availability.");
  return shift[0];
}

async function managedCoachClientId(db: any, actor: { id: number; role: string }, clientUserId: number, requestedCoachId?: number) {
  const coachId = await managedCoachId(db, actor, requestedCoachId);
  const assignment = await db.select({ id: coachClients.id }).from(coachClients).where(and(
    eq(coachClients.coachId, coachId),
    eq(coachClients.clientUserId, clientUserId),
  )).limit(1);
  if (!assignment[0]) throw new Error("This Client is not assigned to the selected Coach.");
  return coachId;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  gym: router({
    snapshot: publicProcedure.query(() => getGymSnapshot()),
    book: protectedProcedure
      .input(z.object({ slotId: z.string().min(1).max(64) }))
      .mutation(({ ctx, input }) => bookGymSlot(input.slotId, ctx.user.id)),
    cancel: protectedProcedure
      .input(z.object({ bookingId: z.string().min(1).max(64), reason: z.string().trim().min(1).max(240).optional() }))
      .mutation(({ ctx, input }) => cancelGymBooking(input.bookingId, ctx.user.id, input.reason)),
    attendance: protectedProcedure
      .input(z.object({ bookingId: z.string().min(1).max(64), status: z.enum(["Completed", "No-show"]) }))
      .mutation(({ ctx, input }) => {
        if (ctx.user.role !== "admin") return { success: false as const, error: "Staff access is required to update attendance." };
        return markGymAttendance(input.bookingId, input.status);
      }),
  }),
  admin: router({
    updateRole: protectedProcedure
      .input(z.object({ userId: z.number(), role: z.enum(["client", "coach", "admin"]) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required.");
        }
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
        await db.insert(auditLogs).values({
          actorUserId: ctx.user.id,
          action: "UPDATE_ROLE",
          targetUserId: input.userId,
          details: `Role updated to ${input.role}`,
        });
        return { success: true };
      }),
    assignClient: protectedProcedure
      .input(z.object({ coachId: z.number(), clientUserId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required.");
        }
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await db.insert(coachClients).values({
          coachId: input.coachId,
          clientUserId: input.clientUserId,
          isPrimary: true,
          assignedBy: ctx.user.id,
        });
        return { success: true };
      }),
  }),
  coach: router({
    clients: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
        throw new Error("Unauthorized: Coach access required.");
      }
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      
      const coachRecord = await db.select().from(coaches).where(eq(coaches.userId, ctx.user.id)).limit(1);
      const coach = coachRecord[0];
      
      if (!coach && ctx.user.role !== "admin") {
        throw new Error("Coach profile not found.");
      }
      
      const query = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .innerJoin(coachClients, eq(users.id, coachClients.clientUserId))
        .where(ctx.user.role === "coach" && coach ? eq(coachClients.coachId, coach.id) : undefined);
        
      return query;
    }),
    saveNote: protectedProcedure
      .input(z.object({ clientUserId: z.number().int().positive(), coachId: z.number().int().positive().optional(), note: z.string().trim().min(1).max(4_000) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Coach access required.");
        }
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const coachId = await managedCoachClientId(db, ctx.user, input.clientUserId, input.coachId);
        await db.insert(coachNotes).values({
          coachId,
          clientUserId: input.clientUserId,
          note: input.note,
        });
        return { success: true };
      }),
  }),
  availability: router({
    mine: protectedProcedure
      .input(z.object({ coachId: z.number().int().positive().optional(), from: z.string().datetime().optional(), to: z.string().datetime().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const coachId = await managedCoachId(db, ctx.user, input?.coachId);
        const from = input?.from ? new Date(input.from) : new Date();
        const to = input?.to ? new Date(input.to) : new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
        return db.select().from(availabilityShifts).where(and(eq(availabilityShifts.coachId, coachId), lt(availabilityShifts.startAt, to), gt(availabilityShifts.endAt, from)));
      }),
    bookable: protectedProcedure
      .input(z.object({ coachId: z.number().int().positive(), dateStart: z.string().datetime(), dateEnd: z.string().datetime() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "client") throw new Error("Member access is required to view bookable shifts.");
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        return db.select({
          id: availabilityShifts.externalId,
          coachId: availabilityShifts.coachId,
          serviceTypeId: availabilityShifts.serviceTypeId,
          startAt: availabilityShifts.startAt,
          endAt: availabilityShifts.endAt,
          location: availabilityShifts.location,
          status: availabilityShifts.status,
          maximumCapacity: availabilityShifts.maximumCapacity,
          note: availabilityShifts.note,
        }).from(availabilityShifts).where(and(
          eq(availabilityShifts.coachId, input.coachId),
          eq(availabilityShifts.status, "available"),
          lt(availabilityShifts.startAt, new Date(input.dateEnd)),
          gt(availabilityShifts.endAt, new Date(input.dateStart)),
          gt(availabilityShifts.endAt, new Date()),
        ));
      }),
    previewCapacity: protectedProcedure
      .input(z.object({ windowId: z.string().min(1).max(64), startAt: z.string().datetime(), durationMinutes: durationInput }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "client") throw new Error("Member access is required to preview booking capacity.");
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const window = await db.select().from(availabilityShifts).where(eq(availabilityShifts.externalId, input.windowId)).limit(1);
        if (!window[0]) throw new Error("Availability window not found.");
        const startAt = new Date(input.startAt);
        const endAt = ensureBookableInterval(window[0], startAt, input.durationMinutes);
        const overlaps = await db.select({ id: bookings.id }).from(bookings).innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id)).where(and(
          eq(bookings.availabilityShiftId, window[0].id),
          inArray(bookings.status, ["pending", "confirmed"]),
          lt(timeSlots.startAt, endAt),
          gt(timeSlots.endAt, startAt),
        ));
        return { endAt, bookedCount: overlaps.length, remainingCapacity: Math.max(0, window[0].maximumCapacity - overlaps.length), maximumCapacity: window[0].maximumCapacity };
      }),
    create: protectedProcedure
      .input(availabilityInput)
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const coachId = await managedCoachId(db, ctx.user, input.coachId);
        const startAt = localDateTime(input.startDate, input.startTime);
        const endAt = localDateTime(input.startDate, input.endTime);
        if (!startAt || !endAt || endAt <= startAt) throw new Error("Choose an end time after the start time.");
        const now = new Date();
        if (startAt.getTime() < now.getTime() + 30 * 60_000) throw new Error("Today’s availability must start at least 30 minutes from now.");
        const defaultService = await db.select({ id: serviceTypes.id }).from(serviceTypes).where(eq(serviceTypes.active, true)).limit(1);
        if (!defaultService[0]) throw new Error("No active coaching service is available.");
        const windowId = `availability-${randomUUID()}`;
        await db.transaction(async (tx: any) => {
          // Serializes new windows for the same Coach, preventing overlapping publications from racing.
          await tx.execute(sql`SELECT id FROM coaches WHERE id = ${coachId} FOR UPDATE`);
          const conflicts = await tx.select({ id: availabilityShifts.id }).from(availabilityShifts).where(and(
            eq(availabilityShifts.coachId, coachId),
            lt(availabilityShifts.startAt, endAt),
            gt(availabilityShifts.endAt, startAt),
            inArray(availabilityShifts.status, ["available", "booked", "blocked"]),
          )).limit(1);
          if (conflicts.length) throw new Error("This availability overlaps an existing availability window or blocked period.");
          await tx.insert(availabilityShifts).values({ externalId: windowId, gymId: 1, coachId, serviceTypeId: defaultService[0].id, startAt, endAt, maximumCapacity: input.maximumCapacity, location: input.location, note: input.note, status: "available", createdBy: ctx.user.id });
          await tx.insert(auditLogs).values({ actorUserId: ctx.user.id, action: "CREATE_AVAILABILITY", details: `Created continuous availability window ${windowId} for coach ${coachId}.` });
        });
        return { success: true as const, windowId, createdCount: 1 };
      }),
    setStatus: protectedProcedure
      .input(z.object({ shiftId: z.string().min(1).max(64), status: z.enum(["Blocked", "Available"]) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const shift = await canManageShift(db, ctx.user, input.shiftId);
        if (new Date(shift.startAt) <= new Date() || shift.status === "completed") throw new Error("Only future availability windows can be changed.");
        const status = input.status === "Blocked" ? "blocked" : "available";
        await db.transaction(async (tx: any) => {
          await tx.update(availabilityShifts).set({ status, updatedBy: ctx.user.id }).where(eq(availabilityShifts.id, shift.id));
          await tx.insert(auditLogs).values({ actorUserId: ctx.user.id, action: `${input.status.toUpperCase()}_AVAILABILITY`, details: `Updated ${input.shiftId}.` });
        });
        return { success: true as const };
      }),
    book: protectedProcedure
      .input(z.object({ windowId: z.string().min(1).max(64), startAt: z.string().datetime(), durationMinutes: durationInput }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "client") throw new Error("Only members can book a coach shift.");
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        return db.transaction(async (tx: any) => {
          const shift = await tx.select().from(availabilityShifts).where(eq(availabilityShifts.externalId, input.windowId)).limit(1);
          if (!shift[0]) throw new Error("Availability window not found.");
          await tx.execute(sql`SELECT id FROM availabilityShifts WHERE id = ${shift[0].id} FOR UPDATE`);
          // A Client record lock also serializes bookings across different Coach windows for the same Client.
          await tx.execute(sql`SELECT id FROM users WHERE id = ${ctx.user.id} FOR UPDATE`);
          const startAt = new Date(input.startAt);
          const endAt = ensureBookableInterval(shift[0], startAt, input.durationMinutes);
          const existingClientOverlap = await tx.select({ id: bookings.id }).from(bookings).innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id)).where(and(
            eq(bookings.memberUserId, ctx.user.id), inArray(bookings.status, ["pending", "confirmed"]), lt(timeSlots.startAt, endAt), gt(timeSlots.endAt, startAt),
          )).limit(1);
          if (existingClientOverlap.length) throw new Error("This session overlaps with one of your existing bookings.");
          const overlappingBookings = await tx.select({ id: bookings.id }).from(bookings).innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id)).where(and(
            eq(bookings.availabilityShiftId, shift[0].id), inArray(bookings.status, ["pending", "confirmed"]), lt(timeSlots.startAt, endAt), gt(timeSlots.endAt, startAt),
          ));
          if (overlappingBookings.length >= shift[0].maximumCapacity) throw new Error("That time has reached the coach’s maximum client capacity. Choose another time.");
          const bookingExternalId = `booking-${randomUUID()}`;
          const slotExternalId = `booking-slot-${bookingExternalId}`;
          await tx.insert(timeSlots).values({ externalId: slotExternalId, gymId: shift[0].gymId, coachId: shift[0].coachId, serviceTypeId: shift[0].serviceTypeId, startAt, endAt, maximumCapacity: shift[0].maximumCapacity, bookedCount: 1, status: "Full", room: shift[0].location });
          const slot = await tx.select({ id: timeSlots.id }).from(timeSlots).where(eq(timeSlots.externalId, slotExternalId)).limit(1);
          await tx.insert(bookings).values({ externalId: bookingExternalId, memberUserId: ctx.user.id, timeSlotId: slot[0].id, availabilityShiftId: shift[0].id, status: "confirmed" });
          const booking = await tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.externalId, bookingExternalId)).limit(1);
          const coach = await tx.select({ userId: coaches.userId }).from(coaches).where(eq(coaches.id, shift[0].coachId)).limit(1);
          await tx.insert(notifications).values([
            { userId: ctx.user.id, type: "confirmation", title: "Coach session booked", message: "Your session is confirmed and has been added to your schedule.", relatedBookingId: booking[0].id },
            ...(coach[0]?.userId ? [{ userId: coach[0].userId, type: "confirmation" as const, title: "New client booking", message: "A client booked time in your availability window.", relatedBookingId: booking[0].id }] : []),
          ]);
          await tx.insert(auditLogs).values({ actorUserId: ctx.user.id, action: "BOOK_AVAILABILITY", details: `Booked ${input.windowId} from ${startAt.toISOString()} to ${endAt.toISOString()}.` });
          return { success: true as const, bookingId: bookingExternalId, startAt, endAt, remainingCapacity: shift[0].maximumCapacity - overlappingBookings.length - 1 };
        });
      }),
    cancel: protectedProcedure
      .input(z.object({ bookingId: z.string().min(1).max(64), reason: z.string().trim().max(240).optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const cancellation = await db.transaction(async (tx: any) => {
          await tx.execute(sql`SELECT id FROM bookings WHERE externalId = ${input.bookingId} FOR UPDATE`);
          const record = await tx.select({ booking: bookings, shift: availabilityShifts, clientName: users.name }).from(bookings).innerJoin(availabilityShifts, eq(bookings.availabilityShiftId, availabilityShifts.id)).innerJoin(users, eq(bookings.memberUserId, users.id)).where(eq(bookings.externalId, input.bookingId)).limit(1);
          if (!record[0]) throw new Error("Managed booking not found.");
          const canCancel = record[0].booking.memberUserId === ctx.user.id || ctx.user.role === "admin" || (ctx.user.role === "coach" && (await managedCoachId(tx, ctx.user)) === record[0].shift.coachId);
          if (!canCancel) throw new Error("You cannot cancel this booking.");
          if (record[0].booking.status !== "confirmed") throw new Error("This booking cannot be cancelled.");
          await tx.update(bookings).set({ status: "cancelled", cancellationTime: new Date(), cancellationReason: input.reason }).where(eq(bookings.id, record[0].booking.id));
          await tx.update(timeSlots).set({ status: "Cancelled", bookedCount: 0 }).where(eq(timeSlots.id, record[0].booking.timeSlotId));
          const coach = await tx.select({ userId: coaches.userId }).from(coaches).where(eq(coaches.id, record[0].shift.coachId)).limit(1);
          if (coach[0]?.userId) await tx.insert(notifications).values({ userId: coach[0].userId, type: "cancellation", title: "Client session cancelled", message: `${record[0].clientName ?? "A client"} cancelled a session in your availability window.`, relatedBookingId: record[0].booking.id });
          await tx.insert(auditLogs).values({ actorUserId: ctx.user.id, action: "CANCEL_AVAILABILITY_BOOKING", details: `Cancelled ${input.bookingId}; the availability window remains open.` });
          return { shiftId: record[0].shift.externalId };
        });
        return { success: true as const, releaseRequired: false as const, shiftId: cancellation.shiftId };
      }),
    releaseAfterCancellation: protectedProcedure
      .input(z.object({ shiftId: z.string().min(1).max(64), release: z.enum(["reopen", "block"]) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const shift = await canManageShift(db, ctx.user, input.shiftId);
        if (shift.status !== "cancelled" || new Date(shift.startAt) <= new Date()) throw new Error("Only a future cancelled shift can be released.");
        const status = input.release === "reopen" ? "available" : "blocked" as const;
        await db.transaction(async (tx: any) => {
          await tx.update(availabilityShifts).set({ status, memberUserId: null, bookingId: null, updatedBy: ctx.user.id }).where(eq(availabilityShifts.id, shift.id));
          await tx.update(timeSlots).set({ status: status === "available" ? "Open" : "Blocked", bookedCount: 0 }).where(eq(timeSlots.externalId, `managed-slot-${shift.externalId}`));
          await tx.insert(auditLogs).values({ actorUserId: ctx.user.id, action: "RELEASE_CANCELLED_SHIFT", details: `${input.release} ${input.shiftId}.` });
        });
        return { success: true as const, status };
      }),
    adminList: protectedProcedure
      .input(z.object({ coachId: z.number().int().positive().optional(), status: z.enum(["Available", "Booked", "Blocked", "Completed", "Cancelled", "Expired"]).optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new Error("Admin access is required.");
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const status = input?.status ? input.status.toLowerCase() as "available" | "booked" | "blocked" | "completed" | "cancelled" | "expired" : undefined;
        const conditions = [input?.coachId ? eq(availabilityShifts.coachId, input.coachId) : undefined, status ? eq(availabilityShifts.status, status) : undefined].filter(Boolean) as any[];
        return db.select().from(availabilityShifts).where(conditions.length ? and(...conditions) : undefined);
      }),
  }),
});

export type AppRouter = typeof appRouter;
