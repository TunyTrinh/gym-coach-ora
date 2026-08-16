export type PwaInstallState = "installed" | "ready" | "manual" | "unsupported";

export function getPwaInstallState({
  isWeb,
  isStandalone,
  hasDeferredPrompt,
}: {
  isWeb: boolean;
  isStandalone: boolean;
  hasDeferredPrompt: boolean;
}): PwaInstallState {
  if (!isWeb) return "unsupported";
  if (isStandalone) return "installed";
  return hasDeferredPrompt ? "ready" : "manual";
}
