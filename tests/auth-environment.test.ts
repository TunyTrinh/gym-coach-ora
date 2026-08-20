import { describe, expect, it } from "vitest";
import { authEnvironmentErrors, resolveCookieSecret } from "../server/_core/env";

describe("authentication environment", () => {
  it("rejects missing application and signing configuration", () => {
    expect(authEnvironmentErrors({ appId: "", cookieSecret: "" })).toEqual([
      "APP_ID (or VITE_APP_ID) is required",
      "A session signing secret is required",
    ]);
  });

  it("rejects predictable signing secrets", () => {
    expect(authEnvironmentErrors({ appId: "coachora-test", cookieSecret: "a".repeat(64) }))
      .toContain("The session signing secret must be at least 32 characters and contain sufficient randomness");
    expect(authEnvironmentErrors({ appId: "coachora-test", cookieSecret: "8fK!s1vQ#0mZx5jL$2r" }))
      .toContain("The session signing secret must be at least 32 characters and contain sufficient randomness");
  });

  it("accepts a sufficiently long high-diversity signing secret", () => {
    expect(authEnvironmentErrors({
      appId: "coachora-test",
      cookieSecret: "8fK!s1vQ#0mZx5jL$2rP9dN4wC7aH6yT",
    })).toEqual([]);
  });

  it("prefers the project-managed signing secret over an immutable built-in fallback", () => {
    expect(resolveCookieSecret({
      COACHORA_SESSION_SECRET: "8fK!s1vQ#0mZx5jL$2rP9dN4wC7aH6yT",
      JWT_SECRET: "platform-fallback-value",
    })).toBe("8fK!s1vQ#0mZx5jL$2rP9dN4wC7aH6yT");
  });

  it("accepts the managed project signing secret without exposing its value", () => {
    const configuredSecret = resolveCookieSecret();
    expect(configuredSecret.length).toBeGreaterThanOrEqual(32);
    expect(authEnvironmentErrors({ appId: "coachora-test", cookieSecret: configuredSecret })).toEqual([]);
  });
});
