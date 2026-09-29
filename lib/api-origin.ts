import { isManagedPreviewHostname } from "./development-preview";

export function resolveWebApiBaseUrl({
  protocol,
  hostname,
  previewApiBaseUrl,
}: {
  protocol: string;
  hostname: string;
  previewApiBaseUrl?: string;
}) {
  if (!isManagedPreviewHostname(hostname)) return "";
  return previewApiBaseUrl?.replace(/\/$/, "") || `${protocol}//${hostname.replace(/^8081-/, "3000-")}`;
}

export function resolveWebOAuthCallbackOrigin(apiBaseUrl: string, publicOrigin: string) {
  return apiBaseUrl || publicOrigin;
}
