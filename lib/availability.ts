import { seedGymData, type GymSnapshot } from "../shared/gym";

/**
 * A persisted demo snapshot can outlive its seven-day availability window.
 * Preserve its member data and historical bookings, while appending a fresh,
 * locally timed week only when no upcoming open session remains.
 */
export function restoreUpcomingAvailability(snapshot: GymSnapshot, now = new Date()): GymSnapshot {
  const hasUpcomingOpenSlot = snapshot.slots.some((slot) => slot.status === "Open" && new Date(slot.start).getTime() > now.getTime());
  if (hasUpcomingOpenSlot) return snapshot;

  const existingSlotIds = new Set(snapshot.slots.map((slot) => slot.id));
  const freshSlots = seedGymData(now).slots
    .filter((slot) => slot.status === "Open" && new Date(slot.start).getTime() > now.getTime())
    .map((slot) => ({ ...slot, id: `availability-${now.getTime()}-${slot.id}` }));

  if (!freshSlots.length) return snapshot;
  return {
    ...snapshot,
    slots: [...snapshot.slots, ...freshSlots.filter((slot) => !existingSlotIds.has(slot.id))],
  };
}
