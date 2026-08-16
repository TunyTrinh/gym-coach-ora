import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { registerOAuthRoutes } from "../server/_core/oauth";

let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

async function requestLegacyRoute(path: string) {
  const app = express();
  registerOAuthRoutes(app);
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP listening address");
  return fetch(`http://127.0.0.1:${address.port}${path}`);
}

describe("legacy non-Google OAuth routes", () => {
  it("refuses the legacy browser callback instead of creating a Client or Coach session", async () => {
    const response = await requestLegacyRoute("/api/oauth/callback?code=old-code&state=old-state");
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("Google") });
  });

  it("refuses the legacy mobile callback instead of returning an app session token", async () => {
    const response = await requestLegacyRoute("/api/oauth/mobile?code=old-code&state=old-state");
    expect(response.status).toBe(410);
    const body = await response.json() as { app_session_id?: string };
    expect(body.app_session_id).toBeUndefined();
  });
});
