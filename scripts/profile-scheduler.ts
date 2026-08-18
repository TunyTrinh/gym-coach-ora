import { appRouter } from "../server/routers";
import type { TrpcContext } from "../server/_core/context";

type TimingSample = {
  calendarMs: number;
  scheduleMs: number;
  totalMs: number;
  schedulePayloadBytes: number;
  calendarPayloadBytes: number;
  queryMs: number;
};

type SchedulerDiagnostics = {
  diagnostics: {
    totalMs: number;
    queries: Array<{ name: string; durationMs: number; rows: number }>;
  };
};

const percentile = (values: number[], percentileValue: number) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)] ?? 0;
};

const clientAdminContext: TrpcContext = {
  user: {
    id: 1,
    openId: "scheduler-profile-admin",
    email: "scheduler-profile@coachora.local",
    emailNormalized: "scheduler-profile@coachora.local",
    name: "Scheduler profile",
    loginMethod: "diagnostics",
    passwordHash: null,
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
};

async function profile(date: string, iterations = 30) {
  const caller = appRouter.createCaller(clientAdminContext);
  const samples: TimingSample[] = [];

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const startedAt = performance.now();
    const calendarStartedAt = performance.now();
    const calendarPromise = caller.availability.roomCalendar({ from: date, to: date }).then((value) => ({ value, durationMs: performance.now() - calendarStartedAt }));
    const scheduleStartedAt = performance.now();
    const schedulePromise = caller.availability.roomSchedule({ date, diagnostics: true }).then((value) => ({ value, durationMs: performance.now() - scheduleStartedAt }));
    const [calendarResult, scheduleResult] = await Promise.all([calendarPromise, schedulePromise]);
    const completedAt = performance.now();
    samples.push({
      calendarMs: calendarResult.durationMs,
      scheduleMs: scheduleResult.durationMs,
      totalMs: completedAt - startedAt,
      calendarPayloadBytes: Buffer.byteLength(JSON.stringify(calendarResult.value)),
      schedulePayloadBytes: Buffer.byteLength(JSON.stringify(scheduleResult.value)),
      queryMs: (scheduleResult.value as SchedulerDiagnostics).diagnostics.queries.reduce((total: number, item) => total + item.durationMs, 0),
    });
  }

  const summary = (name: keyof TimingSample) => ({
    p50: Number(percentile(samples.map((sample) => sample[name]), 0.5).toFixed(2)),
    p95: Number(percentile(samples.map((sample) => sample[name]), 0.95).toFixed(2)),
  });
  const latest = samples.at(-1)!;
  const schedule = await caller.availability.roomSchedule({ date, diagnostics: true }) as SchedulerDiagnostics;
  const normalSchedule = await caller.availability.roomSchedule({ date });

  return {
    date,
    iterations,
    logicalRequests: { initialSchedulerOpen: 2, dateChange: 1, roomScheduleObservers: 1 },
    parallelInitialRead: true,
    timingsMs: {
      calendar: summary("calendarMs"),
      roomSchedule: summary("scheduleMs"),
      combinedInitialRead: summary("totalMs"),
      roomScheduleAggregateDatabaseQueryTime: summary("queryMs"),
    },
    payloadBytes: {
      calendar: latest.calendarPayloadBytes,
      roomScheduleWithDiagnostics: latest.schedulePayloadBytes,
      roomScheduleNormal: Buffer.byteLength(JSON.stringify(normalSchedule)),
    },
    latestDatabaseReadBreakdown: schedule.diagnostics,
  };
}

const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);

profile(date).then((result) => {
  console.log(JSON.stringify(result, null, 2));
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
