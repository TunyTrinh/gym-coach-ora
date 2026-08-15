export type BookingFailureTranslationKey =
  | "bookingOverlap"
  | "bookingCapacityFull"
  | "bookingRoomCapacityFull"
  | "bookingDuplicate"
  | "bookingWindowNoLongerFits"
  | "bookingUnavailable";

/** Maps guarded server and preview-mode booking rejections to stable localized UI copy. */
export function bookingFailureTranslationKey(error: string): BookingFailureTranslationKey {
  const normalized = error.trim().toLowerCase();

  if (normalized.includes("overlap")) return "bookingOverlap";
  if (normalized.includes("already") && (normalized.includes("book") || normalized.includes("session"))) return "bookingDuplicate";
  if (normalized.includes("room") && normalized.includes("capacity")) return "bookingRoomCapacityFull";
  if (normalized.includes("maximum client capacity") || normalized.includes("coach") && normalized.includes("capacity")) return "bookingCapacityFull";
  if (normalized.includes("fit") || normalized.includes("window") || normalized.includes("start") && normalized.includes("future")) return "bookingWindowNoLongerFits";

  return "bookingUnavailable";
}
