import { and, eq, gt, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { auditLogs, availabilityShifts, bookings, coachAuthorizations, coaches, gymRooms, gyms, InsertUser, notifications, roomClosures, timeSlots, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { googleAccountRole, normalizeGoogleEmail } from "./google-authorization";
import { matchesConfirmationName } from "../shared/confirmation-name";

export function normalizeRoomName(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function isValidRoomHours(openingTime: string, closingTime: string) {
  const parse = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
    : null;
  const opening = parse(openingTime);
  const closing = parse(closingTime);
  return opening !== null && closing !== null && opening < closing;
}

const activeBookingStatuses = ["pending", "confirmed"] as const;
const cancellableAvailabilityStatuses = ["available", "booked", "blocked"] as const;

export function closureDateBounds(closureDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(closureDate);
  if (!match) throw new Error("Choose a valid closure date.");
  const [year, month, day] = match.slice(1).map(Number);
  const startAt = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (startAt.getFullYear() !== year || startAt.getMonth() !== month - 1 || startAt.getDate() !== day) {
    throw new Error("Choose a valid closure date.");
  }
  const endAt = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { startAt, endAt };
}

async function notifyUsers(tx: any, userIds: number[], title: string, message: string) {
  const recipients = [...new Set(userIds.filter((userId) => Number.isInteger(userId) && userId > 0))];
  if (!recipients.length) return;
  await tx.insert(notifications).values(recipients.map((userId) => ({
    userId,
    type: "cancellation" as const,
    title,
    message,
    priority: "Important" as const,
  })));
}

async function notifyCoachesForShifts(tx: any, shiftIds: number[], title: string, message: string) {
  if (!shiftIds.length) return;
  const recipients = await tx.select({ userId: coaches.userId }).from(availabilityShifts)
    .innerJoin(coaches, eq(availabilityShifts.coachId, coaches.id))
    .where(inArray(availabilityShifts.id, shiftIds));
  await notifyUsers(tx, recipients.flatMap((recipient: { userId: number | null }) => recipient.userId ? [recipient.userId] : []), title, message);
}

async function cancelFutureBookingsForShifts(tx: any, shiftIds: number[], reason: string, title: string, message: string) {
  if (!shiftIds.length) return { cancelledBookingCount: 0 };
  const now = new Date();
  const rows = await tx.select({ bookingId: bookings.id, clientUserId: bookings.memberUserId, timeSlotId: bookings.timeSlotId })
    .from(bookings)
    .innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id))
    .where(and(inArray(bookings.availabilityShiftId, shiftIds), inArray(bookings.status, activeBookingStatuses), gte(timeSlots.startAt, now)));
  if (!rows.length) return { cancelledBookingCount: 0 };
  await tx.update(bookings).set({ status: "cancelled", cancellationTime: now, cancellationReason: reason }).where(inArray(bookings.id, rows.map((row: { bookingId: number }) => row.bookingId)));
  await tx.update(timeSlots).set({ status: "Cancelled", bookedCount: 0 }).where(inArray(timeSlots.id, rows.map((row: { timeSlotId: number }) => row.timeSlotId)));
  await tx.insert(notifications).values(rows.map((row: { clientUserId: number; bookingId: number }) => ({
    userId: row.clientUserId,
    type: "cancellation" as const,
    title,
    message,
    relatedBookingId: row.bookingId,
    priority: "Important" as const,
  })));
  return { cancelledBookingCount: rows.length };
}

let _db: MySql2Database | null = null;
let _pool: Pool | null = null;

function connectionLimit() {
  const parsed = Number.parseInt(process.env.DB_CONNECTION_LIMIT ?? "30", 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : 30;
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = createPool({
        uri: process.env.DATABASE_URL,
        waitForConnections: true,
        connectionLimit: connectionLimit(),
        queueLimit: 0,
        connectTimeout: 10_000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
      });
      _db = drizzle({ client: _pool });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      await _pool?.end().catch(() => undefined);
      _pool = null;
      _db = null;
    }
  }
  return _db;
}

export async function closeDb() {
  const pool = _pool;
  _pool = null;
  _db = null;
  await pool?.end();
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.email !== undefined) {
      const emailNormalized = user.email ? normalizeGoogleEmail(user.email) : null;
      values.emailNormalized = emailNormalized;
      updateSet.emailNormalized = emailNormalized;
    }

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getLocalUserByUsername(username: string) {
  return getUserByOpenId(`local:${username}`);
}

