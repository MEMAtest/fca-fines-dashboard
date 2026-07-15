/**
 * RegActions Country Risk Score — the transparent composite.
 *
 * A 0–10 country ML/TF, sanctions & governance risk score (HIGHER = HIGHER RISK),
 * structured on the Basel AML Index domain model and aligned to the Wolfsberg
 * Group country-risk factors, built ONLY from licence-clean public sources:
 *
 *   BASE (governance) — weighted mean of World Bank WGI domains (CC BY 4.0):
 *     • Corruption               (WGI Control of Corruption)          35%
 *     • Rule of law & institutions (mean of Rule of Law / Regulatory
 *       Quality / Government Effectiveness)                           40%
 *     • Political stability      (WGI Political Stability)            15%
 *     • Voice & accountability   (WGI Voice & Accountability)        10%
 *   Each domain percentile (0–100, higher = better) → risk = (100 − pct)/10.
 *
 *   ESCALATORS added on top (capped at 10):
 *     • FATF listing   — grey +1.5, black +3.0
 *     • Sanctions      — targeted +1.0, sectoral +2.5, comprehensive +4.0
 *
 * NOT scored: Transparency International CPI (CC BY-ND — display only; the scored
 * corruption signal is WGI Control of Corruption) and enforcement volume (measures
 * regulator activity, not country risk). FATF Mutual-Evaluation *effectiveness*
 * ratings are a planned enhancement to the AML-framework domain.
 *
 * Bands: Low 0–2.9 · Moderate 3.0–4.9 · High 5.0–6.9 · Very high 7.0–10.
 */

import { getFatfStatus } from "./fatfStatus.js";
import { highestSanctionsTier } from "./sanctionsStatus.js";
import { getGovernanceDimensions, GOVERNANCE_PERCENTILE } from "./governanceData.js";

export type RiskBand = "low" | "moderate" | "high" | "very-high";

/** Weights of the governance BASE domains (sum to 1). */
export const DOMAIN_WEIGHTS = {
  corruption: 0.35,
  ruleOfLaw: 0.4,
  politicalStability: 0.15,
  accountability: 0.1,
} as const;

/** Points a FATF listing adds on top of the governance base. */
export const FATF_ESCALATION = { grey: 1.5, black: 3.0 } as const;
/** Points the highest sanctions tier adds on top of the governance base. */
export const SANCTIONS_ESCALATION = {
  targeted: 1.0,
  sectoral: 2.5,
  comprehensive: 4.0,
} as const;

export interface RiskDomains {
  /** 0–10 governance-risk per Basel-style domain (null if WGI data missing). */
  corruption: number | null;
  ruleOfLaw: number | null;
  politicalStability: number | null;
  accountability: number | null;
}

export interface RiskEscalator {
  /** Points added to the base. */
  points: number;
  /** Human label, e.g. "Grey list", "Comprehensive", "None". */
  label: string;
}

