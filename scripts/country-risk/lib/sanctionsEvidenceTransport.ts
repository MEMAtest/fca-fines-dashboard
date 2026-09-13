/** The UN endpoint may acknowledge a request with 202 and no body (or block
 * direct clients with 403/429). Such responses are not empty evidence; use
 * the browser-rendered official page before failing the candidate closed. */
export function shouldUseBrowserFallback(imposer: string, status: number, byteLength: number) {
  return imposer === "UN" && (status === 403 || status === 429 || status === 202 || byteLength < 2_000);
}