export async function createLocalUser(input: {
  username: string;
  passwordHash: string;
  name: string;
  role: "admin";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const openId = `local:${input.username}`;
  const existing = await getUserByOpenId(openId);
  if (existing) throw new Error("That username is already in use.");

  await db.insert(users).values({
    openId,
    name: input.name,
    email: input.username,
    emailNormalized: normalizeGoogleEmail(input.username),
    loginMethod: "local",
    passwordHash: input.passwordHash,
    role: input.role,
    lastSignedIn: new Date(),
  });

  const created = await getUserByOpenId(openId);
  if (!created) throw new Error("Local account could not be created.");
  return created;
}

export async function updateUserLastSignedIn(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
}

export async function getUserByNormalizedEmail(email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.select().from(users).where(eq(users.emailNormalized, normalizeGoogleEmail(email))).limit(1);
  return result[0];
}

export async function listActiveGyms() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select({ id: gyms.id, name: gyms.name, address: gyms.address }).from(gyms).where(eq(gyms.active, true));
}

export async function listRooms(input: { activeOnly?: boolean } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select({ id: gymRooms.id, externalId: gymRooms.externalId, gymId: gymRooms.gymId, name: gymRooms.name, address: gymRooms.address, description: gymRooms.description, maximumCapacity: gymRooms.maximumCapacity, openingTime: gymRooms.openingTime, closingTime: gymRooms.closingTime, active: gymRooms.active }).from(gymRooms).where(input.activeOnly ? eq(gymRooms.active, true) : undefined);
}

