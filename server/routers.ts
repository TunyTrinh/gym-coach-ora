import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { bookGymSlot, cancelGymBooking, getGymSnapshot, markGymAttendance } from "./gym-store";
import { createGymRoom, deleteCoachAccount, deleteGymRoom, getAdminRoomSchedule, getAuthorizedCoachIdForUser, getDb, getRoomClosures, grantCoachGoogleAccess, listActiveGyms, listCoachAccounts, listRooms, removeRoomClosure, setCoachGoogleAccess, setRoomClosure, updateGymRoom } from "./db";
import { isValidGoogleEmail, normalizeGoogleEmail } from "./google-authorization";
import { availabilityShifts, auditLogs, bookings, coachClients, coachNotes, coaches, gymRooms, healthMeasurements, notifications, roomClosures, serviceTypes, timeSlots, users } from "../drizzle/schema";
import { and, asc, eq, gt, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { isRoomEligibleForAvailability } from "../shared/room-eligibility";

const availabilityInput = z.object({
  coachId: z.number().int().positive().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  maximumCapacity: z.number().int().min(1).max(12),
  roomId: z.number().int().positive(),
  location: z.string().trim().min(1).max(128),
  note: z.string().trim().max(600).optional(),
});

const durationInput = z.number().int().min(30).max(240).refine(
  (value) => value === 30 || value === 45 || (value >= 60 && value % 15 === 0),
  "Choose 30, 45, or a 15-minute duration from 60 to 240 minutes.",
);

const measurementInput = z.object({
  recordedAt: z.string().datetime(),
  weightKg: z.number().positive().max(500).optional(),
  bodyFatPercentage: z.number().positive().max(100).optional(),
  chestCm: z.number().positive().max(400).optional(),
  waistCm: z.number().positive().max(400).optional(),
  hipsCm: z.number().positive().max(400).optional(),
  armsCm: z.number().positive().max(200).optional(),
  thighsCm: z.number().positive().max(300).optional(),
}).refine((value) => Object.entries(value).some(([key, item]) => key !== "recordedAt" && typeof item === "number"), "Add at least one measurement.");

const measurementScale = (value?: number) => value === undefined ? null : Math.round(value * 10);
const measurementValue = (value: number | null) => value === null ? undefined : value / 10;

function localDateTime(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const value = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(value.getTime()) ? null : value;
}

function localDayKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function assertRoomOpenForInterval(db: any, roomId: number, startAt: Date, endAt: Date) {
  const closureDates = [...new Set([localDayKey(startAt), localDayKey(new Date(endAt.getTime() - 1))])];
  const closure = await db.select({ closureDate: roomClosures.closureDate }).from(roomClosures).where(and(
    eq(roomClosures.roomId, roomId),
    inArray(roomClosures.closureDate, closureDates),
  )).limit(1);
  if (closure[0]) throw new Error("This room is temporarily closed for the selected date.");
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
  const ownCoachId = await getAuthorizedCoachIdForUser(db, actor.id);
  if (!ownCoachId) throw new Error("Your Coach access is inactive or revoked.");
  return ownCoachId;
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
  catalog: router({
    coaches: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      return db.select({
        id: coaches.id,
        fullName: coaches.fullName,
        specialty: coaches.specialty,
        gymId: coaches.gymId,
      }).from(coaches).where(eq(coaches.active, true)).orderBy(asc(coaches.fullName));
    }),
    services: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      return db.select({
        id: serviceTypes.id,
        name: serviceTypes.name,
        description: serviceTypes.description,
        durationMinutes: serviceTypes.durationMinutes,
        cancellationWindowMinutes: serviceTypes.cancellationWindowMinutes,
      }).from(serviceTypes).where(eq(serviceTypes.active, true)).orderBy(asc(serviceTypes.name));
    }),
  }),
  member: router({
    schedule: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "client") throw new Error("Member access is required to view this schedule.");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      return db.select({
        id: bookings.externalId,
        status: bookings.status,
        bookingTime: bookings.bookingTime,
        cancellationTime: bookings.cancellationTime,
        cancellationReason: bookings.cancellationReason,
        checkInTime: bookings.checkInTime,
        startAt: timeSlots.startAt,
        endAt: timeSlots.endAt,
        room: timeSlots.room,
        maximumCapacity: timeSlots.maximumCapacity,
        coachName: coaches.fullName,
        serviceName: serviceTypes.name,
        availabilityId: availabilityShifts.externalId,
      }).from(bookings)
        .innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id))
        .leftJoin(coaches, eq(timeSlots.coachId, coaches.id))
        .innerJoin(serviceTypes, eq(timeSlots.serviceTypeId, serviceTypes.id))
        .leftJoin(availabilityShifts, eq(bookings.availabilityShiftId, availabilityShifts.id))
        .where(eq(bookings.memberUserId, ctx.user.id))
        .orderBy(asc(timeSlots.startAt));
    }),
    measurements: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "client") throw new Error("Only clients can view private health progress.");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const records = await db.select().from(healthMeasurements).where(eq(healthMeasurements.userId, ctx.user.id)).orderBy(asc(healthMeasurements.measurementDate));
      return records.map((record) => ({
        id: String(record.id),
        recordedAt: record.measurementDate,
        weightKg: measurementValue(record.weight),
        bodyFatPercentage: measurementValue(record.bodyFat),
        chestCm: measurementValue(record.chest),
        waistCm: measurementValue(record.waist),
        hipsCm: measurementValue(record.hips),
        armsCm: measurementValue(record.arms),
        thighsCm: measurementValue(record.thighs),
      }));
    }),
    saveMeasurement: protectedProcedure.input(measurementInput).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "client") throw new Error("Only clients can save private health progress.");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.insert(healthMeasurements).values({
        userId: ctx.user.id,
        recordedBy: ctx.user.id,
        measurementDate: new Date(input.recordedAt),
        weight: measurementScale(input.weightKg),
        bodyFat: measurementScale(input.bodyFatPercentage),
        chest: measurementScale(input.chestCm),
        waist: measurementScale(input.waistCm),
        hips: measurementScale(input.hipsCm),
        arms: measurementScale(input.armsCm),
        thighs: measurementScale(input.thighsCm),
      });
      return { success: true as const };
    }),
    notifications: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      return db.select({
        id: notifications.id,
        type: notifications.type,
        title: notifications.title,
        message: notifications.message,
        read: notifications.read,
        relatedBookingId: bookings.externalId,
        priority: notifications.priority,
        createdAt: notifications.createdAt,
      }).from(notifications)
        .leftJoin(bookings, eq(notifications.relatedBookingId, bookings.id))
        .where(eq(notifications.userId, ctx.user.id))
        .orderBy(asc(notifications.createdAt));
    }),
    markNotificationRead: protectedProcedure.input(z.object({ notificationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(notifications).set({ read: true }).where(and(eq(notifications.id, input.notificationId), eq(notifications.userId, ctx.user.id)));
      return { success: true as const };
    }),
    markAllNotificationsRead: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(notifications).set({ read: true }).where(eq(notifications.userId, ctx.user.id));
      return { success: true as const };
    }),
  }),
  gym: router({
    snapshot: protectedProcedure.query(() => getGymSnapshot()),
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
    listCoachAccounts: adminProcedure.query(() => listCoachAccounts()),
    listActiveGyms: adminProcedure.query(() => listActiveGyms()),
    listRooms: adminProcedure.query(() => listRooms()),
    createRoom: adminProcedure
      .input(z.object({ gymId: z.number().int().positive().optional(), name: z.string().trim().min(2).max(128), address: z.string().trim().min(2).max(2_000), description: z.string().trim().min(2).max(4_000), maximumCapacity: z.number().int().min(1).max(500) }))
      .mutation(({ ctx, input }) => createGymRoom({ ...input, actorUserId: ctx.user.id })),
    updateRoom: adminProcedure
      .input(z.object({ roomId: z.number().int().positive(), gymId: z.number().int().positive(), name: z.string().trim().min(2).max(128), address: z.string().trim().min(2).max(2_000), description: z.string().trim().min(2).max(4_000), maximumCapacity: z.number().int().min(1).max(500), active: z.boolean() }))
      .mutation(({ ctx, input }) => updateGymRoom({ ...input, actorUserId: ctx.user.id })),
    deleteRoom: adminProcedure
      .input(z.object({ roomId: z.number().int().positive(), confirmationName: z.string().trim().min(1).max(128) }))
      .mutation(({ ctx, input }) => deleteGymRoom({ ...input, actorUserId: ctx.user.id })),
    roomSchedule: adminProcedure
      .input(z.object({ roomId: z.number().int().positive(), from: z.string().datetime(), to: z.string().datetime() }))
      .query(({ input }) => getAdminRoomSchedule({ roomId: input.roomId, from: new Date(input.from), to: new Date(input.to) })),
    roomClosures: adminProcedure
      .input(z.object({ roomId: z.number().int().positive() }))
      .query(({ input }) => getRoomClosures(input.roomId)),
    setRoomClosure: adminProcedure
      .input(z.object({ roomId: z.number().int().positive(), closureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().max(600).optional() }))
      .mutation(({ ctx, input }) => setRoomClosure({ ...input, actorUserId: ctx.user.id })),
    removeRoomClosure: adminProcedure
      .input(z.object({ roomId: z.number().int().positive(), closureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .mutation(({ ctx, input }) => removeRoomClosure({ ...input, actorUserId: ctx.user.id })),
    authorizeCoach: adminProcedure
      .input(z.object({
        email: z.string().trim().min(3).max(320),
        fullName: z.string().trim().min(2).max(255),
        specialty: z.string().trim().min(2).max(255),
        gymId: z.number().int().positive().nullable().optional(),
        coachId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const email = normalizeGoogleEmail(input.email);
        if (!isValidGoogleEmail(email)) throw new Error("Enter a valid Google email address.");
        return grantCoachGoogleAccess({ ...input, email, actorUserId: ctx.user.id });
      }),
    changeCoachAccess: adminProcedure
      .input(z.object({ coachId: z.number().int().positive(), status: z.enum(["revoked", "disabled"]) }))
      .mutation(({ ctx, input }) => setCoachGoogleAccess({ ...input, actorUserId: ctx.user.id })),
    deleteCoach: adminProcedure
      .input(z.object({ coachId: z.number().int().positive(), confirmationName: z.string().trim().min(1).max(255) }))
      .mutation(({ ctx, input }) => deleteCoachAccount({ ...input, actorUserId: ctx.user.id })),
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
    rooms: protectedProcedure.input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).optional()).query(async ({ ctx, input }) => {
      if (ctx.user.role !== "coach" && ctx.user.role !== "admin") throw new Error("Coach access is required to view rooms.");
      const allRooms = await listRooms();
      const requestedDate = input?.date ?? localDayKey(new Date());
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const roomIds = allRooms.map((room) => room.id);
      const closures = roomIds.length ? await db.select({ roomId: roomClosures.roomId }).from(roomClosures).where(and(eq(roomClosures.closureDate, requestedDate), inArray(roomClosures.roomId, roomIds))) : [];
      const closedRoomIds = new Set(closures.map((closure) => closure.roomId));
      const activeRooms = allRooms.filter((room) => room.active);
      const eligibleRooms = activeRooms.filter((room) => isRoomEligibleForAvailability({ active: room.active, closed: closedRoomIds.has(room.id) }));
      const defaultGymId = ctx.user.role === "coach" ? (await (async () => {
        const coachId = await getAuthorizedCoachIdForUser(db, ctx.user.id);
        if (!coachId) throw new Error("Your Coach access is inactive or revoked.");
        const coach = await db.select({ gymId: coaches.gymId }).from(coaches).where(eq(coaches.id, coachId)).limit(1);
        return coach[0]?.gymId ?? null;
      })()) : null;
      return {
        rooms: eligibleRooms.map((room) => ({ ...room, defaultGym: defaultGymId !== null && room.gymId === defaultGymId })),
        totalRooms: allRooms.length,
        activeRoomCount: activeRooms.length,
        closedRoomCount: activeRooms.filter((room) => closedRoomIds.has(room.id)).length,
        requestedDate,
      };
    }),
    mine: protectedProcedure
      .input(z.object({ coachId: z.number().int().positive().optional(), from: z.string().datetime().optional(), to: z.string().datetime().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const coachId = await managedCoachId(db, ctx.user, input?.coachId);
        const from = input?.from ? new Date(input.from) : new Date();
        const to = input?.to ? new Date(input.to) : new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
        const windows = await db.select().from(availabilityShifts).where(and(eq(availabilityShifts.coachId, coachId), lt(availabilityShifts.startAt, to), gt(availabilityShifts.endAt, from)));
        if (!windows.length) return [];
        const counts = await db.select({ shiftId: bookings.availabilityShiftId, count: sql<number>`count(*)` })
          .from(bookings)
          .where(and(inArray(bookings.availabilityShiftId, windows.map((window) => window.id)), inArray(bookings.status, ["pending", "confirmed"])))
          .groupBy(bookings.availabilityShiftId);
        const countByShiftId = new Map(counts.map((count) => [count.shiftId, Number(count.count)]));
        return windows.map((window) => ({ ...window, bookedCount: countByShiftId.get(window.id) ?? 0 }));
      }),
    bookable: protectedProcedure
      .input(z.object({ coachId: z.number().int().positive(), dateStart: z.string().datetime(), dateEnd: z.string().datetime() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "client") throw new Error("Member access is required to view bookable shifts.");
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const windows = await db.select({
          id: availabilityShifts.externalId,
          coachId: availabilityShifts.coachId,
          serviceTypeId: availabilityShifts.serviceTypeId,
          roomId: availabilityShifts.roomId,
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
        const roomIds = [...new Set(windows.flatMap((window) => window.roomId ? [window.roomId] : []))];
        if (!roomIds.length) return windows;
        const startDay = localDayKey(new Date(input.dateStart));
        const endDay = localDayKey(new Date(new Date(input.dateEnd).getTime() - 1));
        const closures = await db.select({ roomId: roomClosures.roomId }).from(roomClosures).where(and(
          inArray(roomClosures.roomId, roomIds),
          gte(roomClosures.closureDate, startDay),
          lte(roomClosures.closureDate, endDay),
        ));
        const closedRoomIds = new Set(closures.map((closure) => closure.roomId));
        return windows.filter((window) => !window.roomId || !closedRoomIds.has(window.roomId));
      }),
    bookableAll: protectedProcedure
      .input(z.object({ dateStart: z.string().datetime(), dateEnd: z.string().datetime() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "client") throw new Error("Member access is required to view bookable shifts.");
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const windows = await db.select({
          id: availabilityShifts.externalId,
          coachId: availabilityShifts.coachId,
          coachName: coaches.fullName,
          coachSpecialty: coaches.specialty,
          serviceTypeId: availabilityShifts.serviceTypeId,
          roomId: availabilityShifts.roomId,
          startAt: availabilityShifts.startAt,
          endAt: availabilityShifts.endAt,
          location: availabilityShifts.location,
          status: availabilityShifts.status,
          maximumCapacity: availabilityShifts.maximumCapacity,
          note: availabilityShifts.note,
        }).from(availabilityShifts)
          .innerJoin(coaches, eq(availabilityShifts.coachId, coaches.id))
          .where(and(
            eq(availabilityShifts.status, "available"),
            eq(coaches.active, true),
            lt(availabilityShifts.startAt, new Date(input.dateEnd)),
            gt(availabilityShifts.endAt, new Date(input.dateStart)),
            gt(availabilityShifts.endAt, new Date()),
          ));
        const roomIds = [...new Set(windows.flatMap((window) => window.roomId ? [window.roomId] : []))];
        if (!roomIds.length) return windows;
        const startDay = localDayKey(new Date(input.dateStart));
        const endDay = localDayKey(new Date(new Date(input.dateEnd).getTime() - 1));
        const closures = await db.select({ roomId: roomClosures.roomId }).from(roomClosures).where(and(
          inArray(roomClosures.roomId, roomIds),
          gte(roomClosures.closureDate, startDay),
          lte(roomClosures.closureDate, endDay),
        ));
        const closedRoomIds = new Set(closures.map((closure) => closure.roomId));
        return windows.filter((window) => !window.roomId || !closedRoomIds.has(window.roomId));
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
        if (window[0].roomId) await assertRoomOpenForInterval(db, window[0].roomId, startAt, endAt);
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
        const room = await db.select().from(gymRooms).where(and(eq(gymRooms.id, input.roomId), eq(gymRooms.active, true))).limit(1);
        if (!room[0]) throw new Error("Select an active room for this availability.");
        await assertRoomOpenForInterval(db, room[0].id, startAt, endAt);
        if (input.maximumCapacity > room[0].maximumCapacity) throw new Error("This availability exceeds the room’s maximum client capacity.");
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
          await tx.insert(availabilityShifts).values({ externalId: windowId, gymId: room[0].gymId, coachId, roomId: room[0].id, serviceTypeId: defaultService[0].id, startAt, endAt, maximumCapacity: input.maximumCapacity, location: room[0].name, note: input.note, status: "available", createdBy: ctx.user.id });
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
          if (shift[0].roomId) {
            const room = await tx.select({ id: gymRooms.id, maximumCapacity: gymRooms.maximumCapacity, active: gymRooms.active }).from(gymRooms).where(eq(gymRooms.id, shift[0].roomId)).limit(1);
            if (!room[0] || !room[0].active) throw new Error("This room is no longer available for booking.");
            await tx.execute(sql`SELECT id FROM gymRooms WHERE id = ${room[0].id} FOR UPDATE`);
            await assertRoomOpenForInterval(tx, room[0].id, startAt, endAt);
            const roomOverlaps = await tx.select({ id: bookings.id }).from(bookings).innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id)).where(and(eq(timeSlots.roomId, room[0].id), inArray(bookings.status, ["pending", "confirmed"]), lt(timeSlots.startAt, endAt), gt(timeSlots.endAt, startAt)));
            if (roomOverlaps.length >= room[0].maximumCapacity) throw new Error("That room has reached its maximum client capacity. Choose another time.");
          }
          const bookingExternalId = `booking-${randomUUID()}`;
          const slotExternalId = `booking-slot-${bookingExternalId}`;
          await tx.insert(timeSlots).values({ externalId: slotExternalId, gymId: shift[0].gymId, coachId: shift[0].coachId, roomId: shift[0].roomId, serviceTypeId: shift[0].serviceTypeId, startAt, endAt, maximumCapacity: shift[0].maximumCapacity, bookedCount: 1, status: "Full", room: shift[0].location });
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
    checkIn: protectedProcedure
      .input(z.object({ bookingId: z.string().min(1).max(64) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const record = await db.select({
          bookingId: bookings.id,
          memberUserId: bookings.memberUserId,
          status: bookings.status,
          checkInTime: bookings.checkInTime,
          startAt: timeSlots.startAt,
        }).from(bookings).innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id)).where(eq(bookings.externalId, input.bookingId)).limit(1);
        if (!record[0] || record[0].memberUserId !== ctx.user.id) throw new Error("Booking not found.");
        if (record[0].status !== "confirmed") throw new Error("Only confirmed bookings can be checked in.");
        const minutesFromStart = (Date.now() - record[0].startAt.getTime()) / 60_000;
        if (minutesFromStart < -30 || minutesFromStart > 30) throw new Error("Check-in opens 30 minutes before your session and closes 30 minutes after it starts.");
        if (!record[0].checkInTime) await db.update(bookings).set({ checkInTime: new Date(), checkedInBy: ctx.user.id }).where(eq(bookings.id, record[0].bookingId));
        return { success: true as const };
      }),
    markAttendance: protectedProcedure
      .input(z.object({ bookingId: z.string().min(1).max(64), status: z.enum(["completed", "no_show"]) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "coach" && ctx.user.role !== "admin") throw new Error("Coach access is required to record attendance.");
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const record = await db.select({ bookingId: bookings.id, status: bookings.status, shiftCoachId: availabilityShifts.coachId })
          .from(bookings).innerJoin(availabilityShifts, eq(bookings.availabilityShiftId, availabilityShifts.id)).where(eq(bookings.externalId, input.bookingId)).limit(1);
        if (!record[0]) throw new Error("Managed booking not found.");
        if (ctx.user.role === "coach" && (await managedCoachId(db, ctx.user)) !== record[0].shiftCoachId) throw new Error("You can record attendance only for your own sessions.");
        if (record[0].status !== "confirmed" && record[0].status !== "pending") throw new Error("This booking already has an attendance result.");
        await db.update(bookings).set({ status: input.status, checkInTime: input.status === "completed" ? new Date() : undefined, checkedInBy: input.status === "completed" ? ctx.user.id : undefined }).where(eq(bookings.id, record[0].bookingId));
        await db.insert(auditLogs).values({ actorUserId: ctx.user.id, action: input.status === "completed" ? "COMPLETE_BOOKING" : "MARK_BOOKING_NO_SHOW", details: `Recorded ${input.status} for ${input.bookingId}.` });
        return { success: true as const };
      }),
    coachSchedule: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "coach" && ctx.user.role !== "admin") throw new Error("Coach access is required to view this schedule.");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const coachId = await managedCoachId(db, ctx.user, undefined);
      return db.select({
        id: bookings.externalId,
        status: bookings.status,
        bookingTime: bookings.bookingTime,
        cancellationTime: bookings.cancellationTime,
        cancellationReason: bookings.cancellationReason,
        checkInTime: bookings.checkInTime,
        clientId: users.id,
        clientName: users.name,
        startAt: timeSlots.startAt,
        endAt: timeSlots.endAt,
        room: timeSlots.room,
        maximumCapacity: timeSlots.maximumCapacity,
        serviceName: serviceTypes.name,
        availabilityId: availabilityShifts.externalId,
        availabilityCapacity: availabilityShifts.maximumCapacity,
      }).from(bookings)
        .innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id))
        .innerJoin(users, eq(bookings.memberUserId, users.id))
        .innerJoin(serviceTypes, eq(timeSlots.serviceTypeId, serviceTypes.id))
        .innerJoin(availabilityShifts, eq(bookings.availabilityShiftId, availabilityShifts.id))
        .where(eq(availabilityShifts.coachId, coachId))
        .orderBy(asc(timeSlots.startAt));
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
