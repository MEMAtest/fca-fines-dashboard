/**
 * Shared country-page view model — single source of truth for the presentation
 * logic behind BOTH the React page (`CountryHub.tsx`) and the prerendered HTML
 * (`prerender-seo.ts`). Each renders its own markup, but the *data and copy*
 * (status label, detail sentence, risk band, dates, enforcement summary) are
 * computed here once so the crawler-visible page and the user-facing page can't
 * drift apart as later stages add fields.
 */

import { flagEmoji, COUNTRIES, type Country } from "./countries.js";
import {
  getFatfStatus,
  fatfLabel,
  isFatfListed,
  FATF_LAST_PLENARY,
  FATF_NEXT_PLENARY,
  FATF_RECENT_CHANGES,
  type FatfStatus,
  type FatfChange,
} from "./fatfStatus.js";
import {
  getCountryEnforcementSummary,
  hasEnforcementCoverage,
  type CountryEnforcementSummary,
} from "./countryEnforcement.js";
import {
  getSanctions,
  highestSanctionsTier,
  isSanctioned,
  type CountrySanctions,
  type SanctionsTier,
} from "./sanctionsStatus.js";
import { hasGovernanceData, getGovernanceDimensions } from "./governanceData.js";
import {
  computeCountryRiskScore,
  scoreBreakdown,
  globalAverageRiskScore,
  type CountryRiskScore,
  type ScoreBreakdown,
  type RiskBand as ScoreBand,
} from "./countryRiskScore.js";
import { getCpi, type CpiEntry } from "./cpiData.js";
import {
  getFatfNetwork,
  type Fsrb,
} from "./fsrbMembership.js";
import { type CountryRegulator } from "./countryEnforcement.js";
import {
  buildDecision,
  hasComprehensiveSanctions as computeHasComprehensiveSanctions,
  type CountryDecision,
} from "./countryDecision.js";
import SCORE_SNAPSHOTS from "./scoreSnapshots.json" with { type: "json" };
import { getFatfAssessment } from "./fatfAssessmentData.js";

const SNAPSHOTS = SCORE_SNAPSHOTS as { date: string; scores: Record<string, number> }[];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Format an ISO date (YYYY-MM-DD or YYYY-MM) as "19 Jun 2026" / "Oct 2026". */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const monthIdx = m ? Number(m) - 1 : NaN;
  const mon = monthIdx >= 0 && monthIdx < 12 ? MONTHS[monthIdx] : undefined;
  if (d && mon) return `${Number(d)} ${mon} ${y}`;
  if (mon) return `${mon} ${y}`;
  return y;
}

/** Locale-stable thousands formatting (matches the prerendered build output). */
export function formatCount(n: number): string {
  return n.toLocaleString("en-GB");
}

export type RiskBand = "very-high" | "high" | "none";

/**
 * "Regulators & legal framework" module data: FATF-network membership (direct
 * FATF or via an FSRB) plus the national regulators RegActions already tracks.
 */
export interface RegulatoryView {
  /** True if the country is a direct FATF member. */
  fatfMember: boolean;
  /** True if that direct membership is currently suspended (Russia). */
  suspended?: boolean;
  /** FSRB bodies the country belongs to (empty for isolated jurisdictions). */
  fsrbs: Fsrb[];
  /** National regulators with RegActions coverage (empty if none). */
  regulators: CountryRegulator[];
}