export async function createGymRoom(input: { gymId?: number; name: string; address: string; description: string; maximumCapacity: number; openingTime: string; closingTime: string; actorUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const name = input.name.trim();
  const nameNormalized = normalizeRoomName(name);
  if (!nameNormalized) throw new Error("Enter a room name.");
  if (!isValidRoomHours(input.openingTime, input.closingTime)) throw new Error("Choose valid room opening and closing hours.");
  return db.transaction(async (tx: any) => {
    let gymId = input.gymId;
    if (gymId) {
      const selectedGym = await tx.select({ id: gyms.id }).from(gyms).where(and(eq(gyms.id, gymId), eq(gyms.active, true))).limit(1);
      if (!selectedGym[0]) throw new Error("The selected gym is no longer active.");
    } else {
      const activeGym = await tx.select({ id: gyms.id }).from(gyms).where(eq(gyms.active, true)).limit(1);
      if (activeGym[0]) {
        gymId = activeGym[0].id;
      } else {
        const externalId = `gym-room-default-${randomUUID()}`;
        await tx.insert(gyms).values({ externalId, name: "Coachora Gym", address: input.address.trim(), timezone: "UTC", active: true });
        const createdGym = await tx.select({ id: gyms.id }).from(gyms).where(eq(gyms.externalId, externalId)).limit(1);
        if (!createdGym[0]) throw new Error("The default gym could not be created.");
        gymId = createdGym[0].id;
      }
    }
    if (!gymId) throw new Error("A gym could not be resolved for this room.");
    const resolvedGymId = gymId;
    const existing = await tx.select({ id: gymRooms.id }).from(gymRooms).where(and(eq(gymRooms.gymId, resolvedGymId), eq(gymRooms.nameNormalized, nameNormalized))).limit(1);
    if (existing[0]) throw new Error("A room with this name already exists at this gym.");
    const externalId = `room-${randomUUID()}`;
    await tx.insert(gymRooms).values({ externalId, gymId: resolvedGymId, name, nameNormalized, address: input.address.trim(), description: input.description.trim(), maximumCapacity: input.maximumCapacity, openingTime: input.openingTime, closingTime: input.closingTime, active: true });
    const room = await tx.select({ id: gymRooms.id }).from(gymRooms).where(eq(gymRooms.externalId, externalId)).limit(1);
    if (!room[0]) throw new Error("Room could not be created.");
    await tx.insert(auditLogs).values({ actorUserId: input.actorUserId, action: "CREATE_GYM_ROOM", details: `Created room ${name} (${room[0].id}) at gym ${resolvedGymId} with capacity ${input.maximumCapacity}.` });
    return { id: room[0].id };
  });
}

export async function updateGymRoom(input: { roomId: number; gymId: number; name: string; address: string; description: string; maximumCapacity: number; openingTime: string; closingTime: string; active: boolean; actorUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const name = input.name.trim();
  const nameNormalized = normalizeRoomName(name);
  if (!nameNormalized) throw new Error("Enter a room name.");
  if (!isValidRoomHours(input.openingTime, input.closingTime)) throw new Error("Choose valid room opening and closing hours.");
  return db.transaction(async (tx: any) => {
    const room = await tx.select().from(gymRooms).where(eq(gymRooms.id, input.roomId)).limit(1);
    if (!room[0]) throw new Error("Room not found.");
    const conflicts = await tx.select({ id: availabilityShifts.id }).from(availabilityShifts).where(and(eq(availabilityShifts.roomId, input.roomId), gt(availabilityShifts.maximumCapacity, input.maximumCapacity), gt(availabilityShifts.endAt, new Date()), inArray(availabilityShifts.status, ["available", "booked", "blocked"]))).limit(1);
    if (conflicts[0]) throw new Error("Increase this room capacity or update its future availability windows first.");
    const duplicate = await tx.select({ id: gymRooms.id }).from(gymRooms).where(and(eq(gymRooms.gymId, input.gymId), eq(gymRooms.nameNormalized, nameNormalized))).limit(1);
    if (duplicate[0] && duplicate[0].id !== input.roomId) throw new Error("A room with this name already exists at this gym.");
    const wasActive = room[0].active;
    await tx.update(gymRooms).set({ gymId: input.gymId, name, nameNormalized, address: input.address.trim(), description: input.description.trim(), maximumCapacity: input.maximumCapacity, openingTime: input.openingTime, closingTime: input.closingTime, active: input.active }).where(eq(gymRooms.id, input.roomId));
    if (wasActive && !input.active) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      const todayShifts = await tx.select({ id: availabilityShifts.id }).from(availabilityShifts).where(and(
        or(eq(availabilityShifts.roomId, input.roomId), eq(availabilityShifts.location, room[0].name)),
        lt(availabilityShifts.startAt, tomorrowStart),
        gt(availabilityShifts.endAt, todayStart),
      ));
      const todayShiftIds = todayShifts.map((shift: { id: number }) => shift.id);
      const title = "Room inactive today";
      const message = `${name} is inactive today. Please check your schedule for updates.`;
      await notifyCoachesForShifts(tx, todayShiftIds, title, message);
      if (todayShiftIds.length) {
        const todayBookings = await tx.select({ clientUserId: bookings.memberUserId }).from(bookings)
          .innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id))
          .where(and(inArray(bookings.availabilityShiftId, todayShiftIds), inArray(bookings.status, activeBookingStatuses), lt(timeSlots.startAt, tomorrowStart), gt(timeSlots.endAt, todayStart)));
        await notifyUsers(tx, todayBookings.map((booking: { clientUserId: number }) => booking.clientUserId), title, message);
      }
      await tx.insert(auditLogs).values({ actorUserId: input.actorUserId, action: "DEACTIVATE_GYM_ROOM", details: `Marked room ${input.roomId} inactive and notified people with today's shifts.` });
    }
    await tx.insert(auditLogs).values({ actorUserId: input.actorUserId, action: "UPDATE_GYM_ROOM", details: `Updated room ${input.roomId}; active=${input.active}, capacity=${input.maximumCapacity}, hours=${input.openingTime}-${input.closingTime}.` });
    return { success: true as const };
  });
}

