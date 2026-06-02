/**
 * FlareSolverr client — clears Cloudflare "Just a moment" managed JS challenges.
 *
 * Some regulator sites (notably fca.org.uk) serve Cloudflare's interstitial
 * challenge to datacenter egress IPs (GitHub Actions, Hetzner) while serving the
 * real page to residential IPs. A plain HTTP fetch from those IPs gets a 403
 * with a "Just a moment" body. FlareSolverr runs a real (undetected) browser
 * that executes the challenge JS, obtains the cf_clearance cookie, and returns
 * the solved HTML — so a scraper running on a datacenter IP can proceed.
 *
 * This is only useful against JS *challenges* (solvable by a browser), not hard
 * IP bans. fca.org.uk serves a solvable challenge to Hetzner, which is why this
 * path works there.
 *
 * Deployment: a FlareSolverr container runs on the host (e.g. Hetzner,
 * 127.0.0.1:8191). The scraper opts in by setting FLARESOLVERR_URL; when unset,
 * callers fall back to a direct fetch (which works from residential IPs / local).
 */

import axios from "axios";

const DEFAULT_MAX_TIMEOUT_MS = 60_000;

interface FlareSolverrResponse {
  status: string;
  message?: string;
  session?: string;
  solution?: {
    url: string;
    status: number;
    response: string;
    userAgent?: string;
  };
}

export interface FlareSolverrClient {
  /** Fetch a URL through the solver, returning the solved HTML. */
  get(url: string): Promise<string>;
  /** Tear down the underlying browser session (best-effort). */
  destroy(): Promise<void>;
}

/** True when a FlareSolverr endpoint is configured via FLARESOLVERR_URL. */
export function flareSolverrEnabled(): boolean {
  return Boolean(process.env.FLARESOLVERR_URL?.trim());
}

/**
 * Create a FlareSolverr-backed fetch client with a persistent browser session,
 * so the cf_clearance cookie is reused across many page fetches (one challenge
 * solve instead of one per request). Always call destroy() when finished.
 */
export async function createFlareSolverrClient(opts?: {
  endpoint?: string;
  maxTimeoutMs?: number;
}): Promise<FlareSolverrClient> {
  const endpoint = (opts?.endpoint ?? process.env.FLARESOLVERR_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (!endpoint) {
    throw new Error("FLARESOLVERR_URL is not set");
  }
  const maxTimeout =
    opts?.maxTimeoutMs ??
    (Number(process.env.FLARESOLVERR_MAX_TIMEOUT_MS) || DEFAULT_MAX_TIMEOUT_MS);

  const post = async (payload: Record<string, unknown>): Promise<FlareSolverrResponse> => {
    const response = await axios.post(`${endpoint}/v1`, payload, {
      timeout: maxTimeout + 20_000,
      headers: { "Content-Type": "application/json" },
    });
    return response.data as FlareSolverrResponse;
  };

  const created = await post({ cmd: "sessions.create" });
  if (created.status !== "ok" || !created.session) {
    throw new Error(
      `FlareSolverr sessions.create failed: ${created.message || created.status}`,
    );
  }
  const session = created.session;

  return {
    async get(url: string): Promise<string> {
      const data = await post({ cmd: "request.get", url, session, maxTimeout });
      if (data.status !== "ok" || !data.solution) {
        throw new Error(
          `FlareSolverr request.get failed for ${url}: ${data.message || data.status}`,
        );
      }
      if (data.solution.status >= 400) {
        throw new Error(`FlareSolverr returned HTTP ${data.solution.status} for ${url}`);
      }
      return data.solution.response;
    },
    async destroy(): Promise<void> {
      try {
        await post({ cmd: "sessions.destroy", session });
      } catch {
        // best-effort teardown; the session also expires on its own
      }
    },
  };
}
