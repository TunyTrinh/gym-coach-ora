import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dbSource = readFileSync(resolve(__dirname, "../server/db.ts"), "utf8");
const lifecycleMigration = readFileSync(resolve(__dirname, "../drizzle/0016_room_lifecycle_metadata.sql"), "utf8");

describe("legacy room schema compatibility", () => {
  it("keeps the additive lifecycle migration available without requiring it for current room listing", () => {
    expect(lifecycleMigration).toContain("ADD `deletedAt`");
    expect(dbSource).not.toContain("deletedAt: gymRooms.deletedAt");
  });

  it("uses an explicit legacy-safe room insert and avoids lifecycle columns on updates and soft deletion", () => {
    expect(dbSource).toContain("INSERT INTO \\`gymRooms\\`");
    expect(dbSource).toContain("Explicit legacy-safe columns");
    expect(dbSource).not.toContain("active: false, deletedAt:");
    expect(dbSource).not.toContain("active: input.active, deletedAt:");
  });

  it("keeps closures readable and writable when their later audit columns are absent", () => {
    expect(dbSource).toContain("updatedAt: roomClosures.createdAt");
    expect(dbSource).toContain("INSERT INTO \\`roomClosures\\`");
    expect(dbSource).not.toContain("reason: input.reason?.trim() || null, updatedBy:");
  });
});