export interface CountryView {
  country: Country;
  flag: string;
  fatf?: FatfStatus;
  band: RiskBand;
  /** "Black list" | "Grey list" | "Not currently listed" */
  statusHeading: string;
  /** Full descriptive sentence for the FATF status. */
  statusDetail: string;
  history: FatfChange[];
  enforcement?: CountryEnforcementSummary;
  sanctions?: CountrySanctions;
  /** Highest sanctions tier across imposers, or undefined if none. */
  sanctionsTier?: SanctionsTier;
  /** Risk band for the sanctions card (mirrors the FATF band scale). */
  sanctionsBand: RiskBand;
  /** Composite RegActions Country Risk Score (governance base + escalators). */
  riskScore: CountryRiskScore;
  /** Score derivation for the "how is this scored?" card. */
  breakdown: ScoreBreakdown;
  /** Mean score across profiled countries, for "vs global average". */
  globalAverage: number;
  /** Transparency International CPI (display only), if available. */
  cpi?: CpiEntry;
  /** Same-region peers (highest-risk first), for the regional-context panel. */
  regionalPeers: CountryIndexEntry[];
  /** Templated compliance decision-support (verdict, treatment, drivers, etc.). */
  decision: CountryDecision;
  /** True if RegActions has enforcement coverage (distinguishes "not assessed" from a genuine 0). */
  enforcementAssessed: boolean;
  /** Any comprehensive country-wide sanctions programme. */
  hasComprehensiveSanctions: boolean;
  /** Sanctioned but not comprehensively (targeted/sectoral exposure). */
  hasTargetedSanctions: boolean;
  /** Dated composite-score snapshots (baseline first). A real trend accrues as more are recorded. */
  scoreHistory: { date: string; score: number }[];
  lastPlenary: string;
  nextPlenary: string;
  /** FATF-network membership + tracked national regulators. */
  regulatory: RegulatoryView;
}

/** Sanctions tier → risk band (comprehensive = very-high, sectoral = high, targeted = high). */
function sanctionsToBand(tier: SanctionsTier | undefined): RiskBand {
  if (!tier) return "none";
  return tier === "comprehensive" ? "very-high" : "high";
}

/** FATF listing → risk band (drives the card colour). */
export function fatfBand(fatf: FatfStatus | undefined): RiskBand {
  if (!fatf) return "none";
  return fatf.listing === "call-for-action" ? "very-high" : "high";
}

export function buildCountryView(country: Country): CountryView {
  const fatf = getFatfStatus(country.iso2);
  const history = FATF_RECENT_CHANGES.filter((c) => c.iso2 === country.iso2);
  const enforcement = getCountryEnforcementSummary(country.iso2);
  const sanctions = getSanctions(country.iso2);
  const sanctionsTier = highestSanctionsTier(country.iso2);

  const statusHeading = fatf ? fatfLabel(fatf.listing) : "Not currently listed";
  const statusDetail = fatf
    ? `${
        fatf.listing === "call-for-action"
          ? "High-Risk Jurisdiction Subject to a Call for Action"
          : "Jurisdiction Under Increased Monitoring"
      }.${fatf.since ? ` Listed ${formatDate(fatf.since)}.` : ""}${
        fatf.note ? ` ${fatf.note}` : ""
      } Last reviewed ${formatDate(fatf.lastReviewed)}; next FATF plenary ${formatDate(
        FATF_NEXT_PLENARY,
      )}.`
    : `${country.name} is not on the FATF grey or black list as of the ${formatDate(
        FATF_LAST_PLENARY,
      )} plenary.`;

  const riskScore = computeCountryRiskScore(country.iso2);
  const breakdown = scoreBreakdown(country.iso2);
  const cpi = getCpi(country.iso2);
  const enforcementAssessed = !!enforcement;
  const hasComprehensiveSanctions = computeHasComprehensiveSanctions(sanctions);
  const hasTargetedSanctions = !!sanctionsTier && !hasComprehensiveSanctions;

  const decision = buildDecision({
    name: country.name,
    riskScore,
    breakdown,
    sanctions,
    sanctionsTier,
    enforcementAssessed,
    cpi,
    fatf,
    lastPlenary: FATF_LAST_PLENARY,
  });

  const network = getFatfNetwork(country.iso2);
  const regulatory: RegulatoryView = {
    fatfMember: network.fatfMember,
    suspended: network.suspended,
    fsrbs: network.fsrbs,
    regulators: enforcement?.regulators ?? [],
  };

  return {
    country,
    flag: flagEmoji(country.iso2),
    fatf,
    band: fatfBand(fatf),
    statusHeading,
    statusDetail,
    history,
    enforcement,
    sanctions,
    sanctionsTier,
    sanctionsBand: sanctionsToBand(sanctionsTier),
    riskScore,
    breakdown,
    globalAverage: globalAverageRiskScore(),
    cpi,
    regionalPeers: regionalPeers(country.iso2, country.region),
    decision,
    enforcementAssessed,
    hasComprehensiveSanctions,
    hasTargetedSanctions,
    scoreHistory: SNAPSHOTS.filter((s) => s.scores[country.iso2] != null).map((s) => ({
      date: s.date,
      score: s.scores[country.iso2],
    })),
    lastPlenary: FATF_LAST_PLENARY,
    nextPlenary: FATF_NEXT_PLENARY,
    regulatory,
  };
}