export async function deleteCoachAccount(input: { coachId: number; confirmationName: string; actorUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async (tx: any) => {
    const coach = await tx.select().from(coaches).where(eq(coaches.id, input.coachId)).limit(1);
    if (!coach[0]) throw new Error("Coach profile not found.");
    if (!matchesConfirmationName(input.confirmationName, coach[0].fullName)) throw new Error("Type the Coach name to confirm deletion.");
    const now = new Date();
    const shifts = await tx.select({ id: availabilityShifts.id }).from(availabilityShifts).where(and(
      eq(availabilityShifts.coachId, input.coachId),
      gt(availabilityShifts.endAt, now),
      inArray(availabilityShifts.status, cancellableAvailabilityStatuses),
    ));
    const shiftIds = shifts.map((shift: { id: number }) => shift.id);
    if (shiftIds.length) await tx.update(availabilityShifts).set({ status: "cancelled", updatedBy: input.actorUserId }).where(inArray(availabilityShifts.id, shiftIds));
    const cancellation = await cancelFutureBookingsForShifts(
      tx,
      shiftIds,
      "Coach access was removed by the administrator.",
      "Coach session cancelled",
      `Your session with ${coach[0].fullName} was cancelled because this Coach is no longer available.`,
    );
    await tx.update(coaches).set({ active: false }).where(eq(coaches.id, input.coachId));
    await tx.update(coachAuthorizations).set({ status: "revoked" }).where(eq(coachAuthorizations.coachId, input.coachId));
    if (coach[0].userId) await tx.update(users).set({ role: "client" }).where(eq(users.id, coach[0].userId));
    await tx.insert(auditLogs).values({
      actorUserId: input.actorUserId,
      action: "DELETE_COACH_ACCOUNT",
      targetUserId: coach[0].userId,
      details: `Removed Coach profile ${input.coachId}, demoted the linked account to Client, cancelled ${cancellation.cancelledBookingCount} future booking(s), and preserved history.`,
    });
    return { success: true as const, cancelledBookingCount: cancellation.cancelledBookingCount };
  });
}

export async function deleteGymRoom(input: { roomId: number; confirmationName: string; actorUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async (tx: any) => {
    const room = await tx.select().from(gymRooms).where(eq(gymRooms.id, input.roomId)).limit(1);
    if (!room[0]) throw new Error("Room not found.");
    if (!matchesConfirmationName(input.confirmationName, room[0].name)) throw new Error("Type the room name to confirm deletion.");
    const now = new Date();
    const shifts = await tx.select({ id: availabilityShifts.id }).from(availabilityShifts).where(and(
      or(eq(availabilityShifts.roomId, input.roomId), eq(availabilityShifts.location, room[0].name)),
      gt(availabilityShifts.endAt, now),
      inArray(availabilityShifts.status, cancellableAvailabilityStatuses),
    ));
    const shiftIds = shifts.map((shift: { id: number }) => shift.id);
    if (shiftIds.length) await tx.update(availabilityShifts).set({ status: "cancelled", updatedBy: input.actorUserId }).where(inArray(availabilityShifts.id, shiftIds));
    const title = "Room closed";
    const message = `${room[0].name} was removed by the administrator. Please check your schedule for updates.`;
    await notifyCoachesForShifts(tx, shiftIds, title, message);
    const cancellation = await cancelFutureBookingsForShifts(tx, shiftIds, "The booked room was removed by the administrator.", "Session cancelled", message);
    await tx.update(gymRooms).set({ active: false }).where(eq(gymRooms.id, input.roomId));
    await tx.insert(auditLogs).values({ actorUserId: input.actorUserId, action: "DELETE_GYM_ROOM", details: `Soft-deleted room ${input.roomId}, cancelled ${cancellation.cancelledBookingCount} future booking(s), and notified affected accounts.` });
    return { success: true as const, cancelledBookingCount: cancellation.cancelledBookingCount };
  });
}

export async function getRoomClosures(roomId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select({ id: roomClosures.id, closureDate: roomClosures.closureDate, reason: roomClosures.reason, createdAt: roomClosures.createdAt }).from(roomClosures).where(eq(roomClosures.roomId, roomId));
}

