import { and, eq, gt, inArray, lt, or } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { auditLogs, availabilityShifts, bookings, coachAuthorizations, coaches, gymRooms, gyms, InsertUser, timeSlots, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { normalizeGoogleEmail } from "./google-authorization";

export function normalizeRoomName(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
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
  return db.select({ id: gymRooms.id, externalId: gymRooms.externalId, gymId: gymRooms.gymId, name: gymRooms.name, address: gymRooms.address, description: gymRooms.description, maximumCapacity: gymRooms.maximumCapacity, active: gymRooms.active }).from(gymRooms).where(input.activeOnly ? eq(gymRooms.active, true) : undefined);
}

export async function createGymRoom(input: { gymId: number; name: string; address: string; description: string; maximumCapacity: number; actorUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const name = input.name.trim();
  const nameNormalized = normalizeRoomName(name);
  if (!nameNormalized) throw new Error("Enter a room name.");
  return db.transaction(async (tx: any) => {
    const gym = await tx.select({ id: gyms.id }).from(gyms).where(and(eq(gyms.id, input.gymId), eq(gyms.active, true))).limit(1);
    if (!gym[0]) throw new Error("Select an active gym for this room.");
    const existing = await tx.select({ id: gymRooms.id }).from(gymRooms).where(and(eq(gymRooms.gymId, input.gymId), eq(gymRooms.nameNormalized, nameNormalized))).limit(1);
    if (existing[0]) throw new Error("A room with this name already exists at this gym.");
    const externalId = `room-${randomUUID()}`;
    await tx.insert(gymRooms).values({ externalId, gymId: input.gymId, name, nameNormalized, address: input.address.trim(), description: input.description.trim(), maximumCapacity: input.maximumCapacity, active: true });
    const room = await tx.select({ id: gymRooms.id }).from(gymRooms).where(eq(gymRooms.externalId, externalId)).limit(1);
    if (!room[0]) throw new Error("Room could not be created.");
    await tx.insert(auditLogs).values({ actorUserId: input.actorUserId, action: "CREATE_GYM_ROOM", details: `Created room ${name} (${room[0].id}) at gym ${input.gymId} with capacity ${input.maximumCapacity}.` });
    return { id: room[0].id };
  });
}

export async function updateGymRoom(input: { roomId: number; gymId: number; name: string; address: string; description: string; maximumCapacity: number; active: boolean; actorUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const name = input.name.trim();
  const nameNormalized = normalizeRoomName(name);
  if (!nameNormalized) throw new Error("Enter a room name.");
  return db.transaction(async (tx: any) => {
    const room = await tx.select().from(gymRooms).where(eq(gymRooms.id, input.roomId)).limit(1);
    if (!room[0]) throw new Error("Room not found.");
    const conflicts = await tx.select({ id: availabilityShifts.id }).from(availabilityShifts).where(and(eq(availabilityShifts.roomId, input.roomId), gt(availabilityShifts.maximumCapacity, input.maximumCapacity), gt(availabilityShifts.endAt, new Date()), inArray(availabilityShifts.status, ["available", "booked", "blocked"]))).limit(1);
    if (conflicts[0]) throw new Error("Increase this room capacity or update its future availability windows first.");
    const duplicate = await tx.select({ id: gymRooms.id }).from(gymRooms).where(and(eq(gymRooms.gymId, input.gymId), eq(gymRooms.nameNormalized, nameNormalized))).limit(1);
    if (duplicate[0] && duplicate[0].id !== input.roomId) throw new Error("A room with this name already exists at this gym.");
    await tx.update(gymRooms).set({ gymId: input.gymId, name, nameNormalized, address: input.address.trim(), description: input.description.trim(), maximumCapacity: input.maximumCapacity, active: input.active }).where(eq(gymRooms.id, input.roomId));
    await tx.insert(auditLogs).values({ actorUserId: input.actorUserId, action: "UPDATE_GYM_ROOM", details: `Updated room ${input.roomId}; active=${input.active}, capacity=${input.maximumCapacity}.` });
    return { success: true as const };
  });
}

export async function getAdminRoomSchedule(input: { roomId: number; from: Date; to: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const room = await db.select().from(gymRooms).where(eq(gymRooms.id, input.roomId)).limit(1);
  if (!room[0]) throw new Error("Room not found.");
  const roomMatch = or(eq(availabilityShifts.roomId, input.roomId), eq(availabilityShifts.location, room[0].name));
  const windows = await db.select({ id: availabilityShifts.externalId, startAt: availabilityShifts.startAt, endAt: availabilityShifts.endAt, status: availabilityShifts.status, maximumCapacity: availabilityShifts.maximumCapacity, location: availabilityShifts.location, note: availabilityShifts.note, coachName: coaches.fullName }).from(availabilityShifts).innerJoin(coaches, eq(availabilityShifts.coachId, coaches.id)).where(and(roomMatch, lt(availabilityShifts.startAt, input.to), gt(availabilityShifts.endAt, input.from)));
  const bookingRows = await db.select({ id: bookings.externalId, status: bookings.status, checkInTime: bookings.checkInTime, clientName: users.name, startAt: timeSlots.startAt, endAt: timeSlots.endAt, availabilityId: availabilityShifts.externalId }).from(bookings).innerJoin(availabilityShifts, eq(bookings.availabilityShiftId, availabilityShifts.id)).innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id)).innerJoin(users, eq(bookings.memberUserId, users.id)).where(and(roomMatch, lt(timeSlots.startAt, input.to), gt(timeSlots.endAt, input.from)));
  return { room: room[0], windows, bookings: bookingRows };
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

export async function grantCoachGoogleAccess(input: {
  email: string;
  fullName: string;
  specialty: string;
  gymId: number;
  actorUserId: number;
  coachId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async (tx: any) => {
    const gym = await tx.select({ id: gyms.id }).from(gyms).where(and(eq(gyms.id, input.gymId), eq(gyms.active, true))).limit(1);
    if (!gym[0]) throw new Error("Select an active gym for this Coach profile.");
    const normalizedEmail = normalizeGoogleEmail(input.email);
    const matchingUser = await tx.select({ id: users.id, loginMethod: users.loginMethod }).from(users).where(eq(users.emailNormalized, normalizedEmail)).limit(1);
    if (matchingUser[0] && matchingUser[0].loginMethod !== "google") throw new Error("This email is already used by a non-Google account.");
    let coachId = input.coachId;
    if (coachId) {
      const coach = await tx.select({ id: coaches.id, userId: coaches.userId }).from(coaches).where(eq(coaches.id, coachId)).limit(1);
      if (!coach[0]) throw new Error("Coach profile not found.");
      if (coach[0].userId && matchingUser[0] && coach[0].userId !== matchingUser[0].id) throw new Error("This Coach profile is already linked to another Google account.");
      await tx.update(coaches).set({ gymId: input.gymId, fullName: input.fullName, specialty: input.specialty, active: true, userId: matchingUser[0]?.id ?? coach[0].userId }).where(eq(coaches.id, coachId));
      const existingAuthorization = await tx.select({ id: coachAuthorizations.id }).from(coachAuthorizations).where(eq(coachAuthorizations.coachId, coachId)).limit(1);
      if (existingAuthorization[0]) await tx.update(coachAuthorizations).set({ normalizedEmail, status: "authorized" }).where(eq(coachAuthorizations.id, existingAuthorization[0].id));
      else await tx.insert(coachAuthorizations).values({ coachId, normalizedEmail, status: "authorized" });
    } else {
      const existingAuthorization = await tx.select({ id: coachAuthorizations.id }).from(coachAuthorizations).where(eq(coachAuthorizations.normalizedEmail, normalizedEmail)).limit(1);
      if (existingAuthorization[0]) throw new Error("This Google email is already authorized for another Coach profile.");
      const externalId = `coach-${randomUUID()}`;
      await tx.insert(coaches).values({ externalId, gymId: input.gymId, userId: matchingUser[0]?.id ?? null, fullName: input.fullName, specialty: input.specialty, active: true });
      const coach = await tx.select({ id: coaches.id }).from(coaches).where(eq(coaches.externalId, externalId)).limit(1);
      if (!coach[0]) throw new Error("Coach profile could not be created.");
      coachId = coach[0].id;
      await tx.insert(coachAuthorizations).values({ coachId, normalizedEmail, status: "authorized" });
    }
    if (!coachId) throw new Error("Coach profile could not be authorized.");
    if (matchingUser[0]) await tx.update(users).set({ role: "coach", name: input.fullName }).where(eq(users.id, matchingUser[0].id));
    await tx.insert(auditLogs).values({ actorUserId: input.actorUserId, action: input.coachId ? "AUTHORIZE_COACH_GOOGLE_EMAIL" : "GRANT_COACH_GOOGLE_ACCESS", targetUserId: matchingUser[0]?.id ?? null, details: `Authorized ${normalizedEmail} for Coach profile ${coachId} at gym ${input.gymId}.` });
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
    const role = priorRole === "admin" ? "admin" : authorizedCoach ? "coach" : "client";
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
