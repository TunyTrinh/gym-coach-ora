import mysql from "mysql2/promise";
import { assertLocalSmokeTarget } from "../lib/guard.mjs";

const { database } = assertLocalSmokeTarget();
const runId = process.env.COACHORA_LOCAL_SMOKE_RUN_ID;
if (!/^coachora-local-smoke-[a-z0-9-]{8,64}$/i.test(runId ?? "")) {
  throw new Error("[load-tests] Valid local smoke run ID required.");
}
if (process.env.COACHORA_LOCAL_SMOKE_CLEANUP_CONFIRMATION !== "DELETE_ONLY_THIS_LOCAL_RUN") {
  throw new Error("[load-tests] Set COACHORA_LOCAL_SMOKE_CLEANUP_CONFIRMATION=DELETE_ONLY_THIS_LOCAL_RUN to enable cleanup.");
}

const pool = mysql.createPool(database);
const connection = await pool.getConnection();
const runTag = `LOAD_TEST:${runId}`;

function placeholders(values) {
  return values.map(() => "?").join(",");
}

try {
  await connection.beginTransaction();

  const [userRows] = await connection.execute(
    "SELECT id FROM users WHERE openId LIKE ?",
    [`local-load:${runId}:%`],
  );
  const userIds = userRows.map((row) => row.id);
  const [windowRows] = await connection.execute(
    "SELECT id FROM availabilityShifts WHERE note = ?",
    [runTag],
  );
  const windowIds = windowRows.map((row) => row.id);
  const [bookingRows] = windowIds.length
    ? await connection.execute(
        `SELECT id, timeSlotId FROM bookings WHERE availabilityShiftId IN (${placeholders(windowIds)})`,
        windowIds,
      )
    : [[]];
  const bookingIds = bookingRows.map((row) => row.id);
  const slotIds = bookingRows.map((row) => row.timeSlotId);

  if (bookingIds.length) {
    await connection.execute(
      `DELETE FROM notifications WHERE relatedBookingId IN (${placeholders(bookingIds)})`,
      bookingIds,
    );
    await connection.execute(
      `DELETE FROM bookings WHERE id IN (${placeholders(bookingIds)})`,
      bookingIds,
    );
  }
  if (slotIds.length) {
    await connection.execute(
      `DELETE FROM timeSlots WHERE id IN (${placeholders(slotIds)})`,
      slotIds,
    );
  }
  if (windowIds.length) {
    await connection.execute(
      `DELETE FROM availabilityShifts WHERE id IN (${placeholders(windowIds)})`,
      windowIds,
    );
  }
  if (userIds.length) {
    const ids = placeholders(userIds);
    await connection.execute(`DELETE FROM notifications WHERE userId IN (${ids})`, userIds);
    await connection.execute(`DELETE FROM healthMeasurements WHERE userId IN (${ids}) OR recordedBy IN (${ids})`, [...userIds, ...userIds]);
    await connection.execute(`DELETE FROM coachNotes WHERE clientUserId IN (${ids})`, userIds);
    await connection.execute(`DELETE FROM coachClients WHERE clientUserId IN (${ids}) OR assignedBy IN (${ids})`, [...userIds, ...userIds]);
    await connection.execute(`DELETE FROM auditLogs WHERE actorUserId IN (${ids}) OR targetUserId IN (${ids})`, [...userIds, ...userIds]);
    await connection.execute(`DELETE FROM coaches WHERE userId IN (${ids})`, userIds);
    await connection.execute(`DELETE FROM users WHERE id IN (${ids})`, userIds);
  }
  await connection.execute("DELETE FROM auditLogs WHERE details LIKE ?", [`%${runTag}%`]);
  await connection.execute("DELETE FROM serviceTypes WHERE name = ? AND description = ?", [runTag, runTag]);
  await connection.execute("DELETE FROM gyms WHERE name = ? AND address = ?", [runTag, "127.0.0.1 local-only"]);

  await connection.commit();
  console.log(JSON.stringify({ runId, deleted: { users: userIds.length, availabilityWindows: windowIds.length, bookings: bookingIds.length, timeSlots: slotIds.length } }, null, 2));
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  await pool.end();
}
