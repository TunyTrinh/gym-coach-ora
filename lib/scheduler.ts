export function startOfLocalDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function addLocalDays(value: Date, days: number) {
  const date = startOfLocalDay(value);
  date.setDate(date.getDate() + days);
  return date;
}

export function createLocalDateRail(now = new Date(), length = 7) {
  return Array.from({ length }, (_, index) => addLocalDays(now, index));
}

export function isSameLocalDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

export function isUpcomingAtLocalTime(isoDate: string, now = new Date()) {
  return new Date(isoDate).getTime() > now.getTime();
}

export function formatLocalClock(now = new Date()) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(now);
}
