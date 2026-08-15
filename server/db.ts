import { and, eq } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { auditLogs, coaches, gyms, InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

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
  role: "client" | "coach" | "admin";
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

export async function listActiveGyms() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select({ id: gyms.id, name: gyms.name, address: gyms.address }).from(gyms).where(eq(gyms.active, true));
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
    username: users.email,
    active: coaches.active,
  }).from(coaches).leftJoin(users, eq(coaches.userId, users.id)).where(eq(coaches.active, true));
}

export async function listClientAccounts() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select({ id: users.id, name: users.name, username: users.email }).from(users).where(eq(users.role, "client"));
}

export async function createLocalCoachAccount(input: {
  username: string;
  passwordHash: string;
  fullName: string;
  specialty: string;
  gymId: number;
  actorUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  return db.transaction(async (tx: any) => {
    const gym = await tx.select({ id: gyms.id }).from(gyms).where(and(eq(gyms.id, input.gymId), eq(gyms.active, true))).limit(1);
    if (!gym[0]) throw new Error("Select an active gym for this Coach account.");

    const openId = `local:${input.username}`;
    const existing = await tx.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
    if (existing[0]) throw new Error("That username is already in use.");

    await tx.insert(users).values({
      openId,
      name: input.fullName,
      email: input.username,
      loginMethod: "local",
      passwordHash: input.passwordHash,
      role: "coach",
      lastSignedIn: new Date(),
    });
    const user = await tx.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
    if (!user[0]) throw new Error("Coach account could not be created.");

    const externalId = `coach-${randomUUID()}`;
    await tx.insert(coaches).values({
      externalId,
      gymId: input.gymId,
      userId: user[0].id,
      fullName: input.fullName,
      specialty: input.specialty,
      active: true,
    });
    await tx.insert(auditLogs).values({
      actorUserId: input.actorUserId,
      action: "CREATE_COACH_ACCOUNT",
      targetUserId: user[0].id,
      details: `Created Coach account ${input.username} for gym ${input.gymId}.`,
    });

    return { accountId: user[0].id, coachId: externalId };
  });
}

export async function promoteClientToCoach(input: {
  userId: number;
  fullName: string;
  specialty: string;
  gymId: number;
  actorUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  return db.transaction(async (tx: any) => {
    const gym = await tx.select({ id: gyms.id }).from(gyms).where(and(eq(gyms.id, input.gymId), eq(gyms.active, true))).limit(1);
    if (!gym[0]) throw new Error("Select an active gym for this Coach profile.");
    const user = await tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!user[0] || user[0].role !== "client") throw new Error("Only an existing Client account can be promoted to Coach.");
    const existingCoach = await tx.select({ id: coaches.id }).from(coaches).where(eq(coaches.userId, input.userId)).limit(1);
    if (existingCoach[0]) throw new Error("This Client already has a Coach profile.");

    await tx.update(users).set({ role: "coach", name: input.fullName }).where(eq(users.id, input.userId));
    const externalId = `coach-${randomUUID()}`;
    await tx.insert(coaches).values({ externalId, gymId: input.gymId, userId: input.userId, fullName: input.fullName, specialty: input.specialty, active: true });
    await tx.insert(auditLogs).values({
      actorUserId: input.actorUserId,
      action: "PROMOTE_CLIENT_TO_COACH",
      targetUserId: input.userId,
      details: `Promoted Client ${input.userId} to Coach at gym ${input.gymId}.`,
    });
    return { accountId: input.userId, coachId: externalId };
  });
}

// TODO: add feature queries here as your schema grows.
