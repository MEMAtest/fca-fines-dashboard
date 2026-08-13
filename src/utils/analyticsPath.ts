const BOARD_PACK_SHARE_PATH = /^\/board-pack\/shared\/[^/]+\/?$/i;

export const REDACTED_BOARD_PACK_SHARE_PATH = "/board-pack/shared/:token";

export function isSensitiveAnalyticsPath(path: string): boolean {
  return BOARD_PACK_SHARE_PATH.test(path.split("?")[0]?.split("#")[0] ?? path);
}

export function canonicalizeAnalyticsPath(path: string): string {
  const pathname = path.split("?")[0]?.split("#")[0] ?? "/";
  return isSensitiveAnalyticsPath(pathname)
    ? REDACTED_BOARD_PACK_SHARE_PATH
    : pathname || "/";
}
