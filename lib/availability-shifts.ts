import type { AvailabilityCreateInput, AvailabilityShift, AvailabilityShiftStatus } from "../shared/gym";

export type GeneratedShiftInterval = { start: string; end: string };

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

export function generateAvailabilityIntervals(input: AvailabilityCreateInput): GeneratedShiftInterval[] {
  const firstDay = localDateTime(input.startDate, "00:00");
  const lastDay = localDateTime(input.endDate ?? input.startDate, "00:00");
  const startAt = localDateTime(input.startDate, input.startTime);
  const endAt = localDateTime(input.startDate, input.endTime);
  if (!firstDay || !lastDay || !startAt || !endAt || endAt <= startAt || lastDay < firstDay) return [];

  const selectedWeekdays = input.weekdays?.length ? new Set(input.weekdays) : undefined;
  const breakMinutes = Math.max(0, input.breakMinutes ?? 0);
  const intervals: GeneratedShiftInterval[] = [];
  const cursor = new Date(firstDay);
  while (cursor <= lastDay) {
    if (!selectedWeekdays || selectedWeekdays.has(cursor.getDay())) {
      const start = localDateTime(localDateKey(cursor), input.startTime)!;
      const limit = localDateTime(localDateKey(cursor), input.endTime)!;
      while (start.getTime() + input.durationMinutes * 60_000 <= limit.getTime()) {
        const end = new Date(start.getTime() + input.durationMinutes * 60_000);
        intervals.push({ start: start.toISOString(), end: end.toISOString() });
        start.setMinutes(start.getMinutes() + input.durationMinutes + breakMinutes);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return intervals;
}

export function intervalsOverlap(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string) {
  return new Date(leftStart).getTime() < new Date(rightEnd).getTime() && new Date(leftEnd).getTime() > new Date(rightStart).getTime();
}

export function shiftDisplayStatus(shift: AvailabilityShift, now = new Date()): AvailabilityShiftStatus {
  if (shift.status === "Available" && new Date(shift.end).getTime() <= now.getTime()) return "Expired";
  return shift.status;
}

export function canEditAvailabilityShift(shift: AvailabilityShift, now = new Date()) {
  const status = shiftDisplayStatus(shift, now);
  return new Date(shift.start).getTime() > now.getTime() && (status === "Available" || status === "Blocked" || status === "Cancelled");
}
