import { Platform } from "react-native";

/** Keeps the seeded Coachora experience on an actual local development host only. */
export function isLocalTestMode() {
  if (typeof __DEV__ === "undefined" || !__DEV__ || Platform.OS !== "web" || typeof window === "undefined") {
    return false;
  }

  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}
