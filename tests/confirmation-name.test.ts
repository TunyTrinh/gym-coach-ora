import { describe, expect, it } from "vitest";

import { matchesConfirmationName, normalizeConfirmationName } from "../shared/confirmation-name";

describe("typed deletion confirmation", () => {
  it("accepts the same room name regardless of capitalization or repeated spaces", () => {
    expect(matchesConfirmationName("  STRENGTH   STUDIO ", "Strength Studio")).toBe(true);
  });

  it("rejects a different room name", () => {
    expect(matchesConfirmationName("Cardio Studio", "Strength Studio")).toBe(false);
  });

  it("returns a stable normalized confirmation name", () => {
    expect(normalizeConfirmationName("  Coachora   Gym ")).toBe("coachora gym");
  });
});
