import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("PWA release path", () => {
  it("uses one build-versioned service-worker cache source", () => {
    const source = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
    expect(source.match(/^const CACHE_NAME/gm)).toHaveLength(1);
    expect(source).toContain('const CACHE_NAME = "coachora-shell-__BUILD_ID__";');
  });

  it("uses cache-busting substitution when exporting web assets", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["build:web"]).toContain("scripts/stamp-pwa-release.mjs web");
  });

  it("generates a release manifest through the same export path", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/stamp-pwa-release.mjs"), "utf8");
    const releaseTemplate = readFileSync(resolve(process.cwd(), "public/release.json"), "utf8");
    expect(script).toContain("release.json");
    expect(script).toContain("sourceRevision");
    expect(script).toContain("artifact:${artifactFingerprint}");
    expect(script).toContain('git", ["status", "--porcelain"]');
    expect(script).not.toContain('process.env.SOURCE_REVISION ?? "local"');
    expect(releaseTemplate).toContain("__BUILD_ID__");
  });
});
