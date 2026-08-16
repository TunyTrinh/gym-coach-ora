export function getInitialNetworkStatus(isWeb: boolean, navigatorOnline?: boolean): boolean {
  return !isWeb || navigatorOnline !== false;
}
