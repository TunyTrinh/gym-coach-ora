import { describe, expect, it } from "vitest";
import { isManagedPreviewHostname } from "../lib/development-preview";

describe("managed development preview hostname", () => {
  it("accepts the managed Metro preview hostname", () => {
    expect(isManagedPreviewHostname("8081-ix9npz5ufstx82um4gzw9-7ddd2839.sg1.manus.computer")).toBe(true);
  });

  it("rejects production, API, localhost, and arbitrary hosts", () => {
    expect(isManagedPreviewHostname("gymflowpwa-hvqfc4hd.manus.space")).toBe(false);
    expect(isManagedPreviewHostname("3000-ix9npz5ufstx82um4gzw9-7ddd2839.sg1.manus.computer")).toBe(false);
    expect(isManagedPreviewHostname("localhost")).toBe(false);
    expect(isManagedPreviewHostname("preview.example.com")).toBe(false);
  });
});
