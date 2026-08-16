import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { registerOAuthRoutes } from "../server/_core/oauth";

describe("Google OAuth configuration", () => {
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeServer?.();
    closeServer = undefined;
  });

  it("starts the Google authorization flow when the configured credentials are available", async () => {
    const app = express();
    registerOAuthRoutes(app);
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    closeServer = () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });

    const response = await fetch(`http://127.0.0.1:${port}/api/auth/google`, {
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    const authorizationUrl = new URL(response.headers.get("location") ?? "");
    expect(authorizationUrl.origin).toBe("https://accounts.google.com");
    expect(authorizationUrl.pathname).toBe("/o/oauth2/v2/auth");
    expect(authorizationUrl.searchParams.get("client_id")).toBeTruthy();
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "https://gymflowpwa-hvqfc4hd.manus.space/api/auth/google/callback",
    );
  });
});
