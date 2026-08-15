import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const bookingLatency = new Trend("coachora_booking_duration", true);
const expectedBusinessRejection = new Counter("coachora_expected_business_rejections");
const workflowFailure = new Rate("coachora_workflow_failure");

function required(name) {
  const value = __ENV[name];
  if (!value) throw new Error(`[load-tests] ${name} is required.`);
  return value;
}

function parseTokens(name) {
  const value = JSON.parse(required(name));
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.length > 20)) {
    throw new Error(`[load-tests] ${name} must be a JSON array of real staging session tokens.`);
  }
  return value;
}

function assertStaging() {
  const baseUrl = required("COACHORA_STAGING_URL").replace(/\/$/, "");
  const url = new URL(baseUrl);
  const forbidden = ["production", "prod", "coachora.com", ".manus.space"];
  if (forbidden.some((value) => url.hostname.toLowerCase().includes(value))) throw new Error("[load-tests] Refusing a target that appears to be production.");
  if (__ENV.COACHORA_STAGING_CONFIRMATION !== "I_CONFIRM_STAGING_ONLY") throw new Error("[load-tests] Explicit staging confirmation is required.");
  if (!/^coachora-load-[a-z0-9-]{8,64}$/i.test(required("COACHORA_LOAD_RUN_ID"))) throw new Error("[load-tests] Invalid run ID.");
  return baseUrl;
}

const baseUrl = assertStaging();
const runId = __ENV.COACHORA_LOAD_RUN_ID;
const clients = parseTokens("COACHORA_CLIENT_TOKENS_JSON");
const coaches = __ENV.COACHORA_COACH_TOKENS_JSON ? parseTokens("COACHORA_COACH_TOKENS_JSON") : [];
const admins = __ENV.COACHORA_ADMIN_TOKENS_JSON ? parseTokens("COACHORA_ADMIN_TOKENS_JSON") : [];
const coachId = Number(required("COACHORA_TEST_COACH_ID"));
const windowId = required("COACHORA_TEST_WINDOW_ID");
const dateStart = required("COACHORA_DATE_START");
const dateEnd = required("COACHORA_DATE_END");
const bookingStartAt = required("COACHORA_BOOKING_START_AT");
const durationMinutes = Number(__ENV.COACHORA_DURATION_MINUTES || "30");
const fullProfile = __ENV.COACHORA_LOAD_PROFILE === "full";

export const options = {
  scenarios: {
    client_workflow: {
      executor: "ramping-vus",
      exec: "clientWorkflow",
      stages: fullProfile
        ? [{ duration: "2m", target: 10 }, { duration: "5m", target: 100 }, { duration: "10m", target: 1000 }, { duration: "30m", target: 1000 }, { duration: "5m", target: 100 }, { duration: "5m", target: 0 }]
        : [{ duration: "30s", target: 10 }, { duration: "60s", target: 10 }, { duration: "20s", target: 0 }],
      gracefulRampDown: "30s",
    },
    booking_spike: {
      executor: "ramping-vus",
      exec: "bookingSpike",
      startTime: fullProfile ? "47m" : "25s",
      stages: fullProfile ? [{ duration: "1m", target: 200 }, { duration: "30s", target: 1000 }, { duration: "3m", target: 100 }, { duration: "2m", target: 0 }] : [{ duration: "20s", target: 20 }, { duration: "20s", target: 0 }],
    },
    staff_read_workflow: {
      executor: "constant-vus",
      exec: "staffWorkflow",
      vus: fullProfile ? 10 : 2,
      duration: fullProfile ? "52m" : "70s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.005"],
    http_req_duration: ["p(95)<1000"],
    coachora_booking_duration: ["p(95)<2000"],
    coachora_workflow_failure: ["rate<0.005"],
  },
};

function headers(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Coachora-Load-Run": runId };
}

function decode(response) {
  if (response.status < 200 || response.status >= 300) return { ok: false, transport: true, message: response.body };
  try {
    const item = JSON.parse(response.body)[0];
    if (item.error) return { ok: false, code: item.error.json?.data?.code, message: item.error.json?.message || "tRPC error" };
    return { ok: true, data: item.result?.data?.json ?? item.result?.data };
  } catch (error) {
    return { ok: false, transport: true, message: `Cannot decode tRPC response: ${error}` };
  }
}

