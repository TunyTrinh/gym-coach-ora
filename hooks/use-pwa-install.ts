import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

import { getPwaInstallState, type PwaInstallState } from "@/lib/pwa-install";

type InstallChoice = "accepted" | "dismissed" | "unavailable";

interface DeferredInstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandaloneWebApp(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

export function usePwaInstall(): {
  state: PwaInstallState;
  canInstall: boolean;
  requestInstall: () => Promise<InstallChoice>;
} {
  const isWeb = Platform.OS === "web";
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [isStandalone, setIsStandalone] = useState(() => isWeb && isStandaloneWebApp());

  useEffect(() => {
    if (!isWeb || typeof window === "undefined") return;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredInstallPrompt);
    };
    const onInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [isWeb]);

  const state = useMemo(
    () => getPwaInstallState({ isWeb, isStandalone, hasDeferredPrompt: deferredPrompt !== null }),
    [deferredPrompt, isStandalone, isWeb],
  );

  const requestInstall = useCallback(async (): Promise<InstallChoice> => {
    if (!deferredPrompt) return "unavailable";
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setDeferredPrompt(null);
    return choice.outcome;
  }, [deferredPrompt]);

  return { state, canInstall: state === "ready", requestInstall };
}
