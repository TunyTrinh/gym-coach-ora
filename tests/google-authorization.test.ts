import { describe, expect, it } from "vitest";

import { hasVerifiedGoogleIdentity, isAdminLocalAccount, isValidGoogleEmail, normalizeGoogleEmail } from "../server/google-authorization";

describe("verified Google Coach authorization", () => {
  it("normalizes case and surrounding whitespace before comparing authorized emails", () => {
    expect(normalizeGoogleEmail("  Coach.Name@Example.COM ")).toBe("coach.name@example.com");
    expect(isValidGoogleEmail("  Coach.Name@Example.COM ")).toBe(true);
  });

  it("requires a Google subject, a valid email, and the explicit verified claim", () => {
    expect(hasVerifiedGoogleIdentity({ sub: "google-subject", email: "coach@example.com", email_verified: true })).toBe(true);
    expect(hasVerifiedGoogleIdentity({ sub: "google-subject", email: "coach@example.com", email_verified: false })).toBe(false);
    expect(hasVerifiedGoogleIdentity({ sub: "google-subject", email: "not-an-email", email_verified: true })).toBe(false);
    expect(hasVerifiedGoogleIdentity({ email: "coach@example.com", email_verified: true })).toBe(false);
  });

  it("allows local credentials exclusively for an Admin local account", () => {
    expect(isAdminLocalAccount({ loginMethod: "local", role: "admin" })).toBe(true);
    expect(isAdminLocalAccount({ loginMethod: "local", role: "coach" })).toBe(false);
    expect(isAdminLocalAccount({ loginMethod: "google", role: "admin" })).toBe(false);
  });
});
