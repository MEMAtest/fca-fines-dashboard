import type { CountryRiskSourceStatus } from "./countryRiskSources.js";

type CountryRiskReadinessResult = Pick<{
  status: "complete" | "provisional" | "insufficient-data";
  score: number | null;
  resultKind?: "complete" | "provisional" | "indicative-governance-proxy";
}, "status" | "score" | "resultKind">;

export interface CountryRiskReadiness {
  readyForDefault: boolean;
  reasons: string[];
  coverage: {
    total: number;
    complete: number;
    provisional: number;
    indicativeGovernanceProxy: number;
    insufficientData: number;
  };
}

/**
 * Release readiness follows the published missing-data policy: provisional is
 * an intentional output, while insufficient-data and unhealthy scored sources
 * fail closed.
 */
export function assessCountryRiskReadiness(
  results: CountryRiskReadinessResult[],
  sources: CountryRiskSourceStatus[],
): CountryRiskReadiness {
  const coverage = {
    total: results.length,
    complete: results.filter((result) => result.status === "complete").length,
    provisional: results.filter((result) => result.status === "provisional").length,
    indicativeGovernanceProxy: results.filter((result) => result.resultKind === "indicative-governance-proxy").length,
    insufficientData: results.filter((result) => result.status === "insufficient-data").length,
  };
  const unhealthy = sources.filter((source) => source.scored && source.state !== "current");
  const reasons: string[] = [];
  if (unhealthy.length) reasons.push(`Scored sources not current: ${unhealthy.map((source) => source.id).join(", ")}`);
  if (coverage.insufficientData) reasons.push(`${coverage.insufficientData} jurisdictions have fewer than two available pillars`);
  if (results.some((result) => result.score === 0)) reasons.push("A zero headline score requires investigation before release");
  return { readyForDefault: reasons.length === 0, reasons, coverage };
}