export interface CountryRiskScore {
  /** 0–10 composite, one decimal. */
  score: number;
  band: RiskBand;
  /** Governance base (weighted mean of the WGI domains), 0–10. */
  base: number;
  domains: RiskDomains;
  fatf: RiskEscalator;
  sanctions: RiskEscalator;
  hasGovernance: boolean;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;

/** WGI percentile (0–100, higher = better) → 0–10 governance risk (inverted). */
export function governanceRisk(percentile: number): number {
  const p = Math.max(0, Math.min(100, percentile));
  return round2((100 - p) / 10);
}

function meanRisk(pcts: Array<number | undefined>): number | null {
  const vals = pcts.filter((v): v is number => v !== undefined);
  if (vals.length === 0) return null;
  return governanceRisk(vals.reduce((s, v) => s + v, 0) / vals.length);
}

export function bandFor(score: number): RiskBand {
  if (score < 3) return "low";
  if (score < 5) return "moderate";
  if (score < 7) return "high";
  return "very-high";
}

export function bandLabel(band: RiskBand): string {
  return band === "low"
    ? "Low"
    : band === "moderate"
      ? "Moderate"
      : band === "high"
        ? "High"
        : "Very high";
}

function fatfEscalator(iso2: string): RiskEscalator {
  const f = getFatfStatus(iso2);
  if (!f) return { points: 0, label: "Not listed" };
  return f.listing === "call-for-action"
    ? { points: FATF_ESCALATION.black, label: "Black list" }
    : { points: FATF_ESCALATION.grey, label: "Grey list" };
}

function sanctionsEscalator(iso2: string): RiskEscalator {
  const tier = highestSanctionsTier(iso2);
  if (!tier) return { points: 0, label: "None" };
  const points =
    tier === "comprehensive"
      ? SANCTIONS_ESCALATION.comprehensive
      : tier === "sectoral"
        ? SANCTIONS_ESCALATION.sectoral
        : SANCTIONS_ESCALATION.targeted;
  return { points, label: tier.charAt(0).toUpperCase() + tier.slice(1) };
}

// Score inputs are static at runtime, so memoise by ISO code — the index, map,
// and per-domain/regional aggregates otherwise recompute ~186 scores each.
const _scoreCache = new Map<string, CountryRiskScore>();

export function computeCountryRiskScore(iso2: string): CountryRiskScore {
  const cached = _scoreCache.get(iso2);
  if (cached) return cached;
  const result = computeCountryRiskScoreUncached(iso2);
  _scoreCache.set(iso2, result);
  return result;
}

function computeCountryRiskScoreUncached(iso2: string): CountryRiskScore {
  const d = getGovernanceDimensions(iso2);
  const corruption = d?.cc !== undefined ? governanceRisk(d.cc) : null;
  const ruleOfLaw = meanRisk([d?.rl, d?.rq, d?.ge]);
  const politicalStability = d?.pv !== undefined ? governanceRisk(d.pv) : null;
  const accountability = d?.va !== undefined ? governanceRisk(d.va) : null;

  // Weighted mean of the available domains (weights renormalise if any missing).
  const weighted = (
    [
      [corruption ?? NaN, DOMAIN_WEIGHTS.corruption],
      [ruleOfLaw ?? NaN, DOMAIN_WEIGHTS.ruleOfLaw],
      [politicalStability ?? NaN, DOMAIN_WEIGHTS.politicalStability],
      [accountability ?? NaN, DOMAIN_WEIGHTS.accountability],
    ] as Array<[number, number]>
  ).filter(([v]) => !Number.isNaN(v));
  const wSum = weighted.reduce((s, [, w]) => s + w, 0);
  const baseRaw = wSum ? weighted.reduce((s, [v, w]) => s + v * w, 0) / wSum : 0;

  const fatf = fatfEscalator(iso2);
  const sanctions = sanctionsEscalator(iso2);
  // Round the base first so the report arithmetic (base + escalators = score) is exact.
  const base = round1(baseRaw);
  const score = Math.min(10, round1(base + fatf.points + sanctions.points));

  return {
    score,
    band: bandFor(score),
    base,
    domains: { corruption, ruleOfLaw, politicalStability, accountability },
    fatf,
    sanctions,
    hasGovernance: weighted.length > 0,
  };
}

// ─── Display breakdown (report "how is this scored?" + narrative facts) ──────

export interface DomainBreakdown {
  key: keyof RiskDomains;
  label: string;
  /** 0–10 domain risk, or null if no WGI data. */
  risk: number | null;
  /** Weight within the governance base (percent). */
  weightPct: number;
}

export interface ScoreBreakdown {
  /** Governance base 0–10. */
  base: number;
  domains: DomainBreakdown[];
  fatf: RiskEscalator;
  sanctions: RiskEscalator;
  /** Final composite (min(10, base + escalators)). */
  score: number;
}

const DOMAIN_LABELS: Record<keyof RiskDomains, string> = {
  corruption: "Corruption (WGI)",
  ruleOfLaw: "Rule of law & institutions",
  politicalStability: "Political stability",
  accountability: "Voice & accountability",
};

/**
 * The composite made explicit: the four governance domains and their weights that
 * form the base, plus the FATF and sanctions escalators added on top. This is what
 * the report renders under "how is this scored?".
 */
export function scoreBreakdown(iso2: string): ScoreBreakdown {
  const rs = computeCountryRiskScore(iso2);
  const domains: DomainBreakdown[] = [
    { key: "corruption", label: DOMAIN_LABELS.corruption, risk: rs.domains.corruption, weightPct: Math.round(DOMAIN_WEIGHTS.corruption * 100) },
    { key: "ruleOfLaw", label: DOMAIN_LABELS.ruleOfLaw, risk: rs.domains.ruleOfLaw, weightPct: Math.round(DOMAIN_WEIGHTS.ruleOfLaw * 100) },
    { key: "politicalStability", label: DOMAIN_LABELS.politicalStability, risk: rs.domains.politicalStability, weightPct: Math.round(DOMAIN_WEIGHTS.politicalStability * 100) },
    { key: "accountability", label: DOMAIN_LABELS.accountability, risk: rs.domains.accountability, weightPct: Math.round(DOMAIN_WEIGHTS.accountability * 100) },
  ];
  return { base: rs.base, domains, fatf: rs.fatf, sanctions: rs.sanctions, score: rs.score };
}

let _globalAvg: number | undefined;
/**
 * Mean risk score across the profiled (governance-covered) countries — the
 * "vs global average" comparator. Computed once and cached.
 */
export function globalAverageRiskScore(): number {
  if (_globalAvg !== undefined) return _globalAvg;
  const codes = Object.keys(GOVERNANCE_PERCENTILE);
  const total = codes.reduce((s, c) => s + computeCountryRiskScore(c).score, 0);
  _globalAvg = codes.length ? round1(total / codes.length) : 0;
  return _globalAvg;
}
