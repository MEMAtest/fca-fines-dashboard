/**
 * Shared "is this enforcement row genuinely new?" rule for every notification
 * path (saved monitors, immediate alerts, watchlist alerts).
 *
 * A row created after the last run is NOT automatically news: scrapers backfill
 * years of history (BCB alone loads ~15,000 rows) and `created_at` is the load
 * time, not the decision time. A row counts as new only when ALL hold:
 *
 *   1. created_at is after the caller's cut-off (last run / last 24 hours);
 *   2. date_issued is within the freshness window of the run (decision date,
 *      so historical rows loaded today are excluded);
 *   3. it was created more than FIRST_LOAD_GRACE_HOURS after the regulator's
 *      first-ever row, so the first load of a regulator never notifies, even
 *      for its few recent decisions.
 *
 * Window choice (30 days): the existing weekly/monthly digests and the persona
 * digest already treat decisions older than 7/30 days as not recent, and
 * regulators publish with a lag of days to a few weeks. 90 days (the old alert
 * window) let late backfills of mid-age history through. Monitors that only run
 * monthly get cadence + 14 days so nothing published between runs is lost.
 *
 * The SQL fragment and the TypeScript predicate below encode the same rule;
 * tests exercise the predicate against a simulated historical load and assert
 * the fragment's shape.
 */
export const FRESH_ROW_WINDOW_DAYS = 30;
export const FIRST_LOAD_GRACE_HOURS = 6;

export function freshWindowDays(cadenceDays = 0): number {
  const days = Math.max(FRESH_ROW_WINDOW_DAYS, Math.ceil(cadenceDays) + 14);
  return Number.isFinite(days) ? Math.trunc(days) : FRESH_ROW_WINDOW_DAYS;
}

export interface FreshRowOptions {
  /** Relation to look up each regulator's first-seen time in. */
  view: string;
  /** Alias of the row being filtered (the outer query must alias its FROM). */
  alias?: string;
  /** SQL expression for the created_at cut-off, e.g. "$3::timestamptz" or "NOW() - INTERVAL '24 hours'". */
  sinceSql: string;
  windowDays?: number;
}

const IDENT = /^[a-z_][a-z0-9_.]*$/i;

/** Boolean SQL condition (no leading WHERE/AND). `view` and `alias` must be plain identifiers. */
export function freshRowCondition(options: FreshRowOptions): string {
  const alias = options.alias ?? "fr";
  if (!IDENT.test(options.view) || !IDENT.test(alias)) {
    throw new Error("freshRowCondition: view and alias must be plain identifiers");
  }
  const windowDays = Math.trunc(options.windowDays ?? FRESH_ROW_WINDOW_DAYS);
  if (!Number.isFinite(windowDays) || windowDays < 1 || windowDays > 400) {
    throw new Error("freshRowCondition: windowDays out of range");
  }
  return `(${alias}.created_at > ${options.sinceSql}
    AND ${alias}.date_issued >= NOW() - INTERVAL '${windowDays} days'
    AND ${alias}.created_at > (
      SELECT MIN(first_seen.created_at) FROM ${options.view} AS first_seen
      WHERE first_seen.regulator = ${alias}.regulator
    ) + INTERVAL '${FIRST_LOAD_GRACE_HOURS} hours')`;
}

export interface FreshRowCandidate {
  regulator: string;
  date_issued: string | Date;
  created_at: string | Date;
}

/** In-memory equivalent of freshRowCondition (used by tests and any non-SQL caller). */
export function isFreshRow(
  row: FreshRowCandidate,
  context: {
    since: Date;
    now: Date;
    /** MIN(created_at) per regulator across the whole table, including `row`. */
    firstSeenByRegulator: Map<string, Date>;
    windowDays?: number;
  },
): boolean {
  const created = new Date(row.created_at).getTime();
  const issued = new Date(row.date_issued).getTime();
  const windowMs = (context.windowDays ?? FRESH_ROW_WINDOW_DAYS) * 86_400_000;
  const firstSeen = context.firstSeenByRegulator.get(row.regulator);
  if (firstSeen === undefined) return false;
  return created > context.since.getTime()
    && issued >= context.now.getTime() - windowMs
    && created > firstSeen.getTime() + FIRST_LOAD_GRACE_HOURS * 3_600_000;
}