export async function setRoomClosure(input: { roomId: number; closureDate: string; reason?: string; actorUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const { startAt, endAt } = closureDateBounds(input.closureDate);
  return db.transaction(async (tx: any) => {
    const room = await tx.select().from(gymRooms).where(eq(gymRooms.id, input.roomId)).limit(1);
    if (!room[0]) throw new Error("Room not found.");
    const existing = await tx.select({ id: roomClosures.id }).from(roomClosures).where(and(eq(roomClosures.roomId, input.roomId), eq(roomClosures.closureDate, input.closureDate))).limit(1);
    if (existing[0]) {
      await tx.update(roomClosures).set({ reason: input.reason?.trim() || null, createdBy: input.actorUserId }).where(eq(roomClosures.id, existing[0].id));
      await tx.insert(auditLogs).values({ actorUserId: input.actorUserId, action: "UPDATE_ROOM_CLOSURE", details: `Updated closure for room ${input.roomId} on ${input.closureDate}.` });
      return { success: true as const, created: false as const, cancelledBookingCount: 0 };
    }
    await tx.insert(roomClosures).values({ roomId: input.roomId, closureDate: input.closureDate, reason: input.reason?.trim() || null, createdBy: input.actorUserId });
    const shifts = await tx.select({ id: availabilityShifts.id }).from(availabilityShifts).where(and(
      or(eq(availabilityShifts.roomId, input.roomId), eq(availabilityShifts.location, room[0].name)),
      lt(availabilityShifts.startAt, endAt),
      gt(availabilityShifts.endAt, startAt),
    ));
    const shiftIds = shifts.map((shift: { id: number }) => shift.id);
    const title = "Room closed temporarily";
    const reasonText = input.reason?.trim() ? ` Reason: ${input.reason.trim()}.` : "";
    const message = `${room[0].name} is closed on ${input.closureDate}.${reasonText} Please check your schedule for updates.`;
    await notifyCoachesForShifts(tx, shiftIds, title, message);
    const cancellation = await cancelFutureBookingsForShifts(tx, shiftIds, "The booked room is temporarily closed.", "Session cancelled", message);
    await tx.insert(auditLogs).values({ actorUserId: input.actorUserId, action: "CREATE_ROOM_CLOSURE", details: `Closed room ${input.roomId} on ${input.closureDate}; cancelled ${cancellation.cancelledBookingCount} future booking(s).` });
    return { success: true as const, created: true as const, cancelledBookingCount: cancellation.cancelledBookingCount };
  });
}

export async function removeRoomClosure(input: { roomId: number; closureDate: string; actorUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  closureDateBounds(input.closureDate);
  return db.transaction(async (tx: any) => {
    await tx.delete(roomClosures).where(and(eq(roomClosures.roomId, input.roomId), eq(roomClosures.closureDate, input.closureDate)));
    await tx.insert(auditLogs).values({ actorUserId: input.actorUserId, action: "REMOVE_ROOM_CLOSURE", details: `Reopened room ${input.roomId} for ${input.closureDate}.` });
    return { success: true as const };
  });
}

export async function getAdminRoomSchedule(input: { roomId: number; from: Date; to: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const room = await db.select().from(gymRooms).where(eq(gymRooms.id, input.roomId)).limit(1);
  if (!room[0]) throw new Error("Room not found.");
  const candidates = await db.select({ internalId: availabilityShifts.id, roomId: availabilityShifts.roomId, id: availabilityShifts.externalId, startAt: availabilityShifts.startAt, endAt: availabilityShifts.endAt, status: availabilityShifts.status, maximumCapacity: availabilityShifts.maximumCapacity, location: availabilityShifts.location, note: availabilityShifts.note, coachName: coaches.fullName }).from(availabilityShifts).innerJoin(coaches, eq(availabilityShifts.coachId, coaches.id)).where(and(or(eq(availabilityShifts.roomId, input.roomId), isNull(availabilityShifts.roomId)), lt(availabilityShifts.startAt, input.to), gt(availabilityShifts.endAt, input.from)));
  const matchedCandidates = candidates.filter((window) => window.roomId === input.roomId || normalizeRoomName(window.location) === room[0].nameNormalized);
  const windows = matchedCandidates.map(({ internalId: _internalId, roomId: _roomId, ...window }) => window);
  const matchedShiftIds = matchedCandidates.map((window) => window.internalId);
  const bookingRows = matchedShiftIds.length
    ? await db.select({ id: bookings.externalId, status: bookings.status, checkInTime: bookings.checkInTime, clientName: users.name, startAt: timeSlots.startAt, endAt: timeSlots.endAt, availabilityId: availabilityShifts.externalId }).from(bookings).innerJoin(availabilityShifts, eq(bookings.availabilityShiftId, availabilityShifts.id)).innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id)).innerJoin(users, eq(bookings.memberUserId, users.id)).where(and(inArray(bookings.availabilityShiftId, matchedShiftIds), lt(timeSlots.startAt, input.to), gt(timeSlots.endAt, input.from)))
    : [];
  const openAvailabilityCount = windows.filter((window) => window.status.toLowerCase() === "available").length;
  const bookedSessionCount = bookingRows.filter((booking) => !["cancelled", "canceled"].includes(booking.status.toLowerCase())).length;
  return { room: room[0], windows, bookings: bookingRows, summary: { openAvailabilityCount, bookedSessionCount } };
}

export async function listCoachAccounts() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select({
    coachId: coaches.id,
    accountId: users.id,
    fullName: coaches.fullName,
    specialty: coaches.specialty,
    gymId: coaches.gymId,
    email: coachAuthorizations.normalizedEmail,
    active: coaches.active,
    authorizationStatus: coachAuthorizations.status,
    linkedEmail: users.email,
  }).from(coaches)
    .leftJoin(coachAuthorizations, eq(coachAuthorizations.coachId, coaches.id))
    .leftJoin(users, eq(coaches.userId, users.id));
}

