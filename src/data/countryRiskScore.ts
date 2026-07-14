/**
 * RegActions Country Risk Score — the transparent composite (Stage 3).
 *
 * Score = FATF (40%) + Sanctions (35%) + Governance/WGI (25%), on a 0–10 scale
 * where HIGHER = HIGHER RISK. CPI and enforcement are NOT scored (CPI is licence-
 * restricted display-only; enforcement measures regulator activity, not risk).
 *
 * Each pillar maps to a 0–10 risk sub-score; the composite is their weighted mean.
 * If governance data is missing for a country, its weight is dropped and the
 * remaining pillars are renormalised (FATF is always present — "none" = 0 risk).
 *
 * Bands (label ranges, per the design): Low 1.0–2.9 · Moderate 3.0–4.9 ·
 * High 5.0–6.9 · Very high 7.0–10.0.
 */

import { getFatfStatus } from "./fatfStatus.js";
import { highestSanctionsTier } from "./sanctionsStatus.js";
import {
  getGovernancePercentile,
  GOVERNANCE_PERCENTILE,
} from "./governanceData.js";

export type RiskBand = "low" | "moderate" | "high" | "very-high";

export const PILLAR_WEIGHTS = { fatf: 0.4, sanctions: 0.35, governance: 0.25 } as const;

export interface RiskComponents {
  fatf: number; // 0–10
  sanctions: number; // 0–10
  governance: number | null; // 0–10, or null if no WGI data
}

export interface CountryRiskScore {
  score: number; // 0–10, one decimal
  band: RiskBand;
  components: RiskComponents;
  hasGovernance: boolean;
  /** Weights actually applied (renormalised if governance missing). */
  appliedWeights: { fatf: number; sanctions: number; governance: number };
}

/** FATF listing → 0–10 risk. */
export function fatfRisk(iso2: string): number {
  const f = getFatfStatus(iso2);
  if (!f) return 0;
  return f.listing === "call-for-action" ? 10 : 6; // black vs grey
}

/** Highest sanctions tier → 0–10 risk. */
export function sanctionsRisk(iso2: string): number {
  const tier = highestSanctionsTier(iso2);
  if (!tier) return 0;
  return tier === "comprehensive" ? 10 : tier === "sectoral" ? 6 : 3;
}

/** WGI governance percentile (0–100, higher = better) → 0–10 risk (inverted). */
export function governanceRisk(percentile: number): number {
  const p = Math.max(0, Math.min(100, percentile));
  return Math.round(((100 - p) / 10) * 100) / 100;
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

export function computeCountryRiskScore(iso2: string): CountryRiskScore {
  const fatf = fatfRisk(iso2);
  const sanctions = sanctionsRisk(iso2);
  const pct = getGovernancePercentile(iso2);
  const governance = pct === undefined ? null : governanceRisk(pct);
  const hasGovernance = governance !== null;

  // Renormalise weights across the pillars we actually have.
  const w = { ...PILLAR_WEIGHTS } as { fatf: number; sanctions: number; governance: number };
  if (!hasGovernance) w.governance = 0;
  const totalW = w.fatf + w.sanctions + w.governance;
  const applied = {
    fatf: w.fatf / totalW,
    sanctions: w.sanctions / totalW,
    governance: w.governance / totalW,
  };

  const raw =
    fatf * applied.fatf +
    sanctions * applied.sanctions +
    (governance ?? 0) * applied.governance;
  const score = Math.round(raw * 10) / 10;

  return {
    score,
    band: bandFor(score),
    components: { fatf, sanctions, governance },
    hasGovernance,
    appliedWeights: applied,
  };
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
  _globalAvg = codes.length
    ? Math.round((total / codes.length) * 10) / 10
    : 0;
  return _globalAvg;
}