function trpc(path, kind, input, token, tags = {}) {
  const payload = JSON.stringify({ 0: { json: input } });
  const url = `${baseUrl}/api/trpc/${path}?batch=1${kind === "query" ? `&input=${encodeURIComponent(payload)}` : ""}`;
  const response = kind === "query"
    ? http.get(url, { headers: headers(token), tags: { trpc: path, ...tags } })
    : http.post(url, payload, { headers: headers(token), tags: { trpc: path, ...tags } });
  return { response, result: decode(response) };
}

function sessionCheck(token) {
  const response = http.get(`${baseUrl}/api/auth/me`, { headers: headers(token), tags: { route: "auth.me" } });
  const passed = check(response, { "authenticated staging account accepted": (r) => r.status === 200 && !!JSON.parse(r.body).user });
  if (!passed) workflowFailure.add(1);
  return passed;
}

function isExpectedBookingRejection(result) {
  return ["BAD_REQUEST", "CONFLICT"].includes(result.code) || /capacity|overlap|fit inside|future start/i.test(result.message || "");
}

export function clientWorkflow() {
  const token = clients[__VU % clients.length];
  if (!sessionCheck(token)) return;
  group("client browse availability and capacity", () => {
    const browse = trpc("availability.bookable", "query", { coachId, dateStart, dateEnd }, token);
    const preview = trpc("availability.previewCapacity", "query", { windowId, startAt: bookingStartAt, durationMinutes }, token);
    const passed = check(browse.response, { "bookable availability returns": () => browse.result.ok }) && check(preview.response, { "capacity preview returns": () => preview.result.ok });
    workflowFailure.add(passed ? 0 : 1);
  });
  sleep(1 + Math.random() * 3);
  if ((__ITER % 7) !== 0) return;
  group("client booking and cancellation", () => {
    const started = Date.now();
    const booking = trpc("availability.book", "mutation", { windowId, startAt: bookingStartAt, durationMinutes }, token, { operation: "booking" });
    bookingLatency.add(Date.now() - started);
    if (booking.result.ok) {
      const cancellation = trpc("availability.cancel", "mutation", { bookingId: booking.result.data.bookingId, reason: `LOAD_TEST:${runId}` }, token, { operation: "cancel" });
      workflowFailure.add(cancellation.result.ok ? 0 : 1);
    } else if (isExpectedBookingRejection(booking.result)) {
      expectedBusinessRejection.add(1);
    } else {
      workflowFailure.add(1);
    }
  });
  sleep(1 + Math.random() * 2);
}

export function bookingSpike() {
  const token = clients[__VU % clients.length];
  if (!sessionCheck(token)) return;
  const started = Date.now();
  const booking = trpc("availability.book", "mutation", { windowId, startAt: bookingStartAt, durationMinutes }, token, { operation: "capacity-race" });
  bookingLatency.add(Date.now() - started);
  if (booking.result.ok) {
    const cancellation = trpc("availability.cancel", "mutation", { bookingId: booking.result.data.bookingId, reason: `LOAD_TEST:${runId}` }, token, { operation: "capacity-race-cancel" });
    workflowFailure.add(cancellation.result.ok ? 0 : 1);
  } else if (isExpectedBookingRejection(booking.result)) {
    expectedBusinessRejection.add(1);
  } else {
    workflowFailure.add(1);
  }
  sleep(0.5 + Math.random());
}

export function staffWorkflow() {
  const staff = coaches.length ? coaches[__VU % coaches.length] : admins[__VU % admins.length];
  if (!staff || !sessionCheck(staff)) return;
  const coachRead = coaches.length ? trpc("availability.mine", "query", {}, staff, { role: "coach" }) : null;
  const adminRead = admins.length ? trpc("availability.adminList", "query", {}, admins[__VU % admins.length], { role: "admin" }) : null;
  const passed = (!coachRead || coachRead.result.ok) && (!adminRead || adminRead.result.ok);
  workflowFailure.add(passed ? 0 : 1);
  sleep(2 + Math.random() * 4);
}
