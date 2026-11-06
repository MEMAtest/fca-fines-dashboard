/**
 * Score movers: biggest composite-score rises/falls between the latest
 * snapshot and an earlier one, strictly from recorded snapshots of the CURRENT
 * methodology. Nothing is back-filled; if the history does not span the window
 * the result says so rather than guessing.
 */
import scoreSnapshotsRaw from "./scoreSnapshots.json" with { type: "json" };
import { CURRENT_COUNTRY_RISK_METHODOLOGY_VERSION } from "./countryRiskMethodology.js";
import { getCountryByIso2 } from "./countries.js";
import { buildCountryChanges, type ChangeEvent } from "./countryChanges.js";

export interface MoverSnapshot {
  date: string;
  scores: Record<string, number>;
  methodologyVersion?: string;
}

export interface Mover {
  iso2: string;
  name: string;
  before: number;
  after: number;
  delta: number;
  /** Dated, cited events for this country inside the comparison window. */
  reasons: ChangeEvent[];
}

export type MoversWindow =
  | {
      status: "ready";
      weeks: number;
      fromDate: string;
      toDate: string;
      /** Actual calendar span in days (may differ from weeks*7 when snapshots were missed). */
      spanDays: number;
      risers: Mover[];
      fallers: Mover[];
      unchangedCount: number;
    }
  | { status: "insufficient"; weeks: number; toDate: string | null; availableFrom: string | null };

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);

/** Same-methodology snapshots, oldest first. */
export function comparableSnapshots(
  snapshots: MoverSnapshot[] = scoreSnapshotsRaw as unknown as MoverSnapshot[],
  methodologyVersion: string = CURRENT_COUNTRY_RISK_METHODOLOGY_VERSION,
): MoverSnapshot[] {
  return snapshots
    .filter((s) => s.methodologyVersion === methodologyVersion)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Compare the latest snapshot with the most recent snapshot at least
 * `weeks` weeks (minus a 3-day tolerance for weekday drift) earlier.
 */
export function computeMovers(
  weeks: number,
  snapshots: MoverSnapshot[] = scoreSnapshotsRaw as unknown as MoverSnapshot[],
  events: ChangeEvent[] = buildCountryChanges(),
  limit = 10,
  methodologyVersion: string = CURRENT_COUNTRY_RISK_METHODOLOGY_VERSION,
): MoversWindow {
  const snaps = comparableSnapshots(snapshots, methodologyVersion);
  const latest = snaps[snaps.length - 1];
  if (!latest) return { status: "insufficient", weeks, toDate: null, availableFrom: null };
  const cutoff = addDays(latest.date, -(weeks * 7 - 3));
  const base = [...snaps].reverse().find((s) => s.date <= cutoff);
  if (!base) {
    return {
      status: "insufficient",
      weeks,
      toDate: latest.date,
      availableFrom: addDays(snaps[0].date, weeks * 7 - 3),
    };
  }
  const reasonEvents = events.filter(
    (e) => e.scope === "country" && e.kind !== "score" && e.date > base.date && e.date <= latest.date,
  );
  const all: Mover[] = [];
  let unchanged = 0;
  for (const [iso2, after] of Object.entries(latest.scores)) {
    const before = base.scores[iso2];
    if (before === undefined) continue;
    const delta = Math.round((after - before) * 10) / 10;
    if (delta === 0) {
      unchanged++;
      continue;
    }
    const country = getCountryByIso2(iso2);
    if (!country) continue;
    all.push({
      iso2,
      name: country.name,
      before,
      after,
      delta,
      reasons: reasonEvents.filter((e) => e.iso2 === iso2),
    });
  }
  const byAbs = (a: Mover, b: Mover) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name);
  return {
    status: "ready",
    weeks,
    fromDate: base.date,
    toDate: latest.date,
    spanDays: days(base.date, latest.date),
    risers: all.filter((m) => m.delta > 0).sort(byAbs).slice(0, limit),
    fallers: all.filter((m) => m.delta < 0).sort(byAbs).slice(0, limit),
    unchangedCount: unchanged,
  };
}

/** Recent dated per-country listing changes (FATF, sanctions, EU tax) — usable even with no score history. */
export function recentListingChanges(
  sinceDays: number,
  asOf: string,
  events: ChangeEvent[] = buildCountryChanges(),
): ChangeEvent[] {
  const since = addDays(asOf, -sinceDays);
  return events.filter((e) => e.scope === "country" && e.kind !== "score" && e.date >= since && e.date <= asOf);
}

/** Current-methodology score series for one country, for the country-page trend panel. */
export function snapshotSeries(
  iso2: string,
  snapshots: MoverSnapshot[] = scoreSnapshotsRaw as unknown as MoverSnapshot[],
): { date: string; score: number }[] {
  return comparableSnapshots(snapshots)
    .filter((s) => s.scores[iso2] !== undefined)
    .map((s) => ({ date: s.date, score: s.scores[iso2] }));
}

/** Largest gap in days between consecutive points; >10 means a scheduled snapshot was missed. */
export function largestGapDays(points: { date: string }[]): number {
  let max = 0;
  for (let i = 1; i < points.length; i++) max = Math.max(max, days(points[i - 1].date, points[i].date));
  return max;
}

export const lastSnapshotDate = (): string | null => {
  const s = comparableSnapshots();
  return s.length ? s[s.length - 1].date : null;
};

/**
 * The comparison the Movers tab headline describes, taken from the data: the
 * latest comparable snapshot and the one before it. Snapshot dates are not on a
 * fixed cadence (the weekly schedule only starts now), so the label must name
 * the real dates rather than claim "weekly".
 */
export function snapshotComparison(
  snapshots: MoverSnapshot[] = scoreSnapshotsRaw as unknown as MoverSnapshot[],
  methodologyVersion: string = CURRENT_COUNTRY_RISK_METHODOLOGY_VERSION,
): { latest: string; previous: string | null; spanDays: number | null; count: number } | null {
  const snaps = comparableSnapshots(snapshots, methodologyVersion);
  const latest = snaps[snaps.length - 1];
  if (!latest) return null;
  const prev = snaps.length > 1 ? snaps[snaps.length - 2] : null;
  return {
    latest: latest.date,
    previous: prev ? prev.date : null,
    spanDays: prev ? days(prev.date, latest.date) : null,
    count: snaps.length,
  };
}
