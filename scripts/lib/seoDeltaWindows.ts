/**
 * Before/after measurement windows for an SEO change.
 *
 * A change ships on a date; the question is whether the pages it touched got
 * better. Naive "last 28 days vs previous 28 days" is wrong for this, because
 * the days either side of the ship date are contaminated:
 *
 *  - Google does not recrawl instantly. Days immediately after the ship date
 *    still reflect the OLD title/description, so they are excluded as burn-in.
 *  - Search Console data is incomplete for roughly the last 2 days, so the
 *    trailing edge is excluded too.
 *  - The 2 days before shipping often contain the deploy itself, so the before
 *    window stops short of the ship date.
 *
 * Everything here is pure so the arithmetic can be tested without a network.
 */

export interface DeltaWindows {
  before: { startDate: string; endDate: string };
  after: { startDate: string; endDate: string };
  /** Days of measurable "after" data available so far. */
  afterDays: number;
  /** False while the after window is too short or still inside burn-in. */
  ready: boolean;
}

export const BURN_IN_DAYS = 10;
export const WINDOW_DAYS = 28;
export const DATA_LAG_DAYS = 2;
export const PRE_SHIP_GAP_DAYS = 2;
/** Below this, treat any movement as noise rather than a result. */
export const MIN_AFTER_DAYS = 14;

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const ms =
    new Date(`${to}T00:00:00Z`).getTime() -
    new Date(`${from}T00:00:00Z`).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

export function buildDeltaWindows(
  actionedAt: string,
  today: string,
): DeltaWindows {
  const beforeEnd = addDays(actionedAt, -PRE_SHIP_GAP_DAYS);
  const beforeStart = addDays(beforeEnd, -(WINDOW_DAYS - 1));

  const afterStart = addDays(actionedAt, BURN_IN_DAYS);
  const afterEnd = addDays(today, -DATA_LAG_DAYS);

  const afterDays = Math.max(0, daysBetween(afterStart, afterEnd));

  return {
    before: { startDate: beforeStart, endDate: beforeEnd },
    after: { startDate: afterStart, endDate: afterEnd },
    afterDays,
    ready: afterDays >= MIN_AFTER_DAYS,
  };
}

export interface PageMetrics {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface PageDelta {
  page: string;
  before: PageMetrics;
  after: PageMetrics;
  /** Clicks per 1,000 impressions — comparable across windows of unequal traffic. */
  beforeClicksPerMille: number;
  afterClicksPerMille: number;
  positionChange: number;
  /**
   * True when position held within +/-1. A CTR change is only attributable to
   * the title/description when the page did not simply move up or down the
   * results page.
   */
  positionStable: boolean;
  verdict: "improved" | "declined" | "flat" | "insufficient-data";
}

/** Below this the CTR estimate is too noisy to call. */
export const MIN_IMPRESSIONS_FOR_VERDICT = 300;

export function comparePage(
  page: string,
  before: PageMetrics,
  after: PageMetrics,
): PageDelta {
  const perMille = (m: PageMetrics) =>
    m.impressions === 0 ? 0 : (m.clicks / m.impressions) * 1000;

  const beforeClicksPerMille = perMille(before);
  const afterClicksPerMille = perMille(after);
  const positionChange = after.position - before.position;
  const positionStable = Math.abs(positionChange) <= 1;

  let verdict: PageDelta["verdict"];
  if (
    before.impressions < MIN_IMPRESSIONS_FOR_VERDICT ||
    after.impressions < MIN_IMPRESSIONS_FOR_VERDICT
  ) {
    verdict = "insufficient-data";
  } else {
    const change = afterClicksPerMille - beforeClicksPerMille;
    // 10% relative movement, so a page at 1 click/1k is not called "improved"
    // off a rounding artefact.
    const threshold = Math.max(0.5, beforeClicksPerMille * 0.1);
    if (change > threshold) verdict = "improved";
    else if (change < -threshold) verdict = "declined";
    else verdict = "flat";
  }

  return {
    page,
    before,
    after,
    beforeClicksPerMille,
    afterClicksPerMille,
    positionChange,
    positionStable,
    verdict,
  };
}
