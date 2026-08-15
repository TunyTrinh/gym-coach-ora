import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("PWA release path", () => {
  it("uses one build-versioned service-worker cache source", () => {
    const source = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
    expect(source.match(/^const CACHE_NAME/gm)).toHaveLength(1);
    expect(source).toContain('const CACHE_NAME = "gymflow-shell-__BUILD_ID__";');
  });

  it("uses cache-busting substitution when exporting web assets", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["build:web"]).toContain("s/__BUILD_ID__/${BUILD_ID}/g");
  });
});
