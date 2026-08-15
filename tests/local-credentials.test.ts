import { describe, expect, it } from "vitest";
import { hashLocalPassword, isValidLocalPassword, isValidLocalUsername, normalizeLocalUsername, verifyLocalPassword } from "../server/local-credentials";

describe("local credentials", () => {
  it("normalizes and validates safe local usernames", () => {
    expect(normalizeLocalUsername("  Coach.Ana_01 ")).toBe("coach.ana_01");
    expect(isValidLocalUsername("coach.ana_01")).toBe(true);
    expect(isValidLocalUsername("ab")).toBe(false);
    expect(isValidLocalUsername("coach ana")).toBe(false);
  });

  it("requires passwords in the supported length range", () => {
    expect(isValidLocalPassword("shortpass")).toBe(false);
    expect(isValidLocalPassword("secure-pass-123")).toBe(true);
    expect(isValidLocalPassword("a".repeat(129))).toBe(false);
  });

  it("stores passwords as a salted hash and verifies only the matching credential", async () => {
    const password = "secure-pass-123";
    const hash = await hashLocalPassword(password);
    expect(hash).not.toContain(password);
    await expect(verifyLocalPassword(password, hash)).resolves.toBe(true);
    await expect(verifyLocalPassword("not-the-password", hash)).resolves.toBe(false);
    await expect(verifyLocalPassword(password, "not-a-valid-hash")).resolves.toBe(false);
  });
});
