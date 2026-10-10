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
 * Window choice (90 days, the long-standing alert window): regulators can
 * publish a decision weeks after it is taken, and a tighter window would drop
 * those genuine late publications. Backfills are stopped by the first-load
 * grace period and by `created_at`, not by a tight date window. Monitors that
 * only run monthly get cadence + 14 days at minimum.
 *
 * The SQL fragment and the TypeScript predicate below encode the same rule;
 * tests exercise the predicate against a simulated historical load and assert
 * the fragment's shape.
 */
export const FRESH_ROW_WINDOW_DAYS = 90;
export const FIRST_LOAD_GRACE_HOURS = 6;

export function freshWindowDays(cadenceDays = 0): number {
  const days = Math.max(FRESH_ROW_WINDOW_DAYS, Math.ceil(cadenceDays) + 14);
  return Number.isFinite(days) ? Math.trunc(days) : FRESH_ROW_WINDOW_DAYS;
}

export interface FreshRowOptions {
  /** Alias of the row being filtered (the outer query must alias its FROM). */
  alias?: string;
  /** SQL expression for the created_at cut-off, e.g. "$3::timestamptz" or "NOW() - INTERVAL '24 hours'". */
  sinceSql: string;
  windowDays?: number;
}

/**
 * Each regulator's first-row time, computed once per statement from the
 * materialised view (indexed on regulator, created_at) rather than once per
 * candidate row on the wrapper view. Prepend to the query with `WITH`.
 */
export const FIRST_SEEN_CTE_DEFINITION = `first_seen_by_regulator AS (
  SELECT regulator, MIN(created_at) AS first_created_at
  FROM public.all_regulatory_fines_canonical
  GROUP BY regulator
)`;
const FIRST_SEEN_CTE = "first_seen_by_regulator";

const IDENT = /^[a-z_][a-z0-9_.]*$/i;

/** Boolean SQL condition (no leading WHERE/AND). The query must start with `WITH ${FIRST_SEEN_CTE_DEFINITION}`; `alias` must be a plain identifier. */
export function freshRowCondition(options: FreshRowOptions): string {
  const alias = options.alias ?? "fr";
  if (!IDENT.test(alias)) {
    throw new Error("freshRowCondition: alias must be a plain identifier");
  }
  const windowDays = Math.trunc(options.windowDays ?? FRESH_ROW_WINDOW_DAYS);
  if (!Number.isFinite(windowDays) || windowDays < 1 || windowDays > 400) {
    throw new Error("freshRowCondition: windowDays out of range");
  }
  return `(${alias}.created_at > ${options.sinceSql}
    AND ${alias}.date_issued >= NOW() - INTERVAL '${windowDays} days'
    AND ${alias}.created_at > (
      SELECT first_seen.first_created_at FROM ${FIRST_SEEN_CTE} AS first_seen
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
