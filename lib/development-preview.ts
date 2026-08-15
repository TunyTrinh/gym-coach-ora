/**
 * Identifies the managed web preview host used by the development server.
 * This intentionally excludes the public Coachora domain and all localhost
 * variants so it can only be used with a development bundle.
 */
export function isManagedPreviewHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return normalized.startsWith("8081-") && normalized.endsWith(".manus.computer");
}
