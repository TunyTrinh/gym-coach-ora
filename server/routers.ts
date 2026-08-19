import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, clientProcedure, coachOrAdminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createGymRoom, deleteCoachAccount, deleteGymRoom, getAdminRoomSchedule, getAuthorizedCoachIdForUser, getDb, getRoomClosures, grantCoachGoogleAccess, listActiveGyms, listCoachAccounts, listRooms, previewRoomChange, removeRoomClosure, setCoachGoogleAccess, setRoomClosure, updateGymRoom } from "./db";
import { isValidGoogleEmail, normalizeGoogleEmail } from "./google-authorization";
import { availabilityShifts, auditLogs, bookings, coachAuthorizations, coachNotes, coaches, gymRooms, gyms, healthMeasurements, notifications, roomClosures, timeSlots, users } from "../drizzle/schema";
import { and, asc, eq, gt, gte, inArray, lt, lte, ne, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { buildAvailabilityRoomChoices } from "../shared/availability-room-collection";
import { addCalendarDays, gymDateKey, gymDayBounds, gymLocalDateTime } from "../shared/business-time";
import { evaluateRoomInterval, maximumConcurrentOccupancy } from "../shared/room-interval-eligibility";

const availabilityInput = z.object({
  coachId: z.number().int().positive().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  maximumCapacity: z.number().int().min(1).max(12),
  roomId: z.number().int().positive(),
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

type SchedulerReadTiming = { name: string; durationMs: number; rows: number };

async function measureSchedulerRead<T>(timings: SchedulerReadTiming[] | null, name: string, read: () => Promise<T>) {
  if (!timings) return read();
  const startedAt = Date.now();
  const result = await read();
  timings.push({ name, durationMs: Date.now() - startedAt, rows: Array.isArray(result) ? result.length : 1 });
  return result;
}

async function roomEligibilityForInterval(db: any, roomId: number, startAt: Date, endAt: Date) {
  const room = await db.select({
    id: gymRooms.id,
    gymId: gymRooms.gymId,
    name: gymRooms.name,
    active: gymRooms.active,
    openingTime: gymRooms.openingTime,
    closingTime: gymRooms.closingTime,
    maximumCapacity: gymRooms.maximumCapacity,
    timeZone: gyms.timezone,
  }).from(gymRooms).innerJoin(gyms, eq(gymRooms.gymId, gyms.id)).where(eq(gymRooms.id, roomId)).limit(1);
  if (!room[0]) throw new Error("Room not found.");
  const closureDate = gymDateKey(startAt, room[0].timeZone);
  const [closure, occupiedIntervals] = await Promise.all([
    db.select({ closureDate: roomClosures.closureDate, reason: roomClosures.reason }).from(roomClosures).where(and(eq(roomClosures.roomId, roomId), eq(roomClosures.closureDate, closureDate))).limit(1),
    db.select({ startAt: timeSlots.startAt, endAt: timeSlots.endAt }).from(bookings)
      .innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id))
      .leftJoin(availabilityShifts, eq(bookings.availabilityShiftId, availabilityShifts.id))
      .where(and(or(eq(timeSlots.roomId, roomId), eq(availabilityShifts.roomId, roomId), eq(availabilityShifts.location, room[0].name)), inArray(bookings.status, ["pending", "confirmed"]), lt(timeSlots.startAt, endAt), gt(timeSlots.endAt, startAt))),
  ]);
  const eligibility = evaluateRoomInterval({ ...room[0], startAt, endAt, closure: closure[0] ?? null, occupiedIntervals });
  return { room: room[0], eligibility, occupiedIntervals };
}

function assertEligibleRoom(result: Awaited<ReturnType<typeof roomEligibilityForInterval>>) {
  if (result.eligibility.status === "available") return result;
  if (result.eligibility.reason === "inactive") throw new Error("This room is inactive.");
  if (result.eligibility.reason === "temporarily_closed") throw new Error(`This room is temporarily closed${result.eligibility.closure?.reason ? `: ${result.eligibility.closure.reason}` : "."}`);
  if (result.eligibility.reason === "full") throw new Error("That room has reached its maximum client capacity. Choose another time.");
  throw new Error("Your complete booking must fit inside the room’s opening hours in the gym time zone.");
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
  const activeBooking = await db.select({ id: bookings.id }).from(bookings)
    .innerJoin(availabilityShifts, eq(bookings.availabilityShiftId, availabilityShifts.id))
    .where(and(
      eq(availabilityShifts.coachId, coachId),
      eq(bookings.memberUserId, clientUserId),
      inArray(bookings.status, ["pending", "confirmed"]),
    )).limit(1);
  if (!activeBooking[0]) throw new Error("An active booking relationship is required for this Client.");
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
  }),
  member: router({
    schedule: clientProcedure.query(async ({ ctx }) => {
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
        availabilityId: availabilityShifts.externalId,
        }).from(bookings)
        .innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id))
        .leftJoin(coaches, eq(timeSlots.coachId, coaches.id))
        .leftJoin(availabilityShifts, eq(bookings.availabilityShiftId, availabilityShifts.id))
        .where(eq(bookings.memberUserId, ctx.user.id))
        .orderBy(asc(timeSlots.startAt));
    }),
    measurements: clientProcedure.query(async ({ ctx }) => {
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
    saveMeasurement: clientProcedure.input(measurementInput).mutation(async ({ ctx, input }) => {
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
  admin: router({
    listUsers: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      return db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        loginMethod: users.loginMethod,
        role: users.role,
        lastSignedIn: users.lastSignedIn,
        createdAt: users.createdAt,
      }).from(users).orderBy(asc(users.name));
    }),
    auditLogs: adminProcedure
      .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        return db.select().from(auditLogs).orderBy(sql`${auditLogs.createdAt} desc`).limit(input?.limit ?? 100);
      }),
    listCoachAccounts: adminProcedure.query(() => listCoachAccounts()),
    listActiveGyms: adminProcedure.query(() => listActiveGyms()),
    listRooms: adminProcedure.query(() => listRooms()),
    createRoom: adminProcedure
      .input(z.object({ gymId: z.number().int().positive().optional(), name: z.string().trim().min(2).max(128), address: z.string().trim().min(2).max(2_000), description: z.string().trim().min(2).max(4_000), maximumCapacity: z.number().int().min(1).max(500), openingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("00:00"), closingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("23:59") }))
      .mutation(({ ctx, input }) => createGymRoom({ ...input, actorUserId: ctx.user.id })),
    updateRoom: adminProcedure
      .input(z.object({ roomId: z.number().int().positive(), gymId: z.number().int().positive(), name: z.string().trim().min(2).max(128), address: z.string().trim().min(2).max(2_000), description: z.string().trim().min(2).max(4_000), maximumCapacity: z.number().int().min(1).max(500), openingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), closingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), active: z.boolean(), confirmedAffectedBookingIds: z.array(z.string().min(1).max(64)).default([]) }))
      .mutation(({ ctx, input }) => updateGymRoom({ ...input, actorUserId: ctx.user.id })),
    previewRoomChange: adminProcedure
      .input(z.object({ roomId: z.number().int().positive(), action: z.enum(["deactivate", "delete", "closure"]), closureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }))
      .query(({ input }) => previewRoomChange(input)),
    deleteRoom: adminProcedure
      .input(z.object({ roomId: z.number().int().positive(), confirmationName: z.string().trim().min(1).max(128), confirmedAffectedBookingIds: z.array(z.string().min(1).max(64)) }))
      .mutation(({ ctx, input }) => deleteGymRoom({ ...input, actorUserId: ctx.user.id })),
    roomSchedule: adminProcedure
      .input(z.object({ roomId: z.number().int().positive(), from: z.string().datetime(), to: z.string().datetime() }))
      .query(({ input }) => getAdminRoomSchedule({ roomId: input.roomId, from: new Date(input.from), to: new Date(input.to) })),
    roomClosures: adminProcedure
      .input(z.object({ roomId: z.number().int().positive() }))
      .query(({ input }) => getRoomClosures(input.roomId)),
    setRoomClosure: adminProcedure
      .input(z.object({ roomId: z.number().int().positive(), closureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().max(600).optional(), confirmedAffectedBookingIds: z.array(z.string().min(1).max(64)) }))
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
  }),
  coach: router({
    clients: coachOrAdminProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      
      const coachRecord = await db.select().from(coaches).where(eq(coaches.userId, ctx.user.id)).limit(1);
      const coach = coachRecord[0];
      
      if (!coach && ctx.user.role !== "admin") {
        throw new Error("Coach profile not found.");
      }
      
      const query = await db
        .selectDistinct({
          id: users.id,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .innerJoin(bookings, eq(users.id, bookings.memberUserId))
        .innerJoin(availabilityShifts, eq(bookings.availabilityShiftId, availabilityShifts.id))
        .where(and(
          inArray(bookings.status, ["pending", "confirmed"]),
          ctx.user.role === "coach" && coach ? eq(availabilityShifts.coachId, coach.id) : undefined,
        ));
        
      return query;
    }),
    saveNote: coachOrAdminProcedure
      .input(z.object({ clientUserId: z.number().int().positive(), coachId: z.number().int().positive().optional(), note: z.string().trim().min(1).max(4_000) }))
      .mutation(async ({ ctx, input }) => {
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
    roomCalendar: protectedProcedure
      .input(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), roomId: z.number().int().positive().optional() }))
      .query(async ({ ctx, input }) => {
        if (!["client", "coach", "admin"].includes(ctx.user.role)) throw new Error("Authenticated access is required to view room calendars.");
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const dates: string[] = [];
        for (let date: string | null = input.from; date && date <= input.to; date = addCalendarDays(date, 1)) {
          dates.push(date);
          if (dates.length > 45) throw new Error("Room calendar ranges may not exceed 45 days.");
        }
        if (!dates.length || dates[dates.length - 1] !== input.to) throw new Error("Choose a valid room calendar range.");
        const allRooms = await listRooms();
        const rooms = input.roomId ? allRooms.filter((room) => room.id === input.roomId) : allRooms;
        const roomIds = rooms.map((room) => room.id);
        const ranges = rooms.flatMap((room) => {
          const first = gymDayBounds(input.from, room.timeZone);
          const last = gymDayBounds(input.to, room.timeZone);
          return first && last ? [{ roomId: room.id, startAt: first.startAt, endAt: last.endAt }] : [];
        });
        const from = new Date(Math.min(...ranges.map((range) => range.startAt.getTime())));
        const endExclusive = new Date(Math.max(...ranges.map((range) => range.endAt.getTime())));
        const [closures, windows, bookingRows] = roomIds.length ? await Promise.all([
          db.select({ roomId: roomClosures.roomId, closureDate: roomClosures.closureDate }).from(roomClosures).where(and(inArray(roomClosures.roomId, roomIds), gte(roomClosures.closureDate, input.from), lte(roomClosures.closureDate, input.to))),
          db.select({ roomId: availabilityShifts.roomId, startAt: availabilityShifts.startAt, endAt: availabilityShifts.endAt, status: availabilityShifts.status }).from(availabilityShifts).where(and(inArray(availabilityShifts.roomId, roomIds), lt(availabilityShifts.startAt, endExclusive), gt(availabilityShifts.endAt, from))),
          db.select({ roomId: timeSlots.roomId, startAt: timeSlots.startAt, endAt: timeSlots.endAt }).from(bookings).innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id)).where(and(inArray(timeSlots.roomId, roomIds), inArray(bookings.status, ["pending", "confirmed"]), lt(timeSlots.startAt, endExclusive), gt(timeSlots.endAt, from))),
        ]) : [[], [], []];
        const rows: { date: string; markers: string[]; publishedCount: number; bookingCount: number }[] = [];
        for (const date of dates) {
          const closedIds = new Set(closures.filter((closure) => closure.closureDate === date).map((closure) => closure.roomId));
          const activeRooms = rooms.filter((room) => room.active);
          const roomDayBounds = new Map(rooms.flatMap((room) => {
            const bounds = gymDayBounds(date, room.timeZone);
            return bounds ? [[room.id, bounds] as const] : [];
          }));
          const dayWindows = windows.filter((window) => {
            const bounds = window.roomId ? roomDayBounds.get(window.roomId) : null;
            return bounds ? window.startAt < bounds.endAt && window.endAt > bounds.startAt : false;
          });
          const dayBookings = bookingRows.filter((booking) => {
            const bounds = booking.roomId ? roomDayBounds.get(booking.roomId) : null;
            return bounds ? booking.startAt < bounds.endAt && booking.endAt > bounds.startAt : false;
          });
          const fullyOccupied = rooms.some((room) => {
            const bounds = roomDayBounds.get(room.id);
            return bounds ? maximumConcurrentOccupancy(dayBookings.filter((booking) => booking.roomId === room.id), bounds) >= room.maximumCapacity : false;
          });
          const markers: string[] = [];
          if (rooms.some((room) => !room.active)) markers.push("inactive");
          if (activeRooms.length && closedIds.size >= activeRooms.length) markers.push("closed");
          else if (closedIds.size) markers.push("partially_closed");
          if (fullyOccupied) markers.push("full");
          if (activeRooms.some((room) => !closedIds.has(room.id))) markers.push("available");
          if (dayWindows.some((window) => window.status === "available")) markers.push("availability_published");
          if (dayBookings.length) markers.push("client_booking");
          rows.push({ date, markers, publishedCount: dayWindows.filter((window) => window.status === "available").length, bookingCount: dayBookings.length });
        }
        return rows;
      }),
    roomSchedule: protectedProcedure
      .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), diagnostics: z.literal(true).optional() }))
      .query(async ({ ctx, input }) => {
        if (!["client", "coach", "admin"].includes(ctx.user.role)) throw new Error("Authenticated access is required to view room schedules.");
        if (input.diagnostics && ctx.user.role !== "admin") throw new Error("Scheduler diagnostics require Admin access.");
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const timings: SchedulerReadTiming[] | null = input.diagnostics ? [] : null;
        const startedAt = Date.now();
        const rooms = await measureSchedulerRead(timings, "room_metadata", () => listRooms());
        const roomBounds = new Map(rooms.flatMap((room) => {
          const bounds = gymDayBounds(input.date, room.timeZone);
          return bounds ? [[room.id, bounds] as const] : [];
        }));
        if (rooms.length && roomBounds.size !== rooms.length) throw new Error("Choose a valid room schedule date.");
        const dayStart = rooms.length ? new Date(Math.min(...[...roomBounds.values()].map((bounds) => bounds.startAt.getTime()))) : new Date(0);
        const dayEnd = rooms.length ? new Date(Math.max(...[...roomBounds.values()].map((bounds) => bounds.endAt.getTime()))) : new Date(0);
        const roomIds = rooms.map((room) => room.id);
        const [closures, bookingRows, availabilityRows] = roomIds.length ? await Promise.all([
          measureSchedulerRead(timings, "room_closures", () => db.select({ roomId: roomClosures.roomId, reason: roomClosures.reason }).from(roomClosures).where(and(eq(roomClosures.closureDate, input.date), inArray(roomClosures.roomId, roomIds)))),
          measureSchedulerRead(timings, "active_room_bookings", () => db.select({
            availabilityShiftId: bookings.availabilityShiftId,
            availabilityId: availabilityShifts.externalId,
            roomId: sql<number | null>`coalesce(${timeSlots.roomId}, ${availabilityShifts.roomId})`,
            startAt: timeSlots.startAt,
            endAt: timeSlots.endAt,
          }).from(bookings)
            .innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id))
            .leftJoin(availabilityShifts, eq(bookings.availabilityShiftId, availabilityShifts.id))
            .where(and(or(inArray(timeSlots.roomId, roomIds), inArray(availabilityShifts.roomId, roomIds)), inArray(bookings.status, ["pending", "confirmed"]), lt(timeSlots.startAt, dayEnd), gt(timeSlots.endAt, dayStart)))),
          measureSchedulerRead(timings, "coach_availability", () => db.select({
            internalId: availabilityShifts.id,
            id: availabilityShifts.externalId,
            coachId: availabilityShifts.coachId,
            roomId: availabilityShifts.roomId,
            startAt: availabilityShifts.startAt,
            endAt: availabilityShifts.endAt,
            status: availabilityShifts.status,
            maximumCapacity: availabilityShifts.maximumCapacity,
            coachName: coaches.fullName,
            coachSpecialty: coaches.specialty,
            note: availabilityShifts.note,
          }).from(availabilityShifts)
            .innerJoin(coaches, eq(availabilityShifts.coachId, coaches.id))
            .where(and(inArray(availabilityShifts.roomId, roomIds), lt(availabilityShifts.startAt, dayEnd), gt(availabilityShifts.endAt, dayStart)))),
        ]) : [[], [], []];
        const closuresByRoom = new Map(closures.map((closure) => [closure.roomId, closure.reason]));
        const scheduledRooms = rooms.map((room) => {
          const closed = closuresByRoom.has(room.id);
          const bounds = roomBounds.get(room.id)!;
          const activeBookings = bookingRows.filter((booking) => booking.roomId === room.id && booking.startAt < bounds.endAt && booking.endAt > bounds.startAt);
          const windows = availabilityRows.filter((window) => window.roomId === room.id && window.startAt < bounds.endAt && window.endAt > bounds.startAt).map((window) => {
            const requested = { startAt: window.startAt, endAt: window.endAt };
            const occupancy = maximumConcurrentOccupancy(activeBookings, requested);
            const shiftOccupancy = maximumConcurrentOccupancy(activeBookings.filter((booking) => booking.availabilityShiftId === window.internalId), requested);
            const intervalEligibility = evaluateRoomInterval({
              ...room,
              startAt: window.startAt,
              endAt: window.endAt,
              closure: closed ? { closureDate: input.date, reason: closuresByRoom.get(room.id) ?? null } : null,
              occupiedIntervals: activeBookings,
            });
            const roomStatus = intervalEligibility.status === "full" ? "available" : intervalEligibility.status;
            const { internalId: _internalId, ...publicWindow } = window;
            return {
              ...publicWindow,
              occupancy,
              remainingCapacity: Math.max(0, Math.min(room.maximumCapacity - occupancy, window.maximumCapacity - shiftOccupancy)),
              statusReason: roomStatus === "available" && shiftOccupancy >= window.maximumCapacity ? "full" : roomStatus,
            };
          });
          const occupancy = maximumConcurrentOccupancy(activeBookings, bounds);
          const closureBounds = closed ? gymDayBounds(input.date, room.timeZone) : null;
          return {
            ...room,
            closureReason: closuresByRoom.get(room.id) ?? null,
            closurePeriod: closureBounds ? { startAt: closureBounds.startAt, endAt: closureBounds.endAt, reason: closuresByRoom.get(room.id) ?? null } : null,
            occupancy,
            remainingCapacity: Math.max(0, room.maximumCapacity - occupancy),
            statusReason: !room.active ? "inactive" : closed ? "temporarily_closed" : "available",
            nextAvailableSlot: windows.find((window) => window.statusReason === "available")?.startAt ?? null,
            bookingIntervals: activeBookings.map(({ availabilityId, startAt, endAt }) => ({ availabilityId, startAt, endAt })),
            windows,
          };
        });
        const response = {
          date: input.date,
          rooms: scheduledRooms,
        };
        return timings ? { ...response, diagnostics: { totalMs: Date.now() - startedAt, queries: timings } } : response;
      }),
    rooms: coachOrAdminProcedure.input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).optional()).query(async ({ ctx, input }) => {
      const allRooms = await listRooms();
      const requestedDate = input?.date ?? gymDateKey(new Date(), allRooms[0]?.timeZone ?? "UTC");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const roomIds = allRooms.map((room) => room.id);
      const closures = roomIds.length ? await db.select({ roomId: roomClosures.roomId }).from(roomClosures).where(and(eq(roomClosures.closureDate, requestedDate), inArray(roomClosures.roomId, roomIds))) : [];
      const closedRoomIds = new Set(closures.map((closure) => closure.roomId));
      const activeRooms = allRooms.filter((room) => room.active);
      const defaultGymId = ctx.user.role === "coach" ? (await (async () => {
        const coachId = await getAuthorizedCoachIdForUser(db, ctx.user.id);
        if (!coachId) throw new Error("Your Coach access is inactive or revoked.");
        const coach = await db.select({ gymId: coaches.gymId }).from(coaches).where(eq(coaches.id, coachId)).limit(1);
        return coach[0]?.gymId ?? null;
      })()) : null;
      return {
        rooms: buildAvailabilityRoomChoices(allRooms, closedRoomIds, defaultGymId),
        totalRooms: allRooms.length,
        activeRoomCount: activeRooms.length,
        closedRoomCount: activeRooms.filter((room) => closedRoomIds.has(room.id)).length,
        requestedDate,
      };
    }),
    mine: coachOrAdminProcedure
      .input(z.object({ coachId: z.number().int().positive().optional(), from: z.string().datetime().optional(), to: z.string().datetime().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const coachId = ctx.user.role === "admin" && !input?.coachId
          ? undefined
          : await managedCoachId(db, ctx.user, input?.coachId);
        const from = input?.from ? new Date(input.from) : new Date();
        const to = input?.to ? new Date(input.to) : new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
        const windows = await db.select().from(availabilityShifts).where(and(coachId ? eq(availabilityShifts.coachId, coachId) : undefined, lt(availabilityShifts.startAt, to), gt(availabilityShifts.endAt, from)));
        if (!windows.length) return [];
        const windowRoomIds = [...new Set(windows.flatMap((window) => window.roomId ? [window.roomId] : []))];
        const roomTimeZones = windowRoomIds.length ? await db.select({ roomId: gymRooms.id, timeZone: gyms.timezone }).from(gymRooms).innerJoin(gyms, eq(gymRooms.gymId, gyms.id)).where(inArray(gymRooms.id, windowRoomIds)) : [];
        const timeZoneByRoom = new Map(roomTimeZones.map((room) => [room.roomId, room.timeZone]));
        const counts = await db.select({ shiftId: bookings.availabilityShiftId, count: sql<number>`count(*)` })
          .from(bookings)
          .where(and(inArray(bookings.availabilityShiftId, windows.map((window) => window.id)), inArray(bookings.status, ["pending", "confirmed"])))
          .groupBy(bookings.availabilityShiftId);
        const countByShiftId = new Map(counts.map((count) => [count.shiftId, Number(count.count)]));
        return windows.map((window) => ({ ...window, timeZone: window.roomId ? timeZoneByRoom.get(window.roomId) ?? "UTC" : "UTC", bookedCount: countByShiftId.get(window.id) ?? 0 }));
      }),
    bookable: clientProcedure
      .input(z.object({ coachId: z.number().int().positive(), dateStart: z.string().datetime(), dateEnd: z.string().datetime() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const windows = await db.select({
          id: availabilityShifts.externalId,
          coachId: availabilityShifts.coachId,
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
        return Promise.all(windows.map(async (window) => ({
          ...window,
          roomEligibility: window.roomId
            ? (await roomEligibilityForInterval(db, window.roomId, window.startAt, window.endAt)).eligibility
            : null,
        })));
      }),
    bookableAll: clientProcedure
      .input(z.object({ dateStart: z.string().datetime(), dateEnd: z.string().datetime() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const windows = await db.select({
          id: availabilityShifts.externalId,
          coachId: availabilityShifts.coachId,
          coachName: coaches.fullName,
          coachSpecialty: coaches.specialty,
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
        return Promise.all(windows.map(async (window) => ({
          ...window,
          roomEligibility: window.roomId
            ? (await roomEligibilityForInterval(db, window.roomId, window.startAt, window.endAt)).eligibility
            : null,
        })));
      }),
    previewCapacity: clientProcedure
      .input(z.object({ windowId: z.string().min(1).max(64), startAt: z.string().datetime(), durationMinutes: durationInput }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const window = await db.select().from(availabilityShifts).where(eq(availabilityShifts.externalId, input.windowId)).limit(1);
        if (!window[0]) throw new Error("Availability window not found.");
        const startAt = new Date(input.startAt);
        const endAt = ensureBookableInterval(window[0], startAt, input.durationMinutes);
        const overlaps = await db.select({ startAt: timeSlots.startAt, endAt: timeSlots.endAt }).from(bookings).innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id)).where(and(
          eq(bookings.availabilityShiftId, window[0].id),
          inArray(bookings.status, ["pending", "confirmed"]),
          lt(timeSlots.startAt, endAt),
          gt(timeSlots.endAt, startAt),
        ));
        const bookedCount = maximumConcurrentOccupancy(overlaps, { startAt, endAt });
        const roomResult = window[0].roomId ? await roomEligibilityForInterval(db, window[0].roomId, startAt, endAt) : null;
        return {
          endAt,
          bookedCount,
          remainingCapacity: Math.max(0, window[0].maximumCapacity - bookedCount),
          maximumCapacity: window[0].maximumCapacity,
          roomEligibility: roomResult?.eligibility ?? null,
        };
      }),
    previewRoomCapacity: clientProcedure
      .input(z.object({ roomId: z.number().int().positive(), startAt: z.string().datetime(), durationMinutes: durationInput }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const startAt = new Date(input.startAt);
        const endAt = new Date(startAt.getTime() + input.durationMinutes * 60_000);
        if (startAt <= new Date()) throw new Error("Choose a future start time.");
        const result = await roomEligibilityForInterval(db, input.roomId, startAt, endAt);
        return { endAt, bookedCount: result.eligibility.currentOccupancy, remainingCapacity: result.eligibility.remainingCapacity, maximumCapacity: result.eligibility.maximumCapacity, eligibility: result.eligibility };
      }),
    create: coachOrAdminProcedure
      .input(availabilityInput)
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const coachId = await managedCoachId(db, ctx.user, input.coachId);
        const windowId = `availability-${randomUUID()}`;
        await db.transaction(async (tx: any) => {
          await tx.execute(sql`SELECT id FROM coaches WHERE id = ${coachId} FOR UPDATE`);
          const coach = await tx.select({ id: coaches.id, active: coaches.active, authorizationStatus: coachAuthorizations.status })
            .from(coaches).innerJoin(coachAuthorizations, eq(coachAuthorizations.coachId, coaches.id)).where(eq(coaches.id, coachId)).limit(1);
          if (!coach[0]?.active || coach[0].authorizationStatus !== "authorized") throw new Error("This Coach is inactive or unauthorized.");
          await tx.execute(sql`SELECT id FROM gymRooms WHERE id = ${input.roomId} FOR UPDATE`);
          const room = await tx.select({ id: gymRooms.id, gymId: gymRooms.gymId, name: gymRooms.name, maximumCapacity: gymRooms.maximumCapacity, timeZone: gyms.timezone })
            .from(gymRooms).innerJoin(gyms, eq(gymRooms.gymId, gyms.id)).where(eq(gymRooms.id, input.roomId)).limit(1);
          if (!room[0]) throw new Error("Select an active room for this availability.");
          const startAt = gymLocalDateTime(input.startDate, input.startTime, room[0].timeZone);
          const endAt = gymLocalDateTime(input.startDate, input.endTime, room[0].timeZone);
          if (!startAt || !endAt || endAt <= startAt) throw new Error("Choose an end time after the start time. This time may not exist because of daylight saving time.");
          if (startAt.getTime() < Date.now() + 30 * 60_000) throw new Error("Today’s availability must start at least 30 minutes from now.");
          const roomResult = assertEligibleRoom(await roomEligibilityForInterval(tx, room[0].id, startAt, endAt));
          if (input.maximumCapacity > roomResult.room.maximumCapacity) throw new Error("This availability exceeds the room’s maximum client capacity.");
          const conflicts = await tx.select({ id: availabilityShifts.id }).from(availabilityShifts).where(and(
            eq(availabilityShifts.coachId, coachId),
            lt(availabilityShifts.startAt, endAt),
            gt(availabilityShifts.endAt, startAt),
            inArray(availabilityShifts.status, ["available", "booked", "blocked"]),
          )).limit(1);
          if (conflicts.length) throw new Error("This availability overlaps an existing availability window or blocked period.");
          await tx.insert(availabilityShifts).values({ externalId: windowId, gymId: room[0].gymId, coachId, roomId: room[0].id, serviceTypeId: null, startAt, endAt, maximumCapacity: input.maximumCapacity, location: room[0].name, note: input.note, status: "available", createdBy: ctx.user.id });
          await tx.insert(auditLogs).values({ actorUserId: ctx.user.id, action: "CREATE_AVAILABILITY", details: `Created continuous availability window ${windowId} for coach ${coachId}.` });
        });
        return { success: true as const, windowId, createdCount: 1 };
      }),
    update: coachOrAdminProcedure
      .input(availabilityInput.omit({ coachId: true }).extend({ shiftId: z.string().min(1).max(64) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const existing = await canManageShift(db, ctx.user, input.shiftId);
        return db.transaction(async (tx: any) => {
          await tx.execute(sql`SELECT id FROM availabilityShifts WHERE id = ${existing.id} FOR UPDATE`);
          const shift = await tx.select().from(availabilityShifts).where(eq(availabilityShifts.id, existing.id)).limit(1);
          if (!shift[0] || shift[0].endAt <= new Date() || ["completed", "cancelled", "expired"].includes(shift[0].status)) throw new Error("Only future active or blocked availability can be edited.");
          await tx.execute(sql`SELECT id FROM coaches WHERE id = ${shift[0].coachId} FOR UPDATE`);
          const coach = await tx.select({ active: coaches.active, authorizationStatus: coachAuthorizations.status }).from(coaches)
            .innerJoin(coachAuthorizations, eq(coachAuthorizations.coachId, coaches.id)).where(eq(coaches.id, shift[0].coachId)).limit(1);
          if (!coach[0]?.active || coach[0].authorizationStatus !== "authorized") throw new Error("This Coach is inactive or unauthorized.");
          await tx.execute(sql`SELECT id FROM gymRooms WHERE id = ${input.roomId} FOR UPDATE`);
          const room = await tx.select({ id: gymRooms.id, gymId: gymRooms.gymId, name: gymRooms.name, maximumCapacity: gymRooms.maximumCapacity, timeZone: gyms.timezone })
            .from(gymRooms).innerJoin(gyms, eq(gymRooms.gymId, gyms.id)).where(eq(gymRooms.id, input.roomId)).limit(1);
          if (!room[0]) throw new Error("Select an active room for this availability.");
          const startAt = gymLocalDateTime(input.startDate, input.startTime, room[0].timeZone);
          const endAt = gymLocalDateTime(input.startDate, input.endTime, room[0].timeZone);
          if (!startAt || !endAt || endAt <= startAt) throw new Error("Choose an end time after the start time. This time may not exist because of daylight saving time.");
          if (startAt.getTime() < Date.now() + 30 * 60_000) throw new Error("Availability must start at least 30 minutes from now.");
          const eligibility = await roomEligibilityForInterval(tx, room[0].id, startAt, endAt);
          const sameRoomAndInterval = shift[0].roomId === room[0].id && shift[0].startAt.getTime() === startAt.getTime() && shift[0].endAt.getTime() === endAt.getTime();
          if (eligibility.eligibility.status !== "available" && !(sameRoomAndInterval && eligibility.eligibility.status === "full")) assertEligibleRoom(eligibility);
          if (input.maximumCapacity > room[0].maximumCapacity) throw new Error("This availability exceeds the room’s maximum client capacity.");
          const bookedIntervals = await tx.select({ startAt: timeSlots.startAt, endAt: timeSlots.endAt }).from(bookings).innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id)).where(and(eq(bookings.availabilityShiftId, shift[0].id), inArray(bookings.status, ["pending", "confirmed"])));
          if (bookedIntervals.some((booking: { startAt: Date; endAt: Date }) => booking.startAt < startAt || booking.endAt > endAt)) throw new Error("The edited availability must continue to contain every existing booking.");
          if (maximumConcurrentOccupancy(bookedIntervals, { startAt, endAt }) > input.maximumCapacity) throw new Error("Maximum capacity cannot be lower than existing concurrent bookings.");
          const conflicts = await tx.select({ id: availabilityShifts.id }).from(availabilityShifts).where(and(eq(availabilityShifts.coachId, shift[0].coachId), ne(availabilityShifts.id, shift[0].id), lt(availabilityShifts.startAt, endAt), gt(availabilityShifts.endAt, startAt), inArray(availabilityShifts.status, ["available", "booked", "blocked"]))).limit(1);
          if (conflicts.length) throw new Error("This availability overlaps an existing availability window or blocked period.");
          await tx.update(availabilityShifts).set({ gymId: room[0].gymId, roomId: room[0].id, startAt, endAt, maximumCapacity: input.maximumCapacity, location: room[0].name, note: input.note, updatedBy: ctx.user.id }).where(eq(availabilityShifts.id, shift[0].id));
          await tx.insert(auditLogs).values({ actorUserId: ctx.user.id, action: "UPDATE_AVAILABILITY", details: `Updated availability ${input.shiftId}; existing bookings were preserved.` });
          return { success: true as const, windowId: input.shiftId };
        });
      }),
    setStatus: coachOrAdminProcedure
      .input(z.object({ shiftId: z.string().min(1).max(64), status: z.enum(["Blocked", "Available", "Cancelled"]) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const shift = await canManageShift(db, ctx.user, input.shiftId);
        if (new Date(shift.startAt) <= new Date() || shift.status === "completed") throw new Error("Only future availability windows can be changed.");
        const status = input.status.toLowerCase() as "blocked" | "available" | "cancelled";
        await db.transaction(async (tx: any) => {
          await tx.update(availabilityShifts).set({ status, updatedBy: ctx.user.id }).where(eq(availabilityShifts.id, shift.id));
          await tx.insert(auditLogs).values({ actorUserId: ctx.user.id, action: `${input.status.toUpperCase()}_AVAILABILITY`, details: `Updated ${input.shiftId}.` });
        });
        return { success: true as const };
      }),
    book: clientProcedure
      .input(z.object({ windowId: z.string().min(1).max(64), startAt: z.string().datetime(), durationMinutes: durationInput }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        return db.transaction(async (tx: any) => {
          const shiftIdentity = await tx.select({ id: availabilityShifts.id }).from(availabilityShifts).where(eq(availabilityShifts.externalId, input.windowId)).limit(1);
          if (!shiftIdentity[0]) throw new Error("Availability window not found.");
          await tx.execute(sql`SELECT id FROM availabilityShifts WHERE id = ${shiftIdentity[0].id} FOR UPDATE`);
          const shift = await tx.select().from(availabilityShifts).where(eq(availabilityShifts.id, shiftIdentity[0].id)).limit(1);
          if (!shift[0]) throw new Error("Availability window not found.");
          const coachAccess = await tx.select({ active: coaches.active, authorizationStatus: coachAuthorizations.status }).from(coaches)
            .innerJoin(coachAuthorizations, eq(coachAuthorizations.coachId, coaches.id)).where(eq(coaches.id, shift[0].coachId)).limit(1);
          if (!coachAccess[0]?.active || coachAccess[0].authorizationStatus !== "authorized") throw new Error("This Coach is inactive or unauthorized.");
          // A Client record lock also serializes bookings across different Coach windows for the same Client.
          await tx.execute(sql`SELECT id FROM users WHERE id = ${ctx.user.id} FOR UPDATE`);
          const startAt = new Date(input.startAt);
          const endAt = ensureBookableInterval(shift[0], startAt, input.durationMinutes);
          const existingClientOverlap = await tx.select({ id: bookings.id }).from(bookings).innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id)).where(and(
            eq(bookings.memberUserId, ctx.user.id), inArray(bookings.status, ["pending", "confirmed"]), lt(timeSlots.startAt, endAt), gt(timeSlots.endAt, startAt),
          )).limit(1);
          if (existingClientOverlap.length) throw new Error("This session overlaps with one of your existing bookings.");
          const overlappingBookings = await tx.select({ startAt: timeSlots.startAt, endAt: timeSlots.endAt }).from(bookings).innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id)).where(and(
            eq(bookings.availabilityShiftId, shift[0].id), inArray(bookings.status, ["pending", "confirmed"]), lt(timeSlots.startAt, endAt), gt(timeSlots.endAt, startAt),
          ));
          const coachOccupancy = maximumConcurrentOccupancy(overlappingBookings, { startAt, endAt });
          if (coachOccupancy >= shift[0].maximumCapacity) throw new Error("That time has reached the coach’s maximum client capacity. Choose another time.");
          let roomRemainingCapacity: number | null = null;
          if (shift[0].roomId) {
            await tx.execute(sql`SELECT id FROM gymRooms WHERE id = ${shift[0].roomId} FOR UPDATE`);
            const roomResult = assertEligibleRoom(await roomEligibilityForInterval(tx, shift[0].roomId, startAt, endAt));
            roomRemainingCapacity = roomResult.eligibility.remainingCapacity - 1;
          }
          const bookingExternalId = `booking-${randomUUID()}`;
          const slotExternalId = `booking-slot-${bookingExternalId}`;
          await tx.insert(timeSlots).values({ externalId: slotExternalId, gymId: shift[0].gymId, coachId: shift[0].coachId, roomId: shift[0].roomId, serviceTypeId: null, startAt, endAt, maximumCapacity: shift[0].maximumCapacity, bookedCount: 1, status: "Full", room: shift[0].location });
          const slot = await tx.select({ id: timeSlots.id }).from(timeSlots).where(eq(timeSlots.externalId, slotExternalId)).limit(1);
          await tx.insert(bookings).values({ externalId: bookingExternalId, memberUserId: ctx.user.id, timeSlotId: slot[0].id, availabilityShiftId: shift[0].id, status: "confirmed" });
          const booking = await tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.externalId, bookingExternalId)).limit(1);
          const coach = await tx.select({ userId: coaches.userId }).from(coaches).where(eq(coaches.id, shift[0].coachId)).limit(1);
          await tx.insert(notifications).values([
            { userId: ctx.user.id, type: "confirmation", title: "Coach session booked", message: "Your session is confirmed and has been added to your schedule.", relatedBookingId: booking[0].id },
            ...(coach[0]?.userId ? [{ userId: coach[0].userId, type: "confirmation" as const, title: "New client booking", message: "A client booked time in your availability window.", relatedBookingId: booking[0].id }] : []),
          ]);
          await tx.insert(auditLogs).values({ actorUserId: ctx.user.id, action: "BOOK_AVAILABILITY", details: `Booked ${input.windowId} from ${startAt.toISOString()} to ${endAt.toISOString()}.` });
          return { success: true as const, bookingId: bookingExternalId, startAt, endAt, remainingCapacity: Math.min(shift[0].maximumCapacity - coachOccupancy - 1, roomRemainingCapacity ?? Number.POSITIVE_INFINITY) };
        });
      }),
    bookRoom: clientProcedure
      .input(z.object({ roomId: z.number().int().positive(), startAt: z.string().datetime(), durationMinutes: durationInput }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        return db.transaction(async (tx: any) => {
          const startAt = new Date(input.startAt);
          const endAt = new Date(startAt.getTime() + input.durationMinutes * 60_000);
          if (startAt <= new Date()) throw new Error("Choose a future start time.");
          await tx.execute(sql`SELECT id FROM users WHERE id = ${ctx.user.id} FOR UPDATE`);
          await tx.execute(sql`SELECT id FROM gymRooms WHERE id = ${input.roomId} FOR UPDATE`);
          const roomResult = assertEligibleRoom(await roomEligibilityForInterval(tx, input.roomId, startAt, endAt));
          const room = roomResult.room;
          const clientOverlap = await tx.select({ id: bookings.id }).from(bookings).innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id)).where(and(eq(bookings.memberUserId, ctx.user.id), inArray(bookings.status, ["pending", "confirmed"]), lt(timeSlots.startAt, endAt), gt(timeSlots.endAt, startAt))).limit(1);
          if (clientOverlap.length) throw new Error("This session overlaps with one of your existing bookings.");
          const bookingExternalId = `room-booking-${randomUUID()}`;
          const slotExternalId = `room-slot-${bookingExternalId}`;
          await tx.insert(timeSlots).values({ externalId: slotExternalId, gymId: room.gymId, coachId: null, roomId: room.id, serviceTypeId: null, startAt, endAt, maximumCapacity: room.maximumCapacity, bookedCount: 1, status: "Full", room: room.name });
          const slot = await tx.select({ id: timeSlots.id }).from(timeSlots).where(eq(timeSlots.externalId, slotExternalId)).limit(1);
          await tx.insert(bookings).values({ externalId: bookingExternalId, memberUserId: ctx.user.id, timeSlotId: slot[0].id, availabilityShiftId: null, status: "confirmed" });
          const booking = await tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.externalId, bookingExternalId)).limit(1);
          await tx.insert(notifications).values({ userId: ctx.user.id, type: "confirmation", title: "Gym access booked", message: "Your room-only gym access booking is confirmed and has been added to your schedule.", relatedBookingId: booking[0].id });
          await tx.insert(auditLogs).values({ actorUserId: ctx.user.id, action: "BOOK_ROOM_ACCESS", details: `Booked room ${room.id} from ${startAt.toISOString()} to ${endAt.toISOString()}.` });
          return { success: true as const, bookingId: bookingExternalId, startAt, endAt, remainingCapacity: roomResult.eligibility.remainingCapacity - 1 };
        });
      }),
    cancel: protectedProcedure
      .input(z.object({ bookingId: z.string().min(1).max(64), reason: z.string().trim().max(240).optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const cancellation = await db.transaction(async (tx: any) => {
          await tx.execute(sql`SELECT id FROM bookings WHERE externalId = ${input.bookingId} FOR UPDATE`);
          const record = await tx.select({ booking: bookings, shift: availabilityShifts, clientName: users.name }).from(bookings).leftJoin(availabilityShifts, eq(bookings.availabilityShiftId, availabilityShifts.id)).innerJoin(users, eq(bookings.memberUserId, users.id)).where(eq(bookings.externalId, input.bookingId)).limit(1);
          if (!record[0]) throw new Error("Booking not found.");
          const canCancel = record[0].booking.memberUserId === ctx.user.id || ctx.user.role === "admin" || (ctx.user.role === "coach" && record[0].shift && (await managedCoachId(tx, ctx.user)) === record[0].shift.coachId);
          if (!canCancel) throw new Error("You cannot cancel this booking.");
          if (record[0].booking.status !== "confirmed") throw new Error("This booking cannot be cancelled.");
          await tx.update(bookings).set({ status: "cancelled", cancellationTime: new Date(), cancellationReason: input.reason }).where(eq(bookings.id, record[0].booking.id));
          await tx.update(timeSlots).set({ status: "Cancelled", bookedCount: 0 }).where(eq(timeSlots.id, record[0].booking.timeSlotId));
          if (record[0].shift) {
            const coach = await tx.select({ userId: coaches.userId }).from(coaches).where(eq(coaches.id, record[0].shift.coachId)).limit(1);
            if (coach[0]?.userId) await tx.insert(notifications).values({ userId: coach[0].userId, type: "cancellation", title: "Client session cancelled", message: `${record[0].clientName ?? "A client"} cancelled a session in your availability window.`, relatedBookingId: record[0].booking.id });
          }
          await tx.insert(auditLogs).values({ actorUserId: ctx.user.id, action: record[0].shift ? "CANCEL_AVAILABILITY_BOOKING" : "CANCEL_ROOM_ACCESS_BOOKING", details: record[0].shift ? `Cancelled ${input.bookingId}; the availability window remains open.` : `Cancelled standalone room-access booking ${input.bookingId}.` });
          return { shiftId: record[0].shift?.externalId ?? null };
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
    markAttendance: coachOrAdminProcedure
      .input(z.object({ bookingId: z.string().min(1).max(64), status: z.enum(["completed", "no_show"]) }))
      .mutation(async ({ ctx, input }) => {
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
    coachSchedule: coachOrAdminProcedure
      .input(z.object({ coachId: z.number().int().positive().optional() }).optional())
      .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const coachId = ctx.user.role === "admin" && !input?.coachId
        ? undefined
        : await managedCoachId(db, ctx.user, input?.coachId);
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
        availabilityId: availabilityShifts.externalId,
        availabilityCapacity: availabilityShifts.maximumCapacity,
      }).from(bookings)
        .innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id))
        .innerJoin(users, eq(bookings.memberUserId, users.id))
        .innerJoin(availabilityShifts, eq(bookings.availabilityShiftId, availabilityShifts.id))
        .where(coachId ? eq(availabilityShifts.coachId, coachId) : undefined)
        .orderBy(asc(timeSlots.startAt));
      }),
    releaseAfterCancellation: coachOrAdminProcedure
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
    adminList: adminProcedure
      .input(z.object({ coachId: z.number().int().positive().optional(), status: z.enum(["Available", "Booked", "Blocked", "Completed", "Cancelled", "Expired"]).optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const status = input?.status ? input.status.toLowerCase() as "available" | "booked" | "blocked" | "completed" | "cancelled" | "expired" : undefined;
        const conditions = [input?.coachId ? eq(availabilityShifts.coachId, input.coachId) : undefined, status ? eq(availabilityShifts.status, status) : undefined].filter(Boolean) as any[];
        return db.select().from(availabilityShifts).where(conditions.length ? and(...conditions) : undefined);
      }),
  }),
});

export type AppRouter = typeof appRouter;
