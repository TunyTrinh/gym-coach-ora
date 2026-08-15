import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import mysql from "mysql2/promise";
import { assertLocalSmokeTarget } from "../lib/guard.mjs";

const { appUrl, database } = assertLocalSmokeTarget();
const runId = process.env.COACHORA_LOCAL_SMOKE_RUN_ID;
if (!/^coachora-local-smoke-[a-z0-9-]{8,64}$/i.test(runId ?? "")) throw new Error("[load-tests] Valid local run ID required.");
const fixture = JSON.parse(await readFile(join(new URL("./.runtime/", import.meta.url).pathname, `${runId}.json`), "utf8"));
const durationMs = Number(process.env.COACHORA_LOCAL_SMOKE_DURATION_MS ?? "120000");
if (durationMs !== 120000) throw new Error("[load-tests] This approved local smoke run is fixed at 120000 ms (two minutes).");

const metrics = { startedAt: new Date().toISOString(), durationMs, requests: 0, successes: 0, expectedCapacityRejections: 0, expectedUnauthorized: 0, failures: [], bookingLatenciesMs: [], cancellations: 0 };
function trpcUrl(path, input) { return `${appUrl}/api/trpc/${path}?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: { json: input } }))}`; }
async function query(path, input, token) {
  const response = await fetch(trpcUrl(path, input), { headers: token ? { Authorization: `Bearer ${token}`, "X-Coachora-Load-Run": fixture.runId } : {} });
  const body = await response.text(); metrics.requests += 1;
  let parsed; try { parsed = JSON.parse(body)[0]; } catch { return { response, error: { message: body } }; }
  return { response, data: parsed.result?.data?.json ?? parsed.result?.data, error: parsed.error?.json };
}
async function mutation(path, input, token) {
  const response = await fetch(`${appUrl}/api/trpc/${path}?batch=1`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Coachora-Load-Run": fixture.runId }, body: JSON.stringify({ 0: { json: input } }) });
  const body = await response.text(); metrics.requests += 1;
  let parsed; try { parsed = JSON.parse(body)[0]; } catch { return { response, error: { message: body } }; }
  return { response, data: parsed.result?.data?.json ?? parsed.result?.data, error: parsed.error?.json };
}
function expected(error) { return /capacity|overlap|fit inside|future start/i.test(error?.message ?? ""); }
async function worker(client, index, until) {
  while (Date.now() < until) {
    const browse = await query("availability.bookable", { coachId: fixture.coachId, dateStart: fixture.dateStart, dateEnd: fixture.dateEnd }, client.token);
    const preview = await query("availability.previewCapacity", { windowId: fixture.windowId, startAt: fixture.bookingStartAt, durationMinutes: fixture.durationMinutes }, client.token);
    if (!browse.data || !preview.data) metrics.failures.push(`browse/preview client-${index}`);
    if ((metrics.requests + index) % 4 === 0) {
      const started = performance.now();
      const booking = await mutation("availability.book", { windowId: fixture.windowId, startAt: fixture.bookingStartAt, durationMinutes: fixture.durationMinutes }, client.token);
      metrics.bookingLatenciesMs.push(performance.now() - started);
      if (booking.data?.bookingId) {
        metrics.successes += 1;
        const cancellation = await mutation("availability.cancel", { bookingId: booking.data.bookingId, reason: `LOAD_TEST:${fixture.runId}` }, client.token);
        if (cancellation.data?.success) metrics.cancellations += 1; else metrics.failures.push(`cancel client-${index}`);
      } else if (expected(booking.error)) metrics.expectedCapacityRejections += 1;
      else metrics.failures.push(`booking client-${index}: ${booking.error?.message ?? "unknown"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

const unauthenticated = await query("availability.bookable", { coachId: fixture.coachId, dateStart: fixture.dateStart, dateEnd: fixture.dateEnd });
if (unauthenticated.response.status === 401 || unauthenticated.error?.data?.code === "UNAUTHORIZED") metrics.expectedUnauthorized += 1; else metrics.failures.push("unauthenticated request was not rejected");
const until = Date.now() + durationMs;
await Promise.all(fixture.clients.map((client, index) => worker(client, index + 1, until)));
const pool = mysql.createPool(database);
const [[windowRow]] = await pool.execute("SELECT id, maximumCapacity FROM availabilityShifts WHERE externalId = ? AND note = ?", [fixture.windowId, `LOAD_TEST:${fixture.runId}`]);
const [[activeRow]] = await pool.execute("SELECT COUNT(*) AS count FROM bookings WHERE availabilityShiftId = ? AND status IN ('pending','confirmed')", [windowRow.id]);
const [[orphanRow]] = await pool.execute("SELECT COUNT(*) AS count FROM bookings b LEFT JOIN timeSlots t ON t.id = b.timeSlotId WHERE b.availabilityShiftId = ? AND t.id IS NULL", [windowRow.id]);
metrics.activeBookingsAfterRun = activeRow.count;
metrics.capacity = windowRow.maximumCapacity;
metrics.orphanBookingSlots = orphanRow.count;
if (activeRow.count > windowRow.maximumCapacity) metrics.failures.push("capacity exceeded");
if (orphanRow.count !== 0) metrics.failures.push("booking/timeSlot inconsistency");
metrics.finishedAt = new Date().toISOString();
metrics.p95BookingLatencyMs = metrics.bookingLatenciesMs.length ? metrics.bookingLatenciesMs.sort((a, b) => a - b)[Math.ceil(metrics.bookingLatenciesMs.length * 0.95) - 1] : null;
await writeFile(join(new URL("./.runtime/", import.meta.url).pathname, `${runId}-results.json`), JSON.stringify(metrics, null, 2), { mode: 0o600 });
await pool.end();
if (metrics.failures.length) throw new Error(`[load-tests] smoke failures: ${metrics.failures.join("; ")}`);
console.log(JSON.stringify(metrics, null, 2));
