import { describe, expect, it } from "vitest";

import { isManagedPreviewHostname } from "../lib/development-preview";

describe("demo preview gate", () => {
  it("does not treat a public PWA domain as a Preview fixture host", () => {
    expect(isManagedPreviewHostname("coachora-pwa-382sq9pq.manus.space")).toBe(false);
  });

  it("recognizes the managed Metro hostname used only when a developer enables fixtures", () => {
    expect(isManagedPreviewHostname("8081-i9bvzw2a73pppbejaofz4-1217bc80.sg1.manus.computer")).toBe(true);
  });
});
