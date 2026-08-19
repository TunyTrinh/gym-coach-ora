import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isAllowedNativeCallback } from "../shared/native-app";

describe("native OAuth callback allowlist", () => {
  it("accepts both Expo forms of the compiled callback", () => {
    expect(isAllowedNativeCallback("manusgymcoachbookingpwa:///oauth/callback")).toBe(true);
    expect(isAllowedNativeCallback("manusgymcoachbookingpwa://oauth/callback")).toBe(true);
  });

  it("keeps the Expo scheme aligned with the server allowlist", () => {
    const expoConfig = readFileSync(resolve(__dirname, "../app.config.ts"), "utf8");
    expect(expoConfig).toContain('scheme: "manusgymcoachbookingpwa"');
  });

  it("rejects web origins, other schemes, and other routes", () => {
    expect(isAllowedNativeCallback("https://attacker.example/oauth/callback")).toBe(false);
    expect(isAllowedNativeCallback("otherapp:///oauth/callback")).toBe(false);
    expect(isAllowedNativeCallback("manusgymcoachbookingpwa:///profile")).toBe(false);
  });
});
