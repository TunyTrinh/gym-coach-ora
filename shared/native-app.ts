export const NATIVE_APP_SCHEME = "manusgymcoachbookingpwa";
export const NATIVE_OAUTH_CALLBACK_PATH = "/oauth/callback";

export function isAllowedNativeCallback(value: string) {
  try {
    const callback = new URL(value);
    if (callback.protocol !== `${NATIVE_APP_SCHEME}:`) return false;
    const route = `/${callback.host}${callback.pathname}`.replace(/\/+/g, "/");
    return route === NATIVE_OAUTH_CALLBACK_PATH;
  } catch {
    return false;
  }
}
