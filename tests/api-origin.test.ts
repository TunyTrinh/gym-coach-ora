import { describe, expect, it } from "vitest";

import { isManagedPreviewHostname } from "../lib/development-preview";
import { resolveWebApiBaseUrl, resolveWebOAuthCallbackOrigin } from "../lib/api-origin";

describe("Preview and public PWA API boundaries", () => {
  it("recognizes only managed Metro preview hosts as Preview origins", () => {
    expect(isManagedPreviewHostname("8081-demo.sg1.manus.computer")).toBe(true);
    expect(isManagedPreviewHostname("coachora-pwa-382sq9pq.manus.space")).toBe(false);
    expect(isManagedPreviewHostname("localhost")).toBe(false);
  });

  it("uses the Preview API only on the managed Preview host", () => {
    const previewApi = "https://3000-preview.sg1.manus.computer";
    expect(resolveWebApiBaseUrl({ protocol: "https:", hostname: "8081-preview.sg1.manus.computer", previewApiBaseUrl: previewApi })).toBe(previewApi);
    expect(resolveWebApiBaseUrl({ protocol: "https:", hostname: "coachora-pwa-382sq9pq.manus.space", previewApiBaseUrl: previewApi })).toBe("");
  });

  it("uses the public web origin for OAuth callbacks when the API is same-origin", () => {
    expect(resolveWebOAuthCallbackOrigin("", "https://coachora-pwa-382sq9pq.manus.space")).toBe("https://coachora-pwa-382sq9pq.manus.space");
  });
});
