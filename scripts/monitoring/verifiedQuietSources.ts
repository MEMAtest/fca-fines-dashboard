import type { LiveRegulatorHealthResult } from "../scraper/lib/liveRegulatorHealth.js";
import type { RecentScraperRun } from "./scraperAssuranceAgent.js";

const QUIET_RUN_MAX_AGE_MS = 72 * 60 * 60 * 1000;

/**
 * A source whose newest record is older than its freshness window is a data
 * problem unless the scraper has demonstrably read the official listing since:
 * its latest run succeeded within 72h and parsed records (a zero-record run is
 * never evidence). Such a source is downgraded from action_required to watch and
 * labelled, never reported as healthy: the staleness stays visible in the
 * report. A failed, quarantined, empty or missing run keeps action_required.
 */
export function applyVerifiedQuietSources(
  health: LiveRegulatorHealthResult[],
  runs: RecentScraperRun[],
  now = new Date(),
): LiveRegulatorHealthResult[] {
  const latestByRegulator = new Map<string, RecentScraperRun>();
  for (const run of runs) {
    const key = run.regulator.toUpperCase();
    const current = latestByRegulator.get(key);
    if (!current || new Date(run.startedAt) > new Date(current.startedAt)) {
      latestByRegulator.set(key, run);
    }
  }

  return health.map((result) => {
    if (result.status !== "stale" || result.severity !== "action_required") return result;
    const latest = latestByRegulator.get(result.regulator.toUpperCase());
    if (
      !latest ||
      latest.status !== "success" ||
      (latest.recordsPrepared ?? 0) <= 0 ||
      now.getTime() - new Date(latest.startedAt).getTime() > QUIET_RUN_MAX_AGE_MS
    ) {
      return result;
    }
    return {
      ...result,
      severity: "watch",
      message: `${result.message} The latest scraper run succeeded (${latest.recordsPrepared} records parsed from the official source) and found nothing newer, so this is a verified-quiet source; staleness stays on watch.`,
    };
  });
}
