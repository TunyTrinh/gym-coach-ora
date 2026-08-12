import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { bookGymSlot, cancelGymBooking, getGymSnapshot, markGymAttendance } from "./gym-store";
import { getDb } from "./db";
import { availabilityShifts, auditLogs, bookings, coachClients, coachNotes, coaches, notifications, timeSlots, users } from "../drizzle/schema";
import { and, eq, gt, gte, inArray, lt } from "drizzle-orm";
import { generateAvailabilityIntervals } from "../lib/availability-shifts";

const availabilityInput = z.object({
  coachId: z.number().int().positive().optional(),
  serviceTypeId: z.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90)]),
  breakMinutes: z.number().int().min(0).max(120).default(0),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  location: z.string().trim().min(1).max(128),
  note: z.string().trim().max(600).optional(),
});

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
      .input(z.object({ userId: z.number(), role: z.enum(["user", "coach", "admin"]) }))
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
      .input(z.object({ clientUserId: z.number(), note: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Coach access required.");
        }
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        
        const coachRecord = await db.select().from(coaches).where(eq(coaches.userId, ctx.user.id)).limit(1);
        const coach = coachRecord[0];
        
        await db.insert(coachNotes).values({
          coachId: coach ? coach.id : 0,
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
        return db.select().from(availabilityShifts).where(and(eq(availabilityShifts.coachId, coachId), gte(availabilityShifts.startAt, from), lt(availabilityShifts.startAt, to)));
      }),
    bookable: protectedProcedure
      .input(z.object({ coachId: z.number().int().positive(), dateStart: z.string().datetime(), dateEnd: z.string().datetime() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "user") throw new Error("Member access is required to view bookable shifts.");
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
        }).from(availabilityShifts).where(and(
          eq(availabilityShifts.coachId, input.coachId),
          eq(availabilityShifts.status, "Available"),
          gte(availabilityShifts.startAt, new Date(input.dateStart)),
          lt(availabilityShifts.startAt, new Date(input.dateEnd)),
          gt(availabilityShifts.startAt, new Date()),
        ));
      }),
    create: protectedProcedure
      .input(availabilityInput)
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const coachId = await managedCoachId(db, ctx.user, input.coachId);
        const recurrenceGroupId = `availability-${Date.now().toString(36)}-${coachId}`;
        const intervals = generateAvailabilityIntervals({ ...input, coachId: String(coachId), recurrenceGroupId });
        if (!intervals.length) throw new Error("Choose an end time after the start time with at least one complete shift.");
        const now = new Date();
        if (intervals.some((interval) => new Date(interval.start) <= now)) throw new Error("Availability must be in the future.");
        const firstStart = new Date(intervals[0].start);
        const lastEnd = new Date(intervals[intervals.length - 1].end);
        const conflicts = await db.select({ id: availabilityShifts.id }).from(availabilityShifts).where(and(
          eq(availabilityShifts.coachId, coachId),
          lt(availabilityShifts.startAt, lastEnd),
          gt(availabilityShifts.endAt, firstStart),
          inArray(availabilityShifts.status, ["Available", "Booked", "Blocked"]),
        )).limit(1);
        if (conflicts.length) throw new Error("This availability overlaps an existing shift or blocked period.");
        await db.transaction(async (tx: any) => {
          for (let index = 0; index < intervals.length; index += 1) {
            const interval = intervals[index];
            const shiftId = `${recurrenceGroupId}-${index + 1}`;
            await tx.insert(availabilityShifts).values({
              externalId: shiftId,
              gymId: 1,
              coachId,
              serviceTypeId: input.serviceTypeId,
              startAt: new Date(interval.start),
              endAt: new Date(interval.end),
              location: input.location,
              note: input.note,
              status: "Available",
              createdBy: ctx.user.id,
              recurrenceGroupId,
            });
            await tx.insert(timeSlots).values({
              externalId: `managed-slot-${shiftId}`,
              gymId: 1,
              coachId,
              serviceTypeId: input.serviceTypeId,
              startAt: new Date(interval.start),
              endAt: new Date(interval.end),
              maximumCapacity: 1,
              bookedCount: 0,
              status: "Open",
              room: input.location,
            });
          }
          await tx.insert(auditLogs).values({ actorUserId: ctx.user.id, action: "CREATE_AVAILABILITY", details: `Created ${intervals.length} managed availability shifts for coach ${coachId}.` });
        });
        return { success: true as const, recurrenceGroupId, createdCount: intervals.length };
      }),
    setStatus: protectedProcedure
      .input(z.object({ shiftId: z.string().min(1).max(64), status: z.enum(["Blocked", "Available"]) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const shift = await canManageShift(db, ctx.user, input.shiftId);
        if (new Date(shift.startAt) <= new Date() || shift.status === "Booked" || shift.status === "Completed") throw new Error("Only future unbooked shifts can be changed.");
        await db.transaction(async (tx: any) => {
          await tx.update(availabilityShifts).set({ status: input.status, updatedBy: ctx.user.id }).where(eq(availabilityShifts.id, shift.id));
          await tx.update(timeSlots).set({ status: input.status === "Blocked" ? "Blocked" : "Open" }).where(eq(timeSlots.externalId, `managed-slot-${shift.externalId}`));
          await tx.insert(auditLogs).values({ actorUserId: ctx.user.id, action: `${input.status.toUpperCase()}_AVAILABILITY`, details: `Updated ${input.shiftId}.` });
        });
        return { success: true as const };
      }),
    book: protectedProcedure
      .input(z.object({ shiftId: z.string().min(1).max(64) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "user") throw new Error("Only members can book a coach shift.");
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        return db.transaction(async (tx: any) => {
          const updated = await tx.update(availabilityShifts).set({ status: "Booked", memberUserId: ctx.user.id, updatedBy: ctx.user.id }).where(and(
            eq(availabilityShifts.externalId, input.shiftId),
            eq(availabilityShifts.status, "Available"),
            gt(availabilityShifts.startAt, new Date()),
          ));
          if (!updated[0]?.affectedRows) throw new Error("That shift was just booked or is no longer available.");
          const shift = await tx.select().from(availabilityShifts).where(eq(availabilityShifts.externalId, input.shiftId)).limit(1);
          const slot = await tx.select({ id: timeSlots.id }).from(timeSlots).where(eq(timeSlots.externalId, `managed-slot-${input.shiftId}`)).limit(1);
          if (!shift[0] || !slot[0]) throw new Error("The managed booking slot is unavailable.");
          const bookingExternalId = `booking-${input.shiftId}-${Date.now().toString(36)}`;
          await tx.insert(bookings).values({ externalId: bookingExternalId, memberUserId: ctx.user.id, timeSlotId: slot[0].id, availabilityShiftId: shift[0].id, status: "Confirmed" });
          const booking = await tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.externalId, bookingExternalId)).limit(1);
          await tx.update(availabilityShifts).set({ bookingId: booking[0].id }).where(eq(availabilityShifts.id, shift[0].id));
          await tx.update(timeSlots).set({ bookedCount: 1, status: "Full" }).where(eq(timeSlots.id, slot[0].id));
          const coach = await tx.select({ userId: coaches.userId }).from(coaches).where(eq(coaches.id, shift[0].coachId)).limit(1);
          await tx.insert(notifications).values([
            { userId: ctx.user.id, type: "confirmation", title: "Coach shift booked", message: "Your coach shift is confirmed and has been added to your schedule.", relatedBookingId: booking[0].id },
            ...(coach[0] ? [{ userId: coach[0].userId, type: "confirmation" as const, title: "New client booking", message: "A client booked one of your available shifts.", relatedBookingId: booking[0].id }] : []),
          ]);
          await tx.insert(auditLogs).values({ actorUserId: ctx.user.id, action: "BOOK_AVAILABILITY", details: `Booked ${input.shiftId}.` });
          return { success: true as const, bookingId: bookingExternalId };
        });
      }),
    cancel: protectedProcedure
      .input(z.object({ bookingId: z.string().min(1).max(64), reason: z.string().trim().max(240).optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const record = await db.select({ booking: bookings, shift: availabilityShifts }).from(bookings).innerJoin(availabilityShifts, eq(bookings.availabilityShiftId, availabilityShifts.id)).where(eq(bookings.externalId, input.bookingId)).limit(1);
        if (!record[0]) throw new Error("Managed booking not found.");
        const canCancel = record[0].booking.memberUserId === ctx.user.id || ctx.user.role === "admin" || (ctx.user.role === "coach" && (await managedCoachId(db, ctx.user)) === record[0].shift.coachId);
        if (!canCancel) throw new Error("You cannot cancel this booking.");
        if (record[0].booking.status !== "Confirmed") throw new Error("This booking cannot be cancelled.");
        await db.transaction(async (tx: any) => {
          await tx.update(bookings).set({ status: "Cancelled", cancellationTime: new Date(), cancellationReason: input.reason }).where(eq(bookings.id, record[0].booking.id));
          await tx.update(availabilityShifts).set({ status: "Cancelled", updatedBy: ctx.user.id }).where(eq(availabilityShifts.id, record[0].shift.id));
          await tx.update(timeSlots).set({ status: "Cancelled", bookedCount: 0 }).where(eq(timeSlots.externalId, `managed-slot-${record[0].shift.externalId}`));
          await tx.insert(auditLogs).values({ actorUserId: ctx.user.id, action: "CANCEL_AVAILABILITY_BOOKING", details: `Cancelled ${input.bookingId}; coach release decision required.` });
        });
        return { success: true as const, releaseRequired: true as const, shiftId: record[0].shift.externalId };
      }),
    releaseAfterCancellation: protectedProcedure
      .input(z.object({ shiftId: z.string().min(1).max(64), release: z.enum(["reopen", "block"]) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const shift = await canManageShift(db, ctx.user, input.shiftId);
        if (shift.status !== "Cancelled" || new Date(shift.startAt) <= new Date()) throw new Error("Only a future cancelled shift can be released.");
        const status = input.release === "reopen" ? "Available" : "Blocked" as const;
        await db.transaction(async (tx: any) => {
          await tx.update(availabilityShifts).set({ status, memberUserId: null, bookingId: null, updatedBy: ctx.user.id }).where(eq(availabilityShifts.id, shift.id));
          await tx.update(timeSlots).set({ status: status === "Available" ? "Open" : "Blocked", bookedCount: 0 }).where(eq(timeSlots.externalId, `managed-slot-${shift.externalId}`));
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
        const conditions = [input?.coachId ? eq(availabilityShifts.coachId, input.coachId) : undefined, input?.status ? eq(availabilityShifts.status, input.status) : undefined].filter(Boolean) as any[];
        return db.select().from(availabilityShifts).where(conditions.length ? and(...conditions) : undefined);
      }),
  }),
});

export type AppRouter = typeof appRouter;
