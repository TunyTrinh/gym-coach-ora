import { isRoomEligibleForAvailability } from "./room-eligibility";

export type AvailabilityRoomSource = {
  id: number;
  gymId: number;
  active: boolean;
};

export type AvailabilityRoomChoice<T extends AvailabilityRoomSource> = T & {
  defaultGym: boolean;
  eligible: boolean;
  statusReason: "available" | "temporarily_closed" | "inactive";
};

/**
 * Preserves every room in the authoritative collection. Eligibility controls
 * selection only; it never removes inactive or temporarily closed rooms from
 * the Coach picker, so their reason remains visible and actionable.
 */
export function buildAvailabilityRoomChoices<T extends AvailabilityRoomSource>(
  rooms: readonly T[],
  closedRoomIds: ReadonlySet<number>,
  defaultGymId: number | null,
): AvailabilityRoomChoice<T>[] {
  return rooms.map((room) => {
    const closed = closedRoomIds.has(room.id);
    const eligible = isRoomEligibleForAvailability({ active: room.active, closed });
    return {
      ...room,
      defaultGym: defaultGymId !== null && room.gymId === defaultGymId,
      eligible,
      statusReason: !room.active ? "inactive" : closed ? "temporarily_closed" : "available",
    };
  });
}
