import { describe, expect, it } from "vitest";

import { normalizeRoomName } from "../server/db";

describe("room management rules", () => {
  it("normalizes room names so Admins cannot create case-only or spacing duplicates", () => {
    expect(normalizeRoomName("  Studio   A ")).toBe("studio a");
    expect(normalizeRoomName("STUDIO A")).toBe("studio a");
  });

  it("rejects an empty room name after normalization", () => {
    expect(normalizeRoomName("   ")).toBe("");
  });
});
