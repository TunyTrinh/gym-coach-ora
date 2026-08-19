import { describe, expect, it } from "vitest";
import { authEnvironmentErrors } from "../server/_core/env";

describe("authentication environment", () => {
  it("rejects missing application and signing configuration", () => {
    expect(authEnvironmentErrors({ appId: "", cookieSecret: "" })).toEqual([
      "APP_ID (or VITE_APP_ID) is required",
      "JWT_SECRET is required",
    ]);
  });

  it("rejects predictable signing secrets", () => {
    expect(authEnvironmentErrors({ appId: "coachora-test", cookieSecret: "a".repeat(64) }))
      .toContain("JWT_SECRET must be at least 20 characters and contain sufficient randomness");
    expect(authEnvironmentErrors({ appId: "coachora-test", cookieSecret: "8fK!s1vQ#0mZx5jL$2r" }))
      .toContain("JWT_SECRET must be at least 20 characters and contain sufficient randomness");
  });

  it("accepts an established managed secret with sufficient length and character diversity", () => {
    expect(authEnvironmentErrors({
      appId: "coachora-test",
      cookieSecret: "8fK!s1vQ#0mZx5jL$2rP9",
    })).toEqual([]);
  });
});
