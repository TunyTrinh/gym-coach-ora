export type RoomScheduleStatus = "available" | "full" | "temporarily_closed" | "inactive" | "outside_hours";

export function roomMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60
    ? hours * 60 + minutes
    : null;
}

export function isWithinRoomHours(input: { openingTime: string; closingTime: string; startAt: Date; endAt: Date }) {
  if (input.startAt.toDateString() !== new Date(input.endAt.getTime() - 1).toDateString()) return false;
  const opening = roomMinutes(input.openingTime);
  const closing = roomMinutes(input.closingTime);
  if (opening === null || closing === null) return false;
  const start = input.startAt.getHours() * 60 + input.startAt.getMinutes();
  const end = input.endAt.getHours() * 60 + input.endAt.getMinutes();
  return start >= opening && end <= closing;
}

export function roomScheduleStatus(input: {
  active: boolean;
  closed: boolean;
  withinHours?: boolean;
  occupancy: number;
  maximumCapacity: number;
}): RoomScheduleStatus {
  if (!input.active) return "inactive";
  if (input.closed) return "temporarily_closed";
  if (input.withinHours === false) return "outside_hours";
  if (input.occupancy >= input.maximumCapacity) return "full";
  return "available";
}
