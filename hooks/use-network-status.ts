import { useEffect, useState } from "react";
import { Platform } from "react-native";

import { getInitialNetworkStatus } from "@/lib/network-status";

export { getInitialNetworkStatus } from "@/lib/network-status";

export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() =>
    getInitialNetworkStatus(Platform.OS === "web", typeof navigator === "undefined" ? undefined : navigator.onLine),
  );

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const updateStatus = () => setIsOnline(navigator.onLine);
    updateStatus();
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  return isOnline;
}
