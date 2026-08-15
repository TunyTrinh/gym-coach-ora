import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SignJWT } from "jose";
import mysql from "mysql2/promise";
import { assertLocalSmokeTarget } from "../lib/guard.mjs";

const { database } = assertLocalSmokeTarget();
const runId = process.env.COACHORA_LOCAL_SMOKE_RUN_ID;
const jwtSecret = process.env.COACHORA_LOCAL_SMOKE_JWT_SECRET;
if (!/^coachora-local-smoke-[a-z0-9-]{8,64}$/i.test(runId ?? "")) throw new Error("[load-tests] COACHORA_LOCAL_SMOKE_RUN_ID must begin coachora-local-smoke-.");
if (!jwtSecret || jwtSecret.length < 32) throw new Error("[load-tests] COACHORA_LOCAL_SMOKE_JWT_SECRET must be a local random value of at least 32 characters.");

const pool = mysql.createPool(database);
const connection = await pool.getConnection();
const now = new Date();
const startAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2, 9, 0, 0));
const endAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2, 21, 0, 0));
const bookingStartAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2, 10, 0, 0));
const testName = `LOAD_TEST:${runId}`;
const tokenSecret = new TextEncoder().encode(jwtSecret);

async function tokenFor(openId, name) {
  return new SignJWT({ openId, appId: "coachora-local-smoke", name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime("1h")
    .sign(tokenSecret);
}

async function insertUser(role, suffix, name) {
  const openId = `local-load:${runId}:${suffix}`;
  await connection.execute(
    "INSERT INTO users (openId, name, email, loginMethod, role) VALUES (?, ?, ?, 'local-load-test', ?)",
    [openId, name, `${suffix}.${runId}@local.test`, role],
  );
  const [rows] = await connection.execute("SELECT id FROM users WHERE openId = ?", [openId]);
  return { id: rows[0].id, openId, token: await tokenFor(openId, name) };
}

try {
  await connection.beginTransaction();
  const [existing] = await connection.execute("SELECT id FROM users WHERE openId LIKE ?", [`local-load:${runId}:%`]);
  if (existing.length) throw new Error(`[load-tests] Run ${runId} already exists; choose a new run ID.`);
  const admin = await insertUser("admin", "admin", "Local Load Admin");
  const coachUser = await insertUser("coach", "coach", "Local Load Coach");
  const clients = [];
  for (let index = 1; index <= 10; index += 1) clients.push(await insertUser("client", `client-${index}`, `Local Load Client ${index}`));
  const gymExternalId = `gym-${randomUUID()}`;
  await connection.execute("INSERT INTO gyms (externalId, name, address, timezone, active) VALUES (?, ?, ?, 'UTC', true)", [gymExternalId, testName, "127.0.0.1 local-only"]);
  const [[gym]] = await connection.execute("SELECT id FROM gyms WHERE externalId = ?", [gymExternalId]);
  const serviceExternalId = `service-${randomUUID()}`;
  await connection.execute("INSERT INTO serviceTypes (externalId, name, description, durationMinutes, defaultCapacity, coachRequired, cancellationWindowMinutes, active) VALUES (?, ?, ?, 30, 3, true, 0, true)", [serviceExternalId, testName, testName]);
  const [[service]] = await connection.execute("SELECT id FROM serviceTypes WHERE externalId = ?", [serviceExternalId]);
  const coachExternalId = `coach-${randomUUID()}`;
  await connection.execute("INSERT INTO coaches (externalId, gymId, userId, fullName, specialty, active) VALUES (?, ?, ?, ?, ?, true)", [coachExternalId, gym.id, coachUser.id, "Local Load Coach", "Load verification"]);
  const [[coach]] = await connection.execute("SELECT id FROM coaches WHERE externalId = ?", [coachExternalId]);
  const availabilityExternalId = `availability-${randomUUID()}`;
  await connection.execute(
    "INSERT INTO availabilityShifts (externalId, gymId, coachId, serviceTypeId, startAt, endAt, maximumCapacity, location, note, status, createdBy) VALUES (?, ?, ?, ?, ?, ?, 3, 'LOCAL_TEST_ONLY', ?, 'available', ?)",
    [availabilityExternalId, gym.id, coach.id, service.id, startAt, endAt, testName, coachUser.id],
  );
  await connection.commit();
  await mkdir(new URL("./.runtime/", import.meta.url), { recursive: true });
  const fixture = {
    runId,
    admin,
    coach: { ...coachUser, coachId: coach.id },
    clients,
    windowId: availabilityExternalId,
    coachId: coach.id,
    dateStart: new Date(Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate())).toISOString(),
    dateEnd: new Date(Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate() + 1)).toISOString(),
    bookingStartAt: bookingStartAt.toISOString(),
    durationMinutes: 30,
    capacity: 3,
  };
  await writeFile(join(new URL("./.runtime/", import.meta.url).pathname, `${runId}.json`), JSON.stringify(fixture, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ runId, coachId: fixture.coachId, windowId: fixture.windowId, clients: fixture.clients.length, bookingStartAt: fixture.bookingStartAt }, null, 2));
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  await pool.end();
}
