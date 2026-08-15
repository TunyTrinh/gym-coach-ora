import { describe, expect, it } from "vitest";

const baseUrl = process.env.LOCAL_AUTH_TEST_BASE_URL;
const bootstrapUsername = process.env.BOOTSTRAP_ADMIN_USERNAME;
const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const runIntegration = Boolean(baseUrl && bootstrapUsername && bootstrapPassword);

describe("bootstrap local Admin credentials", () => {
  const testEndpoint = runIntegration ? it : it.skip;

  testEndpoint("signs in through the local login endpoint with the configured bootstrap credentials", async () => {
    const response = await fetch(`${baseUrl}/api/auth/local/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: bootstrapUsername, password: bootstrapPassword }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { app_session_id?: string; user?: { role?: string; openId?: string } };
    expect(body.app_session_id).toBeTruthy();
    expect(body.user).toMatchObject({ role: "admin", openId: `local:${bootstrapUsername}` });
  });
});
