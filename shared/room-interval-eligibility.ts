import { addCalendarDays, gymDateKey, gymLocalDateTime, gymMinutes } from "./business-time";
import { roomMinutes, type RoomScheduleStatus } from "./room-status";

export type OccupiedInterval = { startAt: Date; endAt: Date };

export type RoomIntervalEligibility = {
  status: RoomScheduleStatus;
  reason: "available" | "inactive" | "temporarily_closed" | "outside_hours" | "full" | "invalid_interval";
  openingHours: { openingTime: string; closingTime: string; timeZone: string };
  closure: { startAt: string; endAt: string; reason: string | null } | null;
  currentOccupancy: number;
  maximumCapacity: number;
  remainingCapacity: number;
  nextAvailableTime: string | null;
};

export function intervalsOverlap(existing: OccupiedInterval, requested: OccupiedInterval) {
  return existing.startAt < requested.endAt && existing.endAt > requested.startAt;
}

export function maximumConcurrentOccupancy(intervals: readonly OccupiedInterval[], requested: OccupiedInterval) {
  const events: { at: number; delta: number }[] = [];
  for (const interval of intervals) {
    if (!intervalsOverlap(interval, requested)) continue;
    events.push({ at: Math.max(interval.startAt.getTime(), requested.startAt.getTime()), delta: 1 });
    events.push({ at: Math.min(interval.endAt.getTime(), requested.endAt.getTime()), delta: -1 });
  }
  events.sort((left, right) => left.at - right.at || left.delta - right.delta);
  let current = 0;
  let maximum = 0;
  for (const event of events) {
    current += event.delta;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

function nextCapacityTime(input: {
  intervals: readonly OccupiedInterval[];
  requested: OccupiedInterval;
  maximumCapacity: number;
  closingAt: Date | null;
}) {
  const duration = input.requested.endAt.getTime() - input.requested.startAt.getTime();
  const candidates = [...new Set(input.intervals
    .filter((interval) => interval.endAt > input.requested.startAt)
    .map((interval) => interval.endAt.getTime()))].sort((a, b) => a - b);
  for (const candidate of candidates) {
    const requested = { startAt: new Date(candidate), endAt: new Date(candidate + duration) };
    if (input.closingAt && requested.endAt > input.closingAt) continue;
    if (maximumConcurrentOccupancy(input.intervals, requested) < input.maximumCapacity) return requested.startAt.toISOString();
  }
  return null;
}

export function evaluateRoomInterval(input: {
  active: boolean;
  openingTime: string;
  closingTime: string;
  maximumCapacity: number;
  timeZone: string;
  startAt: Date;
  endAt: Date;
  closure?: { closureDate: string; reason?: string | null } | null;
  occupiedIntervals: readonly OccupiedInterval[];
}): RoomIntervalEligibility {
  const openingHours = { openingTime: input.openingTime, closingTime: input.closingTime, timeZone: input.timeZone };
  const date = gymDateKey(input.startAt, input.timeZone);
  const endDate = input.endAt > input.startAt ? gymDateKey(new Date(input.endAt.getTime() - 1), input.timeZone) : "";
  const opening = roomMinutes(input.openingTime);
  const closing = roomMinutes(input.closingTime);
  const validInterval = input.endAt > input.startAt && date === endDate && opening !== null && closing !== null;
  const withinHours = validInterval
    && gymMinutes(input.startAt, input.timeZone) >= opening!
    && gymMinutes(input.endAt, input.timeZone) <= closing!;
  const closureDate = input.closure?.closureDate;
  const nextDate = closureDate ? addCalendarDays(closureDate, 1) : null;
  const closureStart = closureDate ? gymLocalDateTime(closureDate, "00:00", input.timeZone) : null;
  const closureEnd = nextDate ? gymLocalDateTime(nextDate, "00:00", input.timeZone) : null;
  const closure = closureStart && closureEnd ? {
    startAt: closureStart.toISOString(),
    endAt: closureEnd.toISOString(),
    reason: input.closure?.reason ?? null,
  } : null;
  const currentOccupancy = validInterval ? maximumConcurrentOccupancy(input.occupiedIntervals, { startAt: input.startAt, endAt: input.endAt }) : 0;
  const remainingCapacity = Math.max(0, input.maximumCapacity - currentOccupancy);
  const closingAt = gymLocalDateTime(date, input.closingTime, input.timeZone);
  const base = { openingHours, closure, currentOccupancy, maximumCapacity: input.maximumCapacity, remainingCapacity, nextAvailableTime: null };
  if (!validInterval) return { ...base, status: "outside_hours", reason: "invalid_interval" };
  if (!input.active) return { ...base, status: "inactive", reason: "inactive" };
  if (!withinHours) return { ...base, status: "outside_hours", reason: "outside_hours" };
  if (closure && intervalsOverlap({ startAt: new Date(closure.startAt), endAt: new Date(closure.endAt) }, { startAt: input.startAt, endAt: input.endAt })) {
    return { ...base, status: "temporarily_closed", reason: "temporarily_closed" };
  }
  if (currentOccupancy >= input.maximumCapacity) {
    return {
      ...base,
      status: "full",
      reason: "full",
      nextAvailableTime: nextCapacityTime({ intervals: input.occupiedIntervals, requested: { startAt: input.startAt, endAt: input.endAt }, maximumCapacity: input.maximumCapacity, closingAt }),
    };
  }
  return { ...base, status: "available", reason: "available" };
}
