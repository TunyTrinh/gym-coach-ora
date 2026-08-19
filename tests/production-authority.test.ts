import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translations } from "../lib/i18n";

const root = new URL("..", import.meta.url).pathname;
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(?:ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("production authority boundary", () => {
  it("contains no production seeded-store or legacy gym procedure path", () => {
    const production = [...sourceFiles(join(root, "app")), ...sourceFiles(join(root, "components")), ...sourceFiles(join(root, "lib")), ...sourceFiles(join(root, "server"))]
      .map((path) => readFileSync(path, "utf8")).join("\n");
    expect(production).not.toContain("GymProvider");
    expect(production).not.toContain("useGym(");
    expect(production).not.toContain("seedGymData");
    expect(production).not.toContain("trpc.gym.");
    expect(production).not.toContain("isLocalTestMode");
  });

  it("keeps authenticated API data private and outside the service-worker cache", () => {
    const server = readFileSync(join(root, "server/_core/index.ts"), "utf8");
    const worker = readFileSync(join(root, "public/sw.js"), "utf8");
    expect(server).toContain('"Cache-Control", "private, no-store, max-age=0"');
    expect(worker).toContain('requestUrl.pathname.startsWith("/api/")');
  });

  it("provides English and Vietnamese authority/error messages", () => {
    expect(translations.en.scheduleUnavailable).toBe("Schedule unavailable");
    expect(translations.vi.scheduleUnavailable).toBe("Không thể tải lịch");
    expect(translations.en.affectedBookingsPreserved).toContain("{count}");
    expect(translations.vi.affectedBookingsPreserved).toContain("{count}");
  });
});
