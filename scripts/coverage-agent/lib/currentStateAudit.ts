import {
  PUBLIC_REGULATOR_NAV_ITEMS,
  type RegulatorCoverage,
} from "../../../src/data/regulatorCoverage.js";
import type {
  CurrentStateSnapshot,
  CurrentStateUrl,
  RegulatorHubState,
} from "../../../src/types/coverageAgent.js";

export const CORE_PLATFORM_ROUTES = [
  "/regulators",
  "/fines",
  "/blog",
  "/topics/aml",
  "/topics/market-abuse",
  "/methodology/enforcement",
  "/developers",
] as const;

export const LEGACY_DOMAIN_URL = "https://fcafines.memaconsultants.com/";

export interface CurrentStateAuditOptions {
  baseUrl?: string;
  legacyUrl?: string;
  regulators?: Pick<RegulatorCoverage, "code" | "overviewPath" | "years">[];
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

function routeUrl(baseUrl: string, route: string) {
  return new URL(route, `${baseUrl.replace(/\/$/, "")}/`).toString();
}

function coverageEnd(value: string) {
  const years = [...value.matchAll(/\b(19|20)\d{2}\b/g)].map((match) => Number(match[0]));
  return years.length ? String(Math.max(...years)) : null;
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function extractCanonical(html: string) {
  const match = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  return match?.[1] ?? null;
}

async function inspectUrl(url: string, kind: CurrentStateUrl["kind"], fetchImpl: typeof fetch): Promise<CurrentStateUrl> {
  try {
    const response = await fetchImpl(url, { redirect: "follow", headers: { Accept: "text/html,application/xhtml+xml" } });
    const html = await response.text();
    const finalUrl = response.url || url;
    return {
      url,
      kind,
      status: response.status,
      title: extractTitle(html),
      canonicalUrl: extractCanonical(html),
      finalUrl,
      redirectUrl: finalUrl !== url ? finalUrl : null,
      errorMessage: null,
    };
  } catch (error) {
    return {
      url, kind, status: null, title: null, canonicalUrl: null, finalUrl: null, redirectUrl: null,
      errorMessage: `Fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function latestHubRecord(
  baseUrl: string,
  regulator: Pick<RegulatorCoverage, "code" | "years">,
  fetchImpl: typeof fetch,
): Promise<{ state: RegulatorHubState; failure: string | null }> {
  const endpoint = new URL("/api/unified/search", `${baseUrl.replace(/\/$/, "")}/`);
  endpoint.searchParams.set("regulator", regulator.code);
  endpoint.searchParams.set("limit", "1");
  endpoint.searchParams.set("sortBy", "date_issued");
  endpoint.searchParams.set("order", "desc");
  try {
    const response = await fetchImpl(endpoint, { headers: { Accept: "application/json" } });
    if (!response.ok) return { state: { regulator: regulator.code, coverageEnd: coverageEnd(regulator.years), latestRecordDate: null }, failure: `${regulator.code} unified-search check returned HTTP ${response.status}` };
    const payload = await response.json() as { results?: Array<{ date_issued?: string | null }> };
    return {
      state: { regulator: regulator.code, coverageEnd: coverageEnd(regulator.years), latestRecordDate: payload.results?.[0]?.date_issued ?? null },
      failure: null,
    };
  } catch (error) {
    return { state: { regulator: regulator.code, coverageEnd: coverageEnd(regulator.years), latestRecordDate: null }, failure: `${regulator.code} unified-search check failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Read-only current-state audit. Every page/API failure is captured in the
 * snapshot instead of throwing, allowing downstream QA artifacts to be
 * produced. Callers can fail their job afterwards using fetchFailures.
 */
export async function collectCurrentStateSnapshot(options: CurrentStateAuditOptions = {}): Promise<CurrentStateSnapshot> {
  const baseUrl = options.baseUrl ?? "https://regactions.com";
  const legacyUrl = options.legacyUrl ?? LEGACY_DOMAIN_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const regulators = options.regulators ?? PUBLIC_REGULATOR_NAV_ITEMS;
  const core = await Promise.all(CORE_PLATFORM_ROUTES.map((route) => inspectUrl(routeUrl(baseUrl, route), route === "/blog" ? "blog" : route === "/methodology/enforcement" ? "methodology" : "other", fetchImpl)));
  const hubs = await Promise.all(regulators.map(async (regulator) => ({
    page: await inspectUrl(routeUrl(baseUrl, regulator.overviewPath), "hub", fetchImpl),
    latest: await latestHubRecord(baseUrl, regulator, fetchImpl),
  })));
  const legacy = await inspectUrl(legacyUrl, "legacy", fetchImpl);
  const urls = [...core, ...hubs.map((entry) => entry.page), legacy];
  const fetchFailures = [
    ...urls.filter((entry) => entry.errorMessage).map((entry) => `${entry.url}: ${entry.errorMessage}`),
    ...hubs.map((entry) => entry.latest.failure).filter((value): value is string => Boolean(value)),
  ];
  return {
    capturedAt: (options.now ?? (() => new Date()))().toISOString(),
    baseUrl,
    fetchFailures,
    urls,
    regulatorHubs: hubs.map((entry) => entry.latest.state),
    notes: ["Read-only current-state audit; no platform record or article was modified."],
  };
}
