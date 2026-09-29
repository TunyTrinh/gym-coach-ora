export type RoomEligibility = {
  active: boolean;
  closed: boolean;
};

export function isRoomEligibleForAvailability(room: RoomEligibility) {
  return room.active && !room.closed;
}

export function roomAvailabilityReason(input: { totalRooms: number; activeRooms: number; closedRooms: number }) {
  if (input.totalRooms === 0) return "none" as const;
  if (input.activeRooms === 0) return "inactive" as const;
  if (input.closedRooms >= input.activeRooms) return "closed" as const;
  return "available" as const;
}
