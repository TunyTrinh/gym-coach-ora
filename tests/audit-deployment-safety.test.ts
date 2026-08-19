import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const trpcSource = readFileSync(resolve(__dirname, "../server/_core/trpc.ts"), "utf8");
const adminSource = readFileSync(resolve(__dirname, "../app/(tabs)/admin.tsx"), "utf8");
const accountMenuSource = readFileSync(resolve(__dirname, "../components/admin-account-menu.tsx"), "utf8");

describe("audit deployment safety fixes", () => {
  it("replaces internal server errors with a correlation-safe message rather than database details", () => {
    expect(trpcSource).toContain("errorFormatter");
    expect(trpcSource).toContain("requestId");
    expect(trpcSource).toContain("Reference: ${reference}");
    expect(trpcSource).not.toContain("message: error.message");
  });

  it("keeps long Coach identity text shrinkable, bounded, and separate from wrapping actions", () => {
    expect(adminSource).toContain("coachIdentity");
    expect(adminSource).toContain("minWidth: 0");
    expect(adminSource).toContain("flexShrink: 1");
    expect(adminSource).toContain("numberOfLines={2}");
    expect(adminSource).toContain("flexWrap: \"wrap\"");
    expect(adminSource).not.toContain("coachRow: { flexDirection: \"row\"");
  });

  it("provides a non-tab Admin account menu with persisted language selection and private-cache-clearing logout", () => {
    expect(adminSource).toContain("<AdminAccountMenu />");
    expect(accountMenuSource).toContain("setLanguage(option)");
    expect(accountMenuSource).toContain("queryClient.clear()");
    expect(accountMenuSource).toContain("router.dismissAll()");
    expect(accountMenuSource).toContain('router.replace("/")');
    expect(accountMenuSource).toContain('t("signOut")');
  });
});