/** Highest-risk same-region peers (excluding the country itself). */
export function regionalPeers(iso2: string, region: string, limit = 6): CountryIndexEntry[] {
  return buildCountryIndex()
    .filter((e) => e.country.region === region && e.country.iso2 !== iso2)
    .slice(0, limit);
}

/** Human phrasing for a FATF change-log entry. */
export function fatfChangeText(change: FatfChange): string {
  const verb = change.change === "added" ? "Added to" : "Removed from";
  return `${verb} the FATF ${fatfLabel(change.listing).toLowerCase()}`;
}

/**
 * Countries that get a page / appear in the global index: any with a risk signal
 * (WGI governance, FATF assessment/listing, sanctions, or enforcement coverage). This is the
 * near-complete world; micro-states with no data at all
 * are excluded rather than shown as an empty 0.
 */
export function pageCountries(): Country[] {
  return COUNTRIES.filter(
    (c) =>
      hasGovernanceData(c.iso2) ||
      Boolean(getFatfAssessment(c.iso2)) ||
      isFatfListed(c.iso2) ||
      isSanctioned(c.iso2) ||
      hasEnforcementCoverage(c.iso2),
  );
}

/**
 * AML/CFT control strength (0–10, higher = stronger) — the mean WGI percentile
 * of the institutional dimensions (Rule of Law, Regulatory Quality, Government
 * Effectiveness) ÷ 10. A derived VIEW metric (not part of the scored composite),
 * used as the x-axis of the risk matrix and in the country detail panel.
 */
export function controlStrength(iso2: string): number | null {
  const d = getGovernanceDimensions(iso2);
  if (!d) return null;
  const vals = [d.rl, d.rq, d.ge].filter((v): v is number => v !== undefined);
  if (!vals.length) return null;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length / 10) * 10) / 10;
}

let _coveredCounts: number[] | undefined;
/** Tracked-action counts for regulator-covered countries only, sorted ascending. */
function coveredCounts(): number[] {
  if (_coveredCounts) return _coveredCounts;
  const arr: number[] = [];
  for (const c of pageCountries()) {
    const n = getCountryEnforcementSummary(c.iso2)?.trackedActions ?? 0;
    if (n > 0) arr.push(n);
  }
  arr.sort((a, b) => a - b);
  _coveredCounts = arr;
  return arr;
}

/**
 * Enforcement exposure (0–10) — the PERCENTILE rank of a country's tracked
 * enforcement actions AMONG the regulator-covered countries (busiest → 10,
 * median-covered → ~5). Countries with no coverage are 0. Percentile (not
 * log-vs-max) gives the covered set a real 0–10 spread so the risk-matrix
 * axis isn't degenerate. Derived VIEW metric, never part of the scored composite.
 */
export function enforcementExposure(iso2: string): number {
  const n = getCountryEnforcementSummary(iso2)?.trackedActions ?? 0;
  if (n <= 0) return 0;
  const arr = coveredCounts();
  if (arr.length === 0) return 0;
  const atOrBelow = arr.filter((v) => v <= n).length;
  return Math.round((atOrBelow / arr.length) * 10 * 10) / 10;
}

