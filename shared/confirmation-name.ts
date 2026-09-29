/** Normalizes display names for deliberate typed-confirmation gates. */
export function normalizeConfirmationName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function matchesConfirmationName(value: string, expectedName: string) {
  return normalizeConfirmationName(value) === normalizeConfirmationName(expectedName);
}
