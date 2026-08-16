const MANAGED_PREVIEW_API_HOST = /^3000-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.manus\.computer$/i;
const MANAGED_PREVIEW_WEB_HOST = /^8081-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.manus\.computer$/i;

/** True only for an intentional development Preview host, never a public PWA domain. */
export function isPreviewDebugHost(isDevelopment: boolean, hostname: string) {
  return isDevelopment && (MANAGED_PREVIEW_API_HOST.test(hostname) || MANAGED_PREVIEW_WEB_HOST.test(hostname));
}