export interface CountryIndexEntry {
  country: Country;
  flag: string;
  score: number;
  band: ScoreBand;
  fatf?: FatfStatus;
  sanctionsTier?: SanctionsTier;
  hasEnforcement: boolean;
  /** AML/CFT control strength 0–10 (higher = stronger), or null if no WGI. */
  controlStrength: number | null;
  /** Enforcement exposure 0–10 (log-normalised tracked actions). */
  enforcementExposure: number;
}

let _index: CountryIndexEntry[] | undefined;

/** Every page country with its composite score, sorted highest-risk first. */
export function buildCountryIndex(): CountryIndexEntry[] {
  if (_index) return _index;
  _index = pageCountries()
    .map((country) => {
      const rs = computeCountryRiskScore(country.iso2);
      return {
        country,
        flag: flagEmoji(country.iso2),
        score: rs.score,
        band: rs.band,
        fatf: getFatfStatus(country.iso2),
        sanctionsTier: highestSanctionsTier(country.iso2),
        hasEnforcement: hasEnforcementCoverage(country.iso2),
        controlStrength: controlStrength(country.iso2),
        enforcementExposure: enforcementExposure(country.iso2),
      };
    })
    .sort(
      (a, b) => b.score - a.score || a.country.name.localeCompare(b.country.name),
    );
  return _index;
}

/** Global rank (1 = highest risk) and total, from the sorted index. */
export function globalRank(iso2: string): { rank: number; total: number } {
  const idx = buildCountryIndex();
  const pos = idx.findIndex((e) => e.country.iso2 === iso2);
  return { rank: pos < 0 ? idx.length : pos + 1, total: idx.length };
}

/** Rank within the country's region (1 = highest risk in-region) and region size. */
export function regionRank(
  iso2: string,
  region: string,
): { rank: number; total: number } {
  const inRegion = buildCountryIndex().filter((e) => e.country.region === region);
  const pos = inRegion.findIndex((e) => e.country.iso2 === iso2);
  return { rank: pos < 0 ? inRegion.length : pos + 1, total: inRegion.length };
}

export interface RegionalAverage {
  region: string;
  avg: number;
  count: number;
}

let _regionalAverages: RegionalAverage[] | undefined;

/** Mean composite score per region, highest-risk region first. */
export function regionalAverages(): RegionalAverage[] {
  if (_regionalAverages) return _regionalAverages;
  const groups = new Map<string, number[]>();
  for (const e of buildCountryIndex()) {
    const arr = groups.get(e.country.region) ?? [];
    arr.push(e.score);
    groups.set(e.country.region, arr);
  }
  _regionalAverages = [...groups.entries()]
    .map(([region, scores]) => ({
      region,
      avg: Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 10) / 10,
      count: scores.length,
    }))
    .sort((a, b) => b.avg - a.avg);
  return _regionalAverages;
}

export interface PillarAverages {
  /** Mean governance base (0–10). */
  governance: number;
  /** Mean FATF escalator points added. */
  fatf: number;
  /** Mean sanctions escalator points added. */
  sanctions: number;
}

let _pillarAverages: PillarAverages | undefined;

/**
 * Global mean contribution of each part of the composite across page countries:
 * the governance base and the FATF / sanctions escalator points. Drives the
 * "what drives global risk" donut on the index.
 */
export function pillarAverages(): PillarAverages {
  if (_pillarAverages) return _pillarAverages;
  let base = 0;
  let f = 0;
  let s = 0;
  let n = 0;
  for (const c of pageCountries()) {
    const rs = computeCountryRiskScore(c.iso2);
    base += rs.base;
    f += rs.fatf.points;
    s += rs.sanctions.points;
    n += 1;
  }
  const round = (x: number) => Math.round(x * 10) / 10;
  _pillarAverages = {
    governance: n ? round(base / n) : 0,
    fatf: n ? round(f / n) : 0,
    sanctions: n ? round(s / n) : 0,
  };
  return _pillarAverages;
}
