/**
 * Shared "was the source genuinely fetched?" guard for every scraper run.
 *
 * While a loader runs, every fetch() and default-instance axios response is observed. A run is NOT
 * verified when the source refused us (HTTP 401/403, a bot challenge such as Cloudflare/Akamai/
 * Incapsula, or a maintenance page) and no other document fetch succeeded: the runner then records
 * an error whose message starts with "[blocked]" and the reason, instead of a success. A valid
 * listing with zero new records is still verified, because the listing itself was fetched and parsed.
 * Loaders that use no fetch/axios (browser, solver, local files) are not affected.
 */
import axios from "axios";

export class SourceBlockedError extends Error {
  constructor(public readonly reason: string, public readonly host: string) {
    super(`[blocked] ${host}: ${reason}`);
    this.name = "SourceBlockedError";
  }
}

const CHALLENGE_MARKERS = [
  /just a moment/i,
  /_incapsula_resource/i,
  /sec-cpt/i,
  /cf-chl|cf-mitigated|attention required/i,
  /access denied[\s\S]{0,200}reference #/i,
  /the requested url was rejected/i,
  /captcha/i,
  /enable javascript and cookies to continue/i,
];
const MAINTENANCE_MARKERS = [/manuten[cç][aã]o programada/i, /scheduled maintenance/i, /under maintenance/i, /site is down for maintenance/i];
// Challenge and maintenance pages are small shells; a large real page may mention these words.
const MAX_SHELL_BYTES = 30_000;
const FX_HOSTS = /exchangerate|frankfurter|fixer\.io|openexchange|ecb\.europa\.eu\/stats/i;

export function classifyBlocked(status: number, body?: string | null): string | null {
  if (status === 401 || status === 403) return `HTTP ${status} (access refused)`;
  if (status === 429) return "HTTP 429 (rate limited)";
  const text = body ?? "";
  if (text && text.length <= MAX_SHELL_BYTES) {
    if (CHALLENGE_MARKERS.some((re) => re.test(text))) return `HTTP ${status} bot challenge page`;
    if (MAINTENANCE_MARKERS.some((re) => re.test(text))) return `HTTP ${status} maintenance page`;
  }
  if (status === 503 && text.length <= MAX_SHELL_BYTES) return "HTTP 503 (service unavailable)";
  return null;
}

export interface SourceFetchGuard {
  settle(): Promise<void>;
  /** Throws SourceBlockedError when the source refused us and nothing else was fetched. */
  assertVerified(): void;
  blocked(): SourceBlockedError | null;
  restore(): void;
}

export function installSourceFetchGuard(): SourceFetchGuard {
  const successes = new Map<string, number>();
  const blockedHosts = new Map<string, string>();
  const pending: Array<Promise<void>> = [];
  const hostOf = (url: string) => { try { return new URL(url).host; } catch { return "unknown"; } };
  const ok = (url: string) => { const h = hostOf(url); if (!FX_HOSTS.test(url)) successes.set(h, (successes.get(h) ?? 0) + 1); };
  const bad = (url: string, reason: string) => { blockedHosts.set(hostOf(url), reason); };

  const originalFetch = globalThis.fetch;
  const guardedFetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const response = await originalFetch(input as RequestInfo, init);
    const direct = classifyBlocked(response.status);
    if (direct && response.status !== 429) {
      bad(url, direct);
    } else if (response.status >= 300 && response.status < 400) {
      ok(url); // a redirect is an answer from the source, not a refusal
    } else if (response.ok) {
      const type = response.headers.get("content-type") ?? "";
      const length = Number(response.headers.get("content-length") ?? 0);
      if (/html|xml|text/i.test(type) && (!length || length <= MAX_SHELL_BYTES)) {
        pending.push(
          response.clone().text().then((text) => {
            const reason = classifyBlocked(response.status, text);
            if (reason) bad(url, reason); else ok(url);
          }).catch(() => ok(url)),
        );
      } else {
        ok(url);
      }
    }
    return response;
  };
  globalThis.fetch = guardedFetch;

  const okId = axios.interceptors.response.use(
    (response) => {
      const url = String(response.config?.url ?? "");
      const type = String(response.headers?.["content-type"] ?? "");
      const body = typeof response.data === "string" ? response.data : "";
      const reason = /html|xml|text/i.test(type) ? classifyBlocked(response.status, body) : null;
      if (reason) bad(url, reason); else ok(url);
      return response;
    },
    (error) => {
      const status = error?.response?.status as number | undefined;
      const url = String(error?.config?.url ?? "");
      if (status) {
        const body = typeof error.response?.data === "string" ? error.response.data : "";
        const reason = classifyBlocked(status, body);
        if (reason) bad(url, reason);
      }
      return Promise.reject(error);
    },
  );

  const blocked = () => {
    if (blockedHosts.size === 0) return null;
    const anySuccess = [...successes.values()].some((n) => n > 0);
    if (anySuccess) return null;
    const [host, reason] = [...blockedHosts.entries()][0];
    return new SourceBlockedError(reason, host);
  };
  return {
    settle: async () => { await Promise.all(pending); },
    blocked,
    assertVerified() { const e = blocked(); if (e) throw e; },
    restore() { globalThis.fetch = originalFetch; axios.interceptors.response.eject(okId); },
  };
}

/** Run a loader under the guard: a blocked or challenged source throws instead of returning. */
export async function runLoaderWithGuard<T>(loader: () => Promise<T>): Promise<{ result: T; guard: SourceFetchGuard }> {
  const guard = installSourceFetchGuard();
  try {
    let result: T;
    try {
      result = await loader();
    } catch (error) {
      await guard.settle();
      const blocked = guard.blocked();
      if (blocked && !(error instanceof SourceBlockedError)) {
        blocked.message = `${blocked.message} (loader error: ${error instanceof Error ? error.message : String(error)})`;
        throw blocked;
      }
      throw error;
    }
    await guard.settle();
    guard.assertVerified();
    return { result, guard };
  } finally {
    guard.restore();
  }
}
