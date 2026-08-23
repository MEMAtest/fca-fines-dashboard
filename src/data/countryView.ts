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
  sanctionsTierLabel,
  SANCTIONS_REVIEWED,
  type CountrySanctions,
  type SanctionsTier,
  type SanctionsImposer,
} from "./sanctionsStatus.js";
import {
  hasGovernanceData,
  getGovernanceDimensions,
  GOVERNANCE_VINTAGE,
} from "./governanceData.js";
import {
  computeCountryRiskScore,
  scoreBreakdown,
  type CountryRiskScore,
  type ScoreBreakdown,
  type RiskBand as ScoreBand,
} from "./countryRiskScore.js";
import { getCpi, CPI_TOTAL, CPI_YEAR, type CpiEntry } from "./cpiData.js";
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
import { getFatfAssessment } from "./fatfAssessmentData.js";
import {
  getApprovedSanctions,
  SANCTIONS_APPROVED_SNAPSHOT,
} from "./sanctionsApprovedData.js";
import {
  computeCountryRiskV2,
  type CountryRiskPublicationStatus,
  type CountryRiskV2Result,
} from "./countryRiskV2.js";
import {
  computeCountryRiskCurrent,
  type CountryRiskCurrentResult,
} from "./countryRiskMethodology.js";
import {
  buildCountryRiskPublicSurface,
  type CountryRiskPublicSurface,
} from "./countryRiskSurface.js";
import {
  deriveSectorExposure,
  type SectorRow,
  type SectorExposureInput,
} from "./sectorExposure.js";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Format an ISO date (YYYY-MM-DD or YYYY-MM) as "19 Jun 2026" / "Oct 2026". */
export function formatDate(iso: string): string {
  const [y, m, dayValue] = iso.split("T")[0].split("-");
  const d = dayValue?.slice(0, 2);
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

/** One imposer's country-level sanctions posture (for the attributed sanctions block). */
export interface SanctionsImposerRow {
  imposer: SanctionsImposer;
  /** True if a country-level programme by this imposer is identified. */
  active: boolean;
  /** Tier label where active (e.g. "Comprehensive"), else undefined. */
  tierLabel?: string;
  /** Programme name where active. */
  program?: string;
  sourceUrl?: string;
}

/** One WGI institutional sub-score (percentile, higher = better). */
export interface GovernanceSubScore {
  key: "ge" | "rq" | "rl";
  label: string;
  /** WGI percentile 0-100, or null if missing. */
  percentile: number | null;
}

/**
 * Attributed indicator blocks for the country page — every value sourced and
 * dated. Shared by the React page and the prerendered HTML so both cite the same
 * numbers. All fields derive from the sourced data modules; nothing invented.
 */
export interface CountryAttribution {
  sanctions: {
    /** UN, EU, UK, US order — Yes/No per imposer. */
    imposers: SanctionsImposerRow[];
    /** Review month (YYYY-MM). */
    reviewed: string;
    /** Highest tier label across imposers, if any. */
    headlineTier?: string;
  };
  governance: {
    subScores: GovernanceSubScore[];
    vintage: string;
  };
  corruption?: {
    score: number;
    rank: number;
    total: number;
    year: string;
  };
  enforcement:
    | { assessed: true; trackedActions: number; regulatorCount: number }
    | { assessed: false };
  fatf: {
    /** "Black list" | "Grey list" | "Not listed" */
    status: string;
    plenary: string;
  };
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
  /** Legacy composite score retained only for historical/API compatibility. */
  riskScore: CountryRiskScore;
  /** Historical v2 result; never use this for current rankings or copy. */
  riskV2: CountryRiskV2Result;
  /** Current methodology result. v2 remains above solely for historical/API compatibility. */
  riskV3: CountryRiskCurrentResult;
  /** Alias for consumers that should not encode a methodology version. */
  riskCurrent: CountryRiskCurrentResult;
  /** Additive, non-scoring public evidence, freshness and change-history surface. */
  publicSurface: CountryRiskPublicSurface;
  /** Current v3 publication state; provisional scores remain visible but can never be labelled Low. */
  scoreStatus: CountryScorePublicationStatus;
  /** Historical v2 score derivation; current pillar data lives in riskCurrent.pillars. */
  breakdown: ScoreBreakdown;
  /** Mean score across current-methodology countries, for "vs global average". */
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
  /** False until every v2 candidate has an approved/rejected decision. */
  sanctionsCoverageComplete: boolean;
  /** Dated composite-score snapshots (baseline first). A real trend accrues as more are recorded. */
  scoreHistory: { date: string; score: number }[];
  /** Attributed indicator blocks (sanctions per imposer, governance sub-scores, CPI, enforcement, FATF). */
  attribution: CountryAttribution;
  lastPlenary: string;
  nextPlenary: string;
  /** FATF-network membership + tracked national regulators. */
  regulatory: RegulatoryView;
  /** Sector-level financial-crime exposure, derived from the sourced modules. */
  sectorExposure: SectorRow[];
}

/** Imposers shown in the attributed sanctions block, display order + data key. */
const ATTR_IMPOSERS: { imposer: SanctionsImposer; label: string }[] = [
  { imposer: "UN", label: "UN" },
  { imposer: "EU", label: "EU" },
  { imposer: "UK", label: "UK" },
  { imposer: "OFAC", label: "US" }, // OFAC is the US Treasury programme
];

const GOVERNANCE_SUBSCORE_META: { key: "ge" | "rq" | "rl"; label: string }[] = [
  { key: "ge", label: "Government Effectiveness" },
  { key: "rq", label: "Regulatory Quality" },
  { key: "rl", label: "Rule of Law" },
];

const TIER_RANK: Record<SanctionsTier, number> = {
  comprehensive: 3,
  sectoral: 2,
  targeted: 1,
};

/** WGI percentile (higher is better) to the v3 governance risk direction. */
function governanceRisk(iso2: string, key: "cc" | "rl" | "pv" | "va"): number | null {
  const value = getGovernanceDimensions(iso2)?.[key];
  return value === undefined ? null : Math.round(((100 - Math.max(0, Math.min(100, value))) / 10) * 10) / 10;
}

function highestTier(sanctions: CountrySanctions | undefined): SanctionsTier | undefined {
  return sanctions?.programs.reduce<SanctionsTier | undefined>(
    (highest, program) => !highest || TIER_RANK[program.tier] > TIER_RANK[highest] ? program.tier : highest,
    undefined,
  );
}

/** Build the attributed indicator blocks from the sourced data modules. */
export function buildAttribution(
  country: Country,
  view: {
    sanctions?: CountrySanctions;
    cpi?: CpiEntry;
    enforcement?: CountryEnforcementSummary;
    statusHeading: string;
    lastPlenary: string;
  },
): CountryAttribution {
  const tier = highestTier(view.sanctions);
  const imposers: SanctionsImposerRow[] = ATTR_IMPOSERS.map(({ imposer, label }) => {
    // pick the highest-tier programme for this imposer, if any
    const progs = view.sanctions?.programs.filter((p) => p.imposer === imposer) ?? [];
    const top = progs.length
      ? progs.reduce((a, b) => (TIER_RANK[b.tier] > TIER_RANK[a.tier] ? b : a))
      : undefined;
    return {
      imposer: label as SanctionsImposer, // display label (US for OFAC)
      active: !!top,
      tierLabel: top ? sanctionsTierLabel(top.tier) : undefined,
      program: top?.program,
      sourceUrl: top?.sourceUrl,
    };
  });

  const dims = getGovernanceDimensions(country.iso2);
  const subScores: GovernanceSubScore[] = GOVERNANCE_SUBSCORE_META.map((m) => ({
    key: m.key,
    label: m.label,
    percentile: dims && dims[m.key] !== undefined ? (dims[m.key] as number) : null,
  }));

  return {
    sanctions: {
      imposers,
      reviewed: SANCTIONS_APPROVED_SNAPSHOT.effectiveAt?.slice(0, 7) ?? SANCTIONS_REVIEWED,
      headlineTier: tier ? sanctionsTierLabel(tier) : undefined,
    },
    governance: { subScores, vintage: GOVERNANCE_VINTAGE },
    corruption: view.cpi
      ? { score: view.cpi.score, rank: view.cpi.rank, total: CPI_TOTAL, year: CPI_YEAR }
      : undefined,
    enforcement: view.enforcement
      ? {
          assessed: true,
          trackedActions: view.enforcement.trackedActions,
          regulatorCount: view.enforcement.regulatorCount,
        }
      : { assessed: false },
    fatf: { status: view.statusHeading, plenary: view.lastPlenary },
  };
}

/**
 * Assemble the sector-exposure input from the sourced modules and derive the rows.
 * Nothing here is invented: sanctions tier + programme names, FATF listing, WGI
 * governance domains and the CPI score all come from the modules already loaded
 * for this country. The FATF listing is normalised to the sector module's
 * "black" | "grey" vocabulary.
 */
export function buildSectorExposure(input: {
  sanctions?: CountrySanctions;
  sanctionsTier?: SanctionsTier;
  sanctionsEvidenceComplete?: boolean;
  fatf?: FatfStatus;
  breakdown: ScoreBreakdown;
  cpi?: CpiEntry;
}): SectorRow[] {
  const domainRisk = (key: string): number | null =>
    input.breakdown.domains.find((d) => d.key === key)?.risk ?? null;
  const sectoralPrograms = (input.sanctions?.programs ?? [])
    .filter((p) => p.tier === "sectoral")
    .map((p) => p.program);
  const fatf: SectorExposureInput["fatf"] = input.fatf
    ? input.fatf.listing === "call-for-action"
      ? "black"
      : "grey"
    : undefined;
  return deriveSectorExposure({
    sanctionsTier: input.sanctionsTier,
    sectoralPrograms,
    sanctionsEvidenceComplete: input.sanctionsEvidenceComplete,
    fatf,
    domains: {
      corruption: domainRisk("corruption"),
      ruleOfLaw: domainRisk("ruleOfLaw"),
      politicalStability: domainRisk("politicalStability"),
      accountability: domainRisk("accountability"),
    },
    cpi: input.cpi?.score,
  });
}

/**
 * Current-methodology sector view.  This is deliberately separate from the
 * historical `buildSectorExposure` adapter above: v2 governance domains and
 * sanctions points must not be quietly presented as part of the v3 result.
 * Sanctions and FATF remain legal/compliance overlays here, not score inputs.
 */
export function buildSectorExposureCurrent(
  risk: CountryRiskCurrentResult,
  context: { cpi?: number } = {},
): SectorRow[] {
  const sanctions = risk.overlays.sanctions;
  const fatf = risk.overlays.fatf.listing === "call-for-action"
    ? "black"
    : risk.overlays.fatf.listing === "increased-monitoring"
      ? "grey"
      : undefined;
  const effectiveness = risk.pillars.effectiveness.score;
  const safeguards = risk.pillars.safeguards.score;
  const governance = risk.pillars.governance.score;
  const bo = risk.beneficialOwnership.score;
  const review = (sector: string, rationale: string): SectorRow => ({
    sector,
    level: "Review",
    rationale,
  });
  const elevated = (sector: string, rationale: string): SectorRow => ({
    sector,
    level: "Elevated",
    rationale,
  });
  const high = (sector: string, rationale: string): SectorRow => ({
    sector,
    level: "High",
    rationale,
  });
  const low = (sector: string, rationale: string): SectorRow => ({
    sector,
    level: "Low",
    rationale,
  });

  const banking = fatf === "black"
    ? high("Banking & payments", "FATF call-for-action overlay requires enhanced treatment")
    : fatf === "grey"
      ? elevated("Banking & payments", "FATF increased-monitoring overlay raises correspondent risk")
      : governance === null
        ? review("Banking & payments", "Governance pillar unavailable; no low-exposure conclusion")
        : governance >= 6
          ? elevated("Banking & payments", `Governance pillar risk is ${governance.toFixed(1)}/10`)
          : low("Banking & payments", "No FATF overlay and governance pillar within normal range");

  const trade = !sanctions.coverageComplete
    ? review("Trade & export controls", "Sanctions overlay coverage incomplete; verify before clearing trade")
    : sanctions.highestTier === "comprehensive"
      ? high("Trade & export controls", "Comprehensive sanctions overlay restricts most cross-border trade")
      : sanctions.highestTier === "sectoral"
        ? high("Trade & export controls", "Sectoral sanctions overlay restricts named trade sectors")
        : sanctions.highestTier === "targeted"
          ? elevated("Trade & export controls", "Targeted sanctions overlay requires counterparty screening")
          : fatf === "black"
            ? high("Trade & export controls", "FATF call-for-action overlay raises diversion risk")
            : low("Trade & export controls", "No direct sanctions or FATF call-for-action overlay identified");

  const crypto = fatf === "black"
    ? high("Crypto & virtual assets", "FATF call-for-action overlay requires enhanced VASP treatment")
    : fatf === "grey"
      ? elevated("Crypto & virtual assets", "FATF increased-monitoring overlay raises VASP supervision risk")
      : effectiveness === null
        ? review("Crypto & virtual assets", "Effectiveness pillar unavailable; no low-exposure conclusion")
        : effectiveness >= 7
          ? elevated("Crypto & virtual assets", `Effectiveness pillar risk is ${effectiveness.toFixed(1)}/10`)
          : low("Crypto & virtual assets", "No FATF overlay and effectiveness pillar within normal range");

  const property = bo === null
    ? review("Real estate & luxury assets", "Beneficial-ownership evidence unavailable; verify ownership controls")
    : bo >= 6
      ? high(
          "Real estate & luxury assets",
          context.cpi === undefined
            ? `Beneficial-ownership subscore is ${bo.toFixed(1)}/10`
            : `BO subscore ${bo.toFixed(1)}/10; CPI context ${context.cpi}/100`,
        )
      : context.cpi !== undefined && context.cpi < 40
        ? elevated("Real estate & luxury assets", `CPI context ${context.cpi}/100; BO subscore ${bo.toFixed(1)}/10`)
      : governance !== null && governance >= 6
        ? elevated("Real estate & luxury assets", `Governance pillar risk is ${governance.toFixed(1)}/10`)
        : governance === null
          ? review("Real estate & luxury assets", "Governance evidence unavailable; no low-exposure conclusion")
          : low("Real estate & luxury assets", "Beneficial-ownership and governance signals are within normal range");

  const procurement = sanctions.highestTier === "comprehensive"
    ? high("State-linked & procurement", "Comprehensive sanctions overlay restricts state-linked dealings")
    : governance === null && effectiveness === null
    ? review("State-linked & procurement", "Current risk pillars unavailable; no low-exposure conclusion")
    : governance !== null && governance >= 7
      ? high("State-linked & procurement", `Governance pillar risk is ${governance.toFixed(1)}/10`)
      : effectiveness !== null && effectiveness >= 7
        ? high("State-linked & procurement", `Effectiveness pillar risk is ${effectiveness.toFixed(1)}/10`)
        : governance !== null && governance >= 6
          ? elevated("State-linked & procurement", `Governance pillar risk is ${governance.toFixed(1)}/10`)
          : low("State-linked & procurement", "Current risk pillars show no elevated procurement signal");

  // Safeguards is intentionally included in the current derivation so it is
  // visible to users, while sanctions/FATF remain overlays only.
  if (safeguards !== null && safeguards >= 7 && procurement.level === "Low") {
    procurement.level = "Elevated";
    procurement.rationale = `Safeguards pillar risk is ${safeguards.toFixed(1)}/10`;
  }
  return [banking, trade, crypto, property, procurement];
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

/** Keep every presentation and decision consumer on the scorer's country-level coverage gate. */
export function countrySanctionsPresentation(
  iso2: string,
  riskResult: Pick<CountryRiskCurrentResult, "sanctionsCoverageComplete"> = computeCountryRiskCurrent(iso2),
): {
  sanctionsCoverageComplete: boolean;
  sanctions: CountrySanctions | undefined;
  sanctionsTier: SanctionsTier | undefined;
} {
  const sanctionsCoverageComplete = riskResult.sanctionsCoverageComplete;
  const sanctions = sanctionsCoverageComplete ? getApprovedSanctions(iso2) : undefined;
  return {
    sanctionsCoverageComplete,
    sanctions,
    sanctionsTier: highestTier(sanctions),
  };
}

export function buildCountryView(country: Country): CountryView {
  const fatf = getFatfStatus(country.iso2);
  const history = FATF_RECENT_CHANGES.filter((c) => c.iso2 === country.iso2);
  const enforcement = getCountryEnforcementSummary(country.iso2);
  const riskV2 = computeCountryRiskV2(country.iso2);
  const riskV3 = computeCountryRiskCurrent(country.iso2);
  const { sanctionsCoverageComplete, sanctions, sanctionsTier } = countrySanctionsPresentation(country.iso2, riskV3);

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
  const publicSurface = buildCountryRiskPublicSurface(country.iso2);
  const scoreStatus = riskV3.status;
  const breakdown = scoreBreakdown(country.iso2);
  const cpi = getCpi(country.iso2);
  const enforcementAssessed = !!enforcement;
  const hasComprehensiveSanctions = computeHasComprehensiveSanctions(sanctions);
  const hasTargetedSanctions = !!sanctionsTier && !hasComprehensiveSanctions;

  const decision = buildDecision({
    name: country.name,
    riskResult: {
      score: riskV3.score,
      band: riskV3.band,
      status: riskV3.status,
    },
    scoreAvailable: riskV3.score !== null,
    fatfDeterminationScored: riskV3.pillars.icrg.score !== null,
    breakdown,
    currentPillars: [
      { key: "effectiveness", label: "Financial-crime effectiveness", risk: riskV3.pillars.effectiveness.score, appliedWeight: riskV3.pillars.effectiveness.appliedWeight, contribution: riskV3.pillars.effectiveness.contribution },
      { key: "safeguards", label: "Legal and supervisory safeguards", risk: riskV3.pillars.safeguards.score, appliedWeight: riskV3.pillars.safeguards.appliedWeight, contribution: riskV3.pillars.safeguards.contribution },
      { key: "governance", label: "Governance and institutional integrity", risk: riskV3.pillars.governance.score, appliedWeight: riskV3.pillars.governance.appliedWeight, contribution: riskV3.pillars.governance.contribution },
    ],
    currentGovernanceDomains: [
      { key: "corruption", label: "Corruption and integrity", risk: governanceRisk(country.iso2, "cc") },
      { key: "ruleOfLaw", label: "Rule of law", risk: governanceRisk(country.iso2, "rl") },
      { key: "politicalStability", label: "Political stability", risk: governanceRisk(country.iso2, "pv") },
      { key: "accountability", label: "Voice and accountability", risk: governanceRisk(country.iso2, "va") },
    ],
    sanctions,
    sanctionsTier,
    sanctionsCoverageComplete,
    enforcementAssessed,
    regulatorCodes: enforcement?.regulators.map((r) => r.code),
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
    riskV2,
    riskV3,
    riskCurrent: riskV3,
    publicSurface,
    scoreStatus,
    breakdown,
    globalAverage: globalAverageRiskScoreCurrent(),
    cpi,
    regionalPeers: regionalPeers(country.iso2, country.region),
    decision,
    enforcementAssessed,
    hasComprehensiveSanctions,
    hasTargetedSanctions,
    sanctionsCoverageComplete,
    scoreHistory: riskV3.score === null || !SANCTIONS_APPROVED_SNAPSHOT.generatedAt
      ? []
      : [{ date: SANCTIONS_APPROVED_SNAPSHOT.generatedAt.slice(0, 10), score: riskV3.score }],
    attribution: buildAttribution(country, {
      sanctions,
      cpi,
      enforcement,
      statusHeading,
      lastPlenary: FATF_LAST_PLENARY,
    }),
    lastPlenary: FATF_LAST_PLENARY,
    nextPlenary: FATF_NEXT_PLENARY,
    regulatory,
    sectorExposure: buildSectorExposureCurrent(riskV3, { cpi: cpi?.score }),
  };
}

/** Highest-risk same-region peers (excluding the country itself). */
export function regionalPeers(iso2: string, region: string, limit = 6): CountryIndexEntry[] {
  return buildCountryIndex()
    .filter(
      (e) =>
        e.country.region === region &&
        e.country.iso2 !== iso2 &&
        e.score !== null,
    )
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
      Boolean(getApprovedSanctions(c.iso2)) ||
      hasEnforcementCoverage(c.iso2),
  );
}

/**
 * Institutional control strength (0–10, higher = stronger), derived from the
 * current v3 governance pillar. This keeps the risk-matrix x-axis independent
 * from enforcement exposure and does not duplicate the technical-safeguards
 * pillar. Missing governance evidence remains null (fail closed).
 */
export function controlStrength(iso2: string): number | null {
  const governanceRisk = computeCountryRiskCurrent(iso2).pillars.governance.score;
  return governanceRisk === null ? null : Math.round((10 - governanceRisk) * 10) / 10;
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
  /** Null means fewer than two current v3 pillars are available. */
  score: number | null;
  band: ScoreBand | null;
  status: CountryScorePublicationStatus;
  fatf?: FatfStatus;
  sanctionsTier?: SanctionsTier;
  sanctionsCoverageComplete: boolean;
  hasEnforcement: boolean;
  /** Current v3 institutional control strength 0–10, or null if governance is unavailable. */
  controlStrength: number | null;
  /** Enforcement exposure 0–10 (log-normalised tracked actions). */
  enforcementExposure: number;
}

export type CountryScorePublicationStatus = CountryRiskPublicationStatus;

let _index: CountryIndexEntry[] | undefined;

/** Every page country with its composite score, sorted highest-risk first. */
export function buildCountryIndex(): CountryIndexEntry[] {
  if (_index) return _index;
  _index = pageCountries()
    .map((country) => {
      const result = computeCountryRiskCurrent(country.iso2);
      const { sanctions, sanctionsTier, sanctionsCoverageComplete } = countrySanctionsPresentation(country.iso2, result);
      return {
        country,
        flag: flagEmoji(country.iso2),
        score: result.score,
        band: result.band,
        status: result.status,
        fatf: getFatfStatus(country.iso2),
        sanctionsTier,
        sanctionsCoverageComplete,
        hasEnforcement: hasEnforcementCoverage(country.iso2),
        controlStrength: controlStrength(country.iso2),
        enforcementExposure: enforcementExposure(country.iso2),
      };
    })
    .sort((a, b) => {
      if (a.score === null) return b.score === null ? a.country.name.localeCompare(b.country.name) : 1;
      if (b.score === null) return -1;
      return b.score - a.score || a.country.name.localeCompare(b.country.name);
    });
  return _index;
}

let _globalAverageV2: number | undefined;

/** Historical v2 average. Kept explicit so it cannot be mistaken for current data. */
export function globalAverageRiskScoreV2(): number {
  if (_globalAverageV2 !== undefined) return _globalAverageV2;
  const scores = pageCountries()
    .map((country) => computeCountryRiskV2(country.iso2).score)
    .filter((score): score is number => score !== null);
  _globalAverageV2 = scores.length
    ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
    : 0;
  return _globalAverageV2;
}

/** Mean published current-methodology result across complete/provisional countries. */
export function globalAverageRiskScoreCurrent(): number {
  const scores = buildCountryIndex()
    .map((entry) => entry.score)
    .filter((score): score is number => score !== null);
  return scores.length
    ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
    : 0;
}

/** Global rank (1 = highest risk) and total, from the sorted index. */
export function globalRank(iso2: string): { rank: number | null; total: number } {
  const idx = buildCountryIndex().filter((entry) => entry.score !== null);
  const pos = idx.findIndex((e) => e.country.iso2 === iso2);
  return { rank: pos < 0 ? null : pos + 1, total: idx.length };
}

/** Rank within the country's region (1 = highest risk in-region) and region size. */
export function regionRank(
  iso2: string,
  region: string,
): { rank: number | null; total: number } {
  const inRegion = buildCountryIndex().filter(
    (e) => e.country.region === region && e.score !== null,
  );
  const pos = inRegion.findIndex((e) => e.country.iso2 === iso2);
  return { rank: pos < 0 ? null : pos + 1, total: inRegion.length };
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
    if (e.score === null) continue;
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
  /** Mean current v3 contribution from FATF effectiveness. */
  effectiveness: number;
  /** Mean current v3 contribution from technical safeguards. */
  safeguards: number;
  /** Mean current v3 contribution from governance. */
  governance: number;
}

/** Historical v2 pillar average, retained only for explicitly historical consumers. */
export interface PillarAveragesV2 {
  governance: number;
  fatf: number;
  sanctions: number;
}

let _pillarAverages: PillarAverages | undefined;

/**
 * Global mean weighted contribution of each current v3 pillar across published countries.
 */
export function pillarAverages(): PillarAverages {
  if (_pillarAverages) return _pillarAverages;
  let effectiveness = 0;
  let safeguards = 0;
  let governance = 0;
  let n = 0;
  for (const c of pageCountries()) {
    const result = computeCountryRiskCurrent(c.iso2);
    if (result.score === null) continue;
    effectiveness += result.pillars.effectiveness.contribution ?? 0;
    safeguards += result.pillars.safeguards.contribution ?? 0;
    governance += result.pillars.governance.contribution ?? 0;
    n += 1;
  }
  const round = (x: number) => Math.round(x * 10) / 10;
  _pillarAverages = {
    effectiveness: n ? round(effectiveness / n) : 0,
    safeguards: n ? round(safeguards / n) : 0,
    governance: n ? round(governance / n) : 0,
  };
  return _pillarAverages;
}

let _pillarAveragesV2: PillarAveragesV2 | undefined;
export function pillarAveragesV2(): PillarAveragesV2 {
  if (_pillarAveragesV2) return _pillarAveragesV2;
  let governance = 0;
  let fatf = 0;
  let sanctions = 0;
  let n = 0;
  for (const c of pageCountries()) {
    const result = computeCountryRiskV2(c.iso2);
    if (result.score === null) continue;
    governance += (result.pillars.governance.score ?? 0) * result.pillars.governance.appliedWeight;
    fatf += (result.pillars.aml.score ?? 0) * result.pillars.aml.appliedWeight;
    sanctions += (result.pillars.sanctions.score ?? 0) * result.pillars.sanctions.appliedWeight;
    n += 1;
  }
  const round = (x: number) => Math.round(x * 10) / 10;
  _pillarAveragesV2 = {
    governance: n ? round(governance / n) : 0,
    fatf: n ? round(fatf / n) : 0,
    sanctions: n ? round(sanctions / n) : 0,
  };
  return _pillarAveragesV2;
}
