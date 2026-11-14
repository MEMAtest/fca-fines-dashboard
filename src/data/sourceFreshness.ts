/**
 * Stale-source honesty for regulator pages. A regulator page must never look current when its
 * collection has not succeeded recently or its official source cannot be reached by our scheduled
 * collection. Dates come from scraper_runs (latest successful, non-quarantined run) via
 * /api/regulator-source-status; the notes below are the known blocked sources.
 */
export const SOURCE_STALE_AFTER_DAYS = 30;

/** Regulators whose official source is currently blocked or unreachable from scheduled collection. */
export const BLOCKED_SOURCE_NOTES: Record<string, string> = {
  DNB: "DNB's official source returns an Akamai 403 to automated collection, so stored records are shown but new notices are not being collected automatically.",
  BAFIN: "BaFin's official source is blocked to our scheduled collection (scraper assurance report), so new notices are not being collected automatically.",
  ACPR: "ACPR's official source is blocked to our scheduled collection (scraper assurance report), so new notices are not being collected automatically.",
  AMF: "AMF's official source is blocked to our scheduled collection (scraper assurance report), so new notices are not being collected automatically.",
  CMVM: "CMVM's official search is unreachable from our CI runners (watch: source unreachable from CI), so new notices are not being collected automatically.",
};

export type SourceFreshness =
  | { show: false }
  | { show: true; reason: string; lastVerified: string | null; kind: "blocked" | "stale" | "unknown" };

/**
 * @param lastSuccessAt ISO timestamp of the latest successful scrape, or null/undefined when none is recorded
 * @param statusLoaded  false while the status feed is loading or failed: nothing is claimed either way,
 *                      except that a known-blocked source still shows its note with no date.
 */
export function evaluateSourceFreshness(
  code: string,
  lastSuccessAt: string | null | undefined,
  statusLoaded: boolean,
  now: Date = new Date(),
): SourceFreshness {
  const blocked = BLOCKED_SOURCE_NOTES[code.toUpperCase()];
  const last = lastSuccessAt ? new Date(lastSuccessAt) : null;
  const validLast = last && !Number.isNaN(last.getTime()) ? last : null;
  const lastVerified = validLast ? validLast.toISOString().slice(0, 10) : null;
  if (blocked) return { show: true, kind: "blocked", reason: blocked, lastVerified };
  if (!statusLoaded) return { show: false };
  if (!validLast) return { show: false }; // no scrape history for this regulator (curated or pipeline): nothing to age
  const ageDays = (now.getTime() - validLast.getTime()) / 86_400_000;
  if (ageDays > SOURCE_STALE_AFTER_DAYS) {
    return {
      show: true,
      kind: "stale",
      lastVerified,
      reason: `The latest successful collection from the official source was ${Math.floor(ageDays)} days ago. Newer notices may exist that are not yet shown.`,
    };
  }
  return { show: false };
}
