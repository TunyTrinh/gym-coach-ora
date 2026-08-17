import { describe, expect, it } from "vitest";

import { isPreviewDebugHost } from "../lib/preview-debug";

describe("Preview debug release boundary", () => {
  it("permits only managed development Preview hosts", () => {
    expect(isPreviewDebugHost(true, "8081-i9bvzw2a73pppbejaofz4-1217bc80.sg1.manus.computer")).toBe(true);
    expect(isPreviewDebugHost(true, "3000-i9bvzw2a73pppbejaofz4-1217bc80.sg1.manus.computer")).toBe(true);
  });

  it("excludes public PWA domains and every production runtime", () => {
    expect(isPreviewDebugHost(true, "coachora-pwa-382sq9pq.manus.space")).toBe(false);
    expect(isPreviewDebugHost(false, "3000-i9bvzw2a73pppbejaofz4-1217bc80.sg1.manus.computer")).toBe(false);
  });
});
