import { Platform } from "react-native";
import { isManagedPreviewHostname } from "@/lib/development-preview";

/**
 * Keeps seeded Coachora demo data available only in development web sessions.
 * Public deployments and native Expo Go builds always remain authenticated.
 */
export function isLocalTestMode() {
  if (typeof __DEV__ === "undefined" || !__DEV__ || Platform.OS !== "web" || typeof window === "undefined") {
    return false;
  }

  // Preview and public PWA share the authoritative API by default. Seeded
  // fixtures are available only when a developer deliberately opts in.
  if (process.env.EXPO_PUBLIC_ENABLE_DEMO_PREVIEW !== "true") return false;

  const hostname = window.location.hostname;
  return ["localhost", "127.0.0.1", "::1"].includes(hostname) || isManagedPreviewHostname(hostname);
}
