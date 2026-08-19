import { SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

const appId = "coachora-session-test";
const secret = "8fK!s1vQ#0mZx5jL$2rP9cW@7nT4yH6b";
const secretKey = new TextEncoder().encode(secret);
let sdk: typeof import("../server/_core/sdk")["sdk"];

beforeAll(async () => {
  process.env.APP_ID = appId;
  process.env.JWT_SECRET = secret;
  process.env.OAUTH_SERVER_URL = "https://identity.invalid";
  vi.resetModules();
  sdk = (await import("../server/_core/sdk")).sdk;
});

async function tokenWith(overrides: { audience?: string; appId?: string; issuer?: string; expiration?: number }) {
  return new SignJWT({
    openId: "google:test-user",
    appId: overrides.appId ?? appId,
    name: "Test User",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setIssuer(overrides.issuer ?? `coachora:${appId}`)
    .setAudience(overrides.audience ?? appId)
    .setExpirationTime(overrides.expiration ?? Math.floor(Date.now() / 1000) + 60)
    .sign(secretKey);
}

describe("session JWT contract", () => {
  it("accepts a correctly bound, unexpired session", async () => {
    const token = await sdk.createSessionToken("google:test-user", { name: "Test User" });
    await expect(sdk.verifySession(token)).resolves.toEqual({
      openId: "google:test-user",
      appId,
      name: "Test User",
    });
  });

  it("rejects the wrong audience, issuer, application claim, and expiry", async () => {
    await expect(sdk.verifySession(await tokenWith({ audience: "other-app" }))).resolves.toBeNull();
    await expect(sdk.verifySession(await tokenWith({ issuer: "other-issuer" }))).resolves.toBeNull();
    await expect(sdk.verifySession(await tokenWith({ appId: "other-app" }))).resolves.toBeNull();
    await expect(sdk.verifySession(await tokenWith({ expiration: Math.floor(Date.now() / 1000) - 1 }))).resolves.toBeNull();
  });
});