export async function listClientAccounts() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select({ id: users.id, name: users.name, username: users.email }).from(users).where(eq(users.role, "client"));
}

/** Real accounts shown only through the managed Preview debug control. */
export async function listPreviewDebugAccounts() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select({
    id: users.id,
    openId: users.openId,
    name: users.name,
    email: users.email,
    role: users.role,
  }).from(users).orderBy(users.role, users.name);
}

export async function grantCoachGoogleAccess(input: {
  email: string;
  fullName: string;
  specialty: string;
  gymId?: number | null;
  actorUserId: number;
  coachId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async (tx: any) => {
    const gymId = input.gymId ?? null;
    if (gymId !== null) {
      const gym = await tx.select({ id: gyms.id }).from(gyms).where(and(eq(gyms.id, gymId), eq(gyms.active, true))).limit(1);
      if (!gym[0]) throw new Error("Select an active gym or leave this optional field unassigned.");
    }
    const normalizedEmail = normalizeGoogleEmail(input.email);
    const matchingUser = await tx.select({ id: users.id, loginMethod: users.loginMethod }).from(users).where(eq(users.emailNormalized, normalizedEmail)).limit(1);
    if (matchingUser[0] && matchingUser[0].loginMethod !== "google") throw new Error("This email is already used by a non-Google account.");
    let coachId = input.coachId;
    if (coachId) {
      const coach = await tx.select({ id: coaches.id, userId: coaches.userId }).from(coaches).where(eq(coaches.id, coachId)).limit(1);
      if (!coach[0]) throw new Error("Coach profile not found.");
      if (coach[0].userId && matchingUser[0] && coach[0].userId !== matchingUser[0].id) throw new Error("This Coach profile is already linked to another Google account.");
      await tx.update(coaches).set({ gymId, fullName: input.fullName, specialty: input.specialty, active: true, userId: matchingUser[0]?.id ?? coach[0].userId }).where(eq(coaches.id, coachId));
      const existingAuthorization = await tx.select({ id: coachAuthorizations.id }).from(coachAuthorizations).where(eq(coachAuthorizations.coachId, coachId)).limit(1);
      if (existingAuthorization[0]) await tx.update(coachAuthorizations).set({ normalizedEmail, status: "authorized" }).where(eq(coachAuthorizations.id, existingAuthorization[0].id));
      else await tx.insert(coachAuthorizations).values({ coachId, normalizedEmail, status: "authorized" });
    } else {
      const existingAuthorization = await tx.select({ id: coachAuthorizations.id }).from(coachAuthorizations).where(eq(coachAuthorizations.normalizedEmail, normalizedEmail)).limit(1);
      if (existingAuthorization[0]) throw new Error("This Google email is already authorized for another Coach profile.");
      const externalId = `coach-${randomUUID()}`;
      await tx.insert(coaches).values({ externalId, gymId, userId: matchingUser[0]?.id ?? null, fullName: input.fullName, specialty: input.specialty, active: true });
      const coach = await tx.select({ id: coaches.id }).from(coaches).where(eq(coaches.externalId, externalId)).limit(1);
      if (!coach[0]) throw new Error("Coach profile could not be created.");
      coachId = coach[0].id;
      await tx.insert(coachAuthorizations).values({ coachId, normalizedEmail, status: "authorized" });
    }
    if (!coachId) throw new Error("Coach profile could not be authorized.");
    if (matchingUser[0]) await tx.update(users).set({ role: "coach", name: input.fullName }).where(eq(users.id, matchingUser[0].id));
    await tx.insert(auditLogs).values({ actorUserId: input.actorUserId, action: input.coachId ? "AUTHORIZE_COACH_GOOGLE_EMAIL" : "GRANT_COACH_GOOGLE_ACCESS", targetUserId: matchingUser[0]?.id ?? null, details: `Authorized ${normalizedEmail} for Coach profile ${coachId}${gymId === null ? " without a default gym" : ` at gym ${gymId}`}.` });
    return { coachId, email: normalizedEmail };
  });
}

