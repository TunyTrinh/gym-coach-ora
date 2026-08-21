import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../components/admin-account-menu.tsx", import.meta.url).pathname, "utf8");

describe("Admin account menu dismissal", () => {
  it("provides a visible accessible × control that closes the menu without signing out", () => {
    expect(source).toContain('accessibilityLabel={t("close")}');
    expect(source).toContain(">×</Text>");
    expect(source).toContain('onPress={() => setOpen(false)}');
    expect(source).toContain("closeButton: { width: 40, height: 40");
    expect(source).toContain("<PrimaryButton title={isSigningOut ? t(\"loading\") : t(\"signOut\")} onPress={signOut}");
  });
});
