import { describe, expect, it } from "vitest";

import { getInitialNetworkStatus } from "../lib/network-status";
import { getPwaInstallState } from "../lib/pwa-install";

describe("network status defaults", () => {
  it("reports an explicit browser offline state instead of a static offline label", () => {
    expect(getInitialNetworkStatus(true, false)).toBe(false);
    expect(getInitialNetworkStatus(true, true)).toBe(true);
  });

  it("keeps native status online until a native connectivity integration is added", () => {
    expect(getInitialNetworkStatus(false, false)).toBe(true);
  });
});

describe("PWA install availability", () => {
  it("offers the install action only after the browser provides a deferred prompt", () => {
    expect(getPwaInstallState({ isWeb: true, isStandalone: false, hasDeferredPrompt: true })).toBe("ready");
    expect(getPwaInstallState({ isWeb: true, isStandalone: false, hasDeferredPrompt: false })).toBe("manual");
  });

  it("does not offer installation after the app is already installed or on native", () => {
    expect(getPwaInstallState({ isWeb: true, isStandalone: true, hasDeferredPrompt: true })).toBe("installed");
    expect(getPwaInstallState({ isWeb: false, isStandalone: false, hasDeferredPrompt: true })).toBe("unsupported");
  });
});
