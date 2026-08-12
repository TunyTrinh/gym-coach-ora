import type { AvailabilityCreateInput, AvailabilityShift, AvailabilityShiftStatus } from "../shared/gym";

export type AvailabilityWindowInterval = { start: string; end: string };

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

function localDateTime(date: string, time: string) {
  if (!timePattern.test(time)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const value = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(value.getTime()) ? null : value;
}

function localDateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

/** Creates one publishable continuous availability window; it deliberately does not divide it into sessions. */
export function createAvailabilityWindow(input: AvailabilityCreateInput): AvailabilityWindowInterval | null {
  const startAt = localDateTime(input.startDate, input.startTime);
  const endAt = localDateTime(input.startDate, input.endTime);
  if (!startAt || !endAt || endAt <= startAt) return null;
  return { start: startAt.toISOString(), end: endAt.toISOString() };
}

export function intervalsOverlap(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string) {
  return new Date(leftStart).getTime() < new Date(rightEnd).getTime() && new Date(leftEnd).getTime() > new Date(rightStart).getTime();
}

/** A session may touch an availability boundary, but may never start before or end after it. */
export function intervalFitsAvailability(sessionStart: string, sessionEnd: string, availableStart: string, availableEnd: string) {
  return new Date(sessionStart).getTime() >= new Date(availableStart).getTime()
    && new Date(sessionEnd).getTime() <= new Date(availableEnd).getTime();
}

export function shiftDisplayStatus(shift: AvailabilityShift, now = new Date()): AvailabilityShiftStatus {
  if (shift.status === "Available" && new Date(shift.end).getTime() <= now.getTime()) return "Expired";
  return shift.status;
}

export function canEditAvailabilityShift(shift: AvailabilityShift, now = new Date()) {
  const status = shiftDisplayStatus(shift, now);
  return new Date(shift.start).getTime() > now.getTime() && (status === "Available" || status === "Blocked" || status === "Cancelled");
}
