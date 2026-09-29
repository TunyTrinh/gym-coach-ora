export type AvailabilityRoomChoice = {
  id: string | number;
  defaultGym?: boolean;
  eligible?: boolean;
};

/**
 * Retains an explicit room selection; otherwise prefers an active room in the
 * Coach's assigned gym and falls back to the first active room.
 */
export function defaultAvailabilityRoomId(
  rooms: AvailabilityRoomChoice[],
  selectedRoomId: string | number | null,
) {
  const eligibleRooms = rooms.filter((room) => room.eligible !== false);
  if (selectedRoomId !== null && eligibleRooms.some((room) => String(room.id) === String(selectedRoomId))) {
    return selectedRoomId;
  }
  return eligibleRooms.find((room) => room.defaultGym)?.id ?? eligibleRooms[0]?.id ?? null;
}
