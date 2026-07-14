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
import { hasGovernanceData } from "./governanceData.js";
import {
  computeCountryRiskScore,
  globalAverageRiskScore,
  PILLAR_WEIGHTS,
  type CountryRiskScore,
  type RiskBand as ScoreBand,
} from "./countryRiskScore.js";

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
  /** Composite RegActions Country Risk Score (FATF + Sanctions + WGI). */
  riskScore: CountryRiskScore;
  /** Mean score across profiled countries, for "vs global average". */
  globalAverage: number;
  /** Scoring weights (for the "How is this scored?" card). */
  weights: typeof PILLAR_WEIGHTS;
  lastPlenary: string;
  nextPlenary: string;
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
    riskScore: computeCountryRiskScore(country.iso2),
    globalAverage: globalAverageRiskScore(),
    weights: PILLAR_WEIGHTS,
    lastPlenary: FATF_LAST_PLENARY,
    nextPlenary: FATF_NEXT_PLENARY,
  };
}

/** Human phrasing for a FATF change-log entry. */
export function fatfChangeText(change: FatfChange): string {
  const verb = change.change === "added" ? "Added to" : "Removed from";
  return `${verb} the FATF ${fatfLabel(change.listing).toLowerCase()}`;
}

/**
 * Countries that get a page / appear in the global index: any with a risk signal
 * (WGI governance, FATF listing, sanctions, or enforcement coverage). This is the
 * near-complete world (governance covers ~184); micro-states with no data at all
 * are excluded rather than shown as an empty 0.
 */
export function pageCountries(): Country[] {
  return COUNTRIES.filter(
    (c) =>
      hasGovernanceData(c.iso2) ||
      isFatfListed(c.iso2) ||
      isSanctioned(c.iso2) ||
      hasEnforcementCoverage(c.iso2),
  );
}

export interface CountryIndexEntry {
  country: Country;
  flag: string;
  score: number;
  band: ScoreBand;
  fatf?: FatfStatus;
  sanctionsTier?: SanctionsTier;
  hasEnforcement: boolean;
}

/** Every page country with its composite score, sorted highest-risk first. */
export function buildCountryIndex(): CountryIndexEntry[] {
  return pageCountries()
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
      };
    })
    .sort(
      (a, b) => b.score - a.score || a.country.name.localeCompare(b.country.name),
    );
}
