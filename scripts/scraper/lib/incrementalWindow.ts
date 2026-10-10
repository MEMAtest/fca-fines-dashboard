/**
 * Shared helpers for incremental scraper runs.
 *
 * Slow archive scrapers (SEC, AMF, ...) default to a rolling recent window so
 * the daily job finishes and promotes; `--backfill` (or <PREFIX>_BACKFILL=1)
 * restores the full-archive behaviour.
 */

export function hasCliFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export function isBackfillRun(envPrefix: string): boolean {
  return hasCliFlag("backfill") || process.env[`${envPrefix}_BACKFILL`] === "1";
}

/** ISO date (YYYY-MM-DD) `days` days before `now` (UTC). */
export function isoDateDaysAgo(days: number, now: Date = new Date()): string {
  const d = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
