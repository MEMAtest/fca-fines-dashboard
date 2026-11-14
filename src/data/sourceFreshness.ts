/**
 * Stale-source honesty for regulator pages. A regulator page must never look current when its
 * collection has not genuinely succeeded recently. All inputs come from scraper_runs through
 * /api/regulator-source-status (latest genuinely successful run, latest run outcome and a public
 * reason class); nothing here is hand-maintained per regulator except the "no run history" list.
 */
export const SOURCE_STALE_AFTER_DAYS = 30;

/** Live regulators with no scraper_runs history at all: never show them as verified. */
export const NO_RUN_HISTORY: Record<string, string> = {
  AMF: "No collection run has ever been recorded for AMF, so its last verification date is unknown.",
};

export type FailureClass = "blocked" | "maintenance" | "empty" | "unreachable" | "failed";

const REASONS: Record<FailureClass, string> = {
  blocked: "The official source refused our scheduled collection (HTTP 403 or a bot challenge), so new notices are not being collected automatically.",
  maintenance: "The official source is showing a maintenance page, so new notices are not being collected automatically.",
  empty: "The official source returned no usable listing to our scheduled collection, so new notices are not being collected automatically.",
  unreachable: "The official source did not respond to our scheduled collection (timeout), so new notices are not being collected automatically.",
  failed: "The latest scheduled collection failed validation and was held back, so new notices may not be shown.",
};

/** Classify a scraper_runs failure message into a public, non-sensitive reason class. */
export function classifyRunFailure(message: string | null | undefined): FailureClass {
  const m = (message ?? "").toLowerCase();
  if (m.startsWith("[blocked]") || /\b(403|401|forbidden|access denied|just a moment|captcha|akamai|incapsula|cloudflare|status code 530|challenge)\b/.test(m)) return "blocked";
  if (/maintenance|manuten/.test(m)) return "maintenance";
  if (/zero records|no usable|below the configured minimum|returned no/.test(m)) return "empty";
  if (/timeout|timed out|etimedout|econn|enotfound|unreachable/.test(m)) return "unreachable";
  return "failed";
}

export interface RegulatorRunStatus {
  /** ISO time of the latest genuinely successful, non-quarantined run. */
  lastSuccessAt: string | null;
  /** Latest run outcome: "success" or "error" (blocked/failed/quarantined). */
  latestStatus: string | null;
  failureClass: FailureClass | null;
}

export type SourceFreshness =
  | { show: false }
  | { show: true; reason: string; lastVerified: string | null; kind: "failing" | "stale" | "unknown" };

export function evaluateSourceFreshness(
  code: string,
  status: RegulatorRunStatus | null | undefined,
  statusLoaded: boolean,
  now: Date = new Date(),
): SourceFreshness {
  const up = code.toUpperCase();
  if (!statusLoaded) return NO_RUN_HISTORY[up] ? { show: true, kind: "unknown", reason: NO_RUN_HISTORY[up], lastVerified: null } : { show: false };
  if (!status) return NO_RUN_HISTORY[up] ? { show: true, kind: "unknown", reason: NO_RUN_HISTORY[up], lastVerified: null } : { show: false };
  const last = status.lastSuccessAt ? new Date(status.lastSuccessAt) : null;
  const validLast = last && !Number.isNaN(last.getTime()) ? last : null;
  const lastVerified = validLast ? validLast.toISOString().slice(0, 10) : null;
  if (status.latestStatus && status.latestStatus !== "success") {
    return { show: true, kind: "failing", lastVerified, reason: REASONS[status.failureClass ?? "failed"] };
  }
  if (validLast && (now.getTime() - validLast.getTime()) / 86_400_000 > SOURCE_STALE_AFTER_DAYS) {
    return {
      show: true,
      kind: "stale",
      lastVerified,
      reason: `The latest successful collection from the official source was ${Math.floor((now.getTime() - validLast.getTime()) / 86_400_000)} days ago. Newer notices may exist that are not yet shown.`,
    };
  }
  if (!validLast) return { show: true, kind: "unknown", lastVerified: null, reason: "No genuinely successful collection from the official source is recorded." };
  return { show: false };
}