export async function setCoachGoogleAccess(input: { coachId: number; status: "revoked" | "disabled"; actorUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async (tx: any) => {
    const coach = await tx.select({ id: coaches.id, userId: coaches.userId }).from(coaches).where(eq(coaches.id, input.coachId)).limit(1);
    if (!coach[0]) throw new Error("Coach profile not found.");
    const authorization = await tx.select({ id: coachAuthorizations.id }).from(coachAuthorizations).where(eq(coachAuthorizations.coachId, input.coachId)).limit(1);
    if (!authorization[0]) throw new Error("This Coach profile has no Google authorization to change.");
    await tx.update(coachAuthorizations).set({ status: input.status }).where(eq(coachAuthorizations.id, authorization[0].id));
    await tx.update(coaches).set({ active: false }).where(eq(coaches.id, input.coachId));
    if (coach[0].userId) await tx.update(users).set({ role: "client" }).where(eq(users.id, coach[0].userId));
    await tx.insert(auditLogs).values({ actorUserId: input.actorUserId, action: input.status === "revoked" ? "REVOKE_COACH_GOOGLE_ACCESS" : "DISABLE_COACH_GOOGLE_ACCESS", targetUserId: coach[0].userId, details: `${input.status} Coach profile ${input.coachId}; existing Coach data was retained.` });
    return { success: true as const };
  });
}

export async function syncVerifiedGoogleUser(input: { openId: string; name: string | null; email: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const normalizedEmail = normalizeGoogleEmail(input.email);
  return db.transaction(async (tx: any) => {
    const existingByOpenId = await tx.select().from(users).where(eq(users.openId, input.openId)).limit(1);
    const existingByEmail = await tx.select().from(users).where(eq(users.emailNormalized, normalizedEmail)).limit(1);
    if (existingByEmail[0] && existingByEmail[0].openId !== input.openId) throw new Error("A separate account already uses this Google email.");
    const authorization = await tx.select({ coachId: coachAuthorizations.coachId, status: coachAuthorizations.status }).from(coachAuthorizations).where(eq(coachAuthorizations.normalizedEmail, normalizedEmail)).limit(1);
    const authorizedCoach = authorization[0]?.status === "authorized" ? authorization[0] : null;
    const priorRole = existingByOpenId[0]?.role;
    const role = googleAccountRole(Boolean(authorizedCoach));
    await tx.insert(users).values({ openId: input.openId, name: input.name, email: normalizedEmail, emailNormalized: normalizedEmail, loginMethod: "google", role, lastSignedIn: new Date() }).onDuplicateKeyUpdate({ set: { name: input.name, email: normalizedEmail, emailNormalized: normalizedEmail, loginMethod: "google", role, lastSignedIn: new Date() } });
    const user = await tx.select().from(users).where(eq(users.openId, input.openId)).limit(1);
    if (!user[0]) throw new Error("Google user could not be saved.");
    if (authorizedCoach) {
      await tx.update(coaches).set({ userId: user[0].id, active: true }).where(eq(coaches.id, authorizedCoach.coachId));
      if (role === "coach" && priorRole !== "coach") {
        await tx.insert(auditLogs).values({
          actorUserId: user[0].id,
          action: "APPLY_COACH_GOOGLE_AUTHORIZATION",
          targetUserId: user[0].id,
          details: `Applied verified Google Coach authorization for ${normalizedEmail} to Coach profile ${authorizedCoach.coachId}.`,
        });
      }
    }
    return user[0];
  });
}

export async function getAuthorizedCoachIdForUser(db: any, userId: number) {
  const result = await db.select({ id: coaches.id }).from(coaches).innerJoin(coachAuthorizations, eq(coachAuthorizations.coachId, coaches.id)).where(and(eq(coaches.userId, userId), eq(coaches.active, true), eq(coachAuthorizations.status, "authorized"))).limit(1);
  return result[0]?.id;
}

// TODO: add feature queries here as your schema grows.
