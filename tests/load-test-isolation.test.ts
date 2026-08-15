import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("load-test isolation", () => {
  it("excludes load tests from the Docker build context", async () => {
    const dockerIgnore = await readFile(resolve(root, ".dockerignore"), "utf8");
    expect(dockerIgnore).toMatch(/^\/load-tests$/m);
  });

  it("keeps the staging guard and production rejection controls", async () => {
    const guard = await readFile(resolve(root, "load-tests/lib/guard.mjs"), "utf8");
    expect(guard).toContain("I_CONFIRM_STAGING_ONLY");
    expect(guard).toContain("Refusing a URL that appears to be production");
    expect(guard).toContain("Refusing a database URL equal to DATABASE_URL");
    expect(guard).toContain("COACHORA_LOCAL_SMOKE_DATABASE_URL must use localhost");
  });

  it("keeps localhost cleanup confirmation-gated and scoped to one generated run", async () => {
    const cleanup = await readFile(resolve(root, "load-tests/local/cleanup-local.mjs"), "utf8");
    expect(cleanup).toContain('assertLocalSmokeTarget()');
    expect(cleanup).toContain('COACHORA_LOCAL_SMOKE_CLEANUP_CONFIRMATION');
    expect(cleanup).toContain('DELETE_ONLY_THIS_LOCAL_RUN');
    expect(cleanup).toContain('local-load:${runId}:%');
    expect(cleanup).toContain('LOAD_TEST:${runId}');
  });
});
