import mysql from "mysql2/promise";
import { assertRunId, assertStagingDatabase } from "../lib/guard.mjs";

const runId = assertRunId();
const databaseUrl = assertStagingDatabase();
if (process.env.COACHORA_LOAD_CLEANUP_CONFIRMATION !== "DELETE_ONLY_THIS_RUN") {
  throw new Error("[load-tests] Set COACHORA_LOAD_CLEANUP_CONFIRMATION=DELETE_ONLY_THIS_RUN to enable cleanup.");
}

const pool = mysql.createPool(databaseUrl);
const connection = await pool.getConnection();
try {
  await connection.beginTransaction();
  const [windows] = await connection.execute("SELECT id FROM availabilityShifts WHERE note = ?", [`LOAD_TEST:${runId}`]);
  const ids = windows.map((row) => row.id);
  if (!ids.length) {
    await connection.commit();
    console.log(`[load-tests] No run-scoped availability records found for ${runId}.`);
  } else {
    const placeholders = ids.map(() => "?").join(",");
    const [bookingRows] = await connection.execute(`SELECT id, timeSlotId FROM bookings WHERE availabilityShiftId IN (${placeholders})`, ids);
    const bookingIds = bookingRows.map((row) => row.id);
    const slotIds = bookingRows.map((row) => row.timeSlotId);
    if (bookingIds.length) {
      await connection.execute(`DELETE FROM notifications WHERE relatedBookingId IN (${bookingIds.map(() => "?").join(",")})`, bookingIds);
      await connection.execute(`DELETE FROM bookings WHERE id IN (${bookingIds.map(() => "?").join(",")})`, bookingIds);
    }
    if (slotIds.length) await connection.execute(`DELETE FROM timeSlots WHERE id IN (${slotIds.map(() => "?").join(",")})`, slotIds);
    await connection.execute(`DELETE FROM availabilityShifts WHERE id IN (${placeholders})`, ids);
    await connection.execute("DELETE FROM auditLogs WHERE details LIKE ?", [`%LOAD_TEST:${runId}%`]);
    await connection.commit();
    console.log(`[load-tests] Deleted only records related to ${runId}: ${ids.length} availability windows, ${bookingIds.length} bookings.`);
  }
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  await pool.end();
}
