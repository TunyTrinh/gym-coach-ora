export type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  const existing = formatterCache.get(timeZone);
  if (existing) return existing;
  const created = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatterCache.set(timeZone, created);
  return created;
}

export function zonedParts(value: Date, timeZone: string): ZonedDateParts {
  const parts = Object.fromEntries(
    formatter(timeZone).formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function parseDateKey(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
    ? { year, month, day }
    : null;
}

function parseClock(time: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

/** Converts a gym-local wall clock to UTC without consulting the process timezone. */
export function gymLocalDateTime(date: string, time: string, timeZone: string) {
  const day = parseDateKey(date);
  const clock = parseClock(time);
  if (!day || !clock) return null;
  const target = Date.UTC(day.year, day.month - 1, day.day, clock.hour, clock.minute, 0);
  let candidate = target;
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const observed = zonedParts(new Date(candidate), timeZone);
    const observedAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second);
    const correction = target - observedAsUtc;
    candidate += correction;
    if (correction === 0) break;
  }
  const resolved = new Date(candidate);
  const parts = zonedParts(resolved, timeZone);
  if (parts.year !== day.year || parts.month !== day.month || parts.day !== day.day || parts.hour !== clock.hour || parts.minute !== clock.minute) {
    return null;
  }
  const isSameWallClock = (probe: Date) => {
    const candidateParts = zonedParts(probe, timeZone);
    return candidateParts.year === day.year && candidateParts.month === day.month && candidateParts.day === day.day && candidateParts.hour === clock.hour && candidateParts.minute === clock.minute;
  };
  for (const offsetMinutes of [-120, -90, -60, -30, 30, 60, 90, 120]) {
    if (isSameWallClock(new Date(resolved.getTime() + offsetMinutes * 60_000))) return null;
  }
  return resolved;
}

export function gymDateKey(value: Date, timeZone: string) {
  const parts = zonedParts(value, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function addCalendarDays(date: string, days: number) {
  const parsed = parseDateKey(date);
  if (!parsed) return null;
  const value = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

export function gymDayBounds(date: string, timeZone: string) {
  const nextDate = addCalendarDays(date, 1);
  const startAt = gymLocalDateTime(date, "00:00", timeZone);
  const endAt = nextDate ? gymLocalDateTime(nextDate, "00:00", timeZone) : null;
  return startAt && endAt ? { startAt, endAt } : null;
}

export function gymMinutes(value: Date, timeZone: string) {
  const parts = zonedParts(value, timeZone);
  return parts.hour * 60 + parts.minute;
}
