/**
 * fetch() for the website's own data routes (/api/site/*). Those routes need a
 * short-lived signed cookie from GET /api/site/token. If a call is refused with
 * 401 site_token_required, fetch a token once (shared across concurrent calls)
 * and retry.
 */
let tokenInflight: Promise<void> | null = null;
let tokenFetchedAt = 0;
// The cookie lasts 20 minutes; refresh a little early so the first call is not a 401.
const TOKEN_REFRESH_MS = 15 * 60 * 1000;

function ensureToken(base: string): Promise<void> {
  tokenInflight ??= fetch(`${base}/api/site/token`, { credentials: "same-origin", cache: "no-store" })
    .then(() => { tokenFetchedAt = Date.now(); })
    .catch(() => undefined)
    .finally(() => { tokenInflight = null; });
  return tokenInflight;
}

export async function siteFetch(base: string, path: string, init: RequestInit = {}): Promise<Response> {
  const options: RequestInit = { ...init, credentials: "same-origin" };
  if (Date.now() - tokenFetchedAt > TOKEN_REFRESH_MS) await ensureToken(base);
  const first = await fetch(`${base}${path}`, options);
  if (first.status !== 401) return first;
  await ensureToken(base);
  return fetch(`${base}${path}`, options);
}
