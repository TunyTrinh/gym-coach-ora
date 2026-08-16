export type AvailabilityRoomChoice = {
  id: string | number;
  defaultGym?: boolean;
};

/**
 * Retains an explicit room selection; otherwise prefers an active room in the
 * Coach's assigned gym and falls back to the first active room.
 */
export function defaultAvailabilityRoomId(
  rooms: AvailabilityRoomChoice[],
  selectedRoomId: string | number | null,
) {
  if (selectedRoomId !== null && rooms.some((room) => String(room.id) === String(selectedRoomId))) {
    return selectedRoomId;
  }
  return rooms.find((room) => room.defaultGym)?.id ?? rooms[0]?.id ?? null;
}
