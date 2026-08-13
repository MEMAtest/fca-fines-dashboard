export interface SanctionsSourceAssuranceResult {
  id: string;
  healthy: boolean;
  changed?: boolean;
  baselineMissing?: boolean;
  /** A full-catalogue change which is outside the country-risk score scope. */
  catalogueChanged?: boolean;
}

export type SanctionsSourceRunStatus = "succeeded" | "failed" | "review_required";

/**
 * A catalogue review is a property of the individual official source, not of
 * the overall assurance report. One changed catalogue must never make the
 * unchanged OFAC, UK or UN runs look unhealthy.
 */
export function sanctionsSourceRunStatus(source: SanctionsSourceAssuranceResult): SanctionsSourceRunStatus {
  if (!source.healthy) return "failed";
  if (source.changed || source.baselineMissing) return "review_required";
  return "succeeded";
}

export function sanctionsSourceRunPersistenceSummary(results: SanctionsSourceAssuranceResult[]) {
  return {
    productionScoresChanged: false as const,
    sourceStatuses: Object.fromEntries(results.map((source) => [source.id, sanctionsSourceRunStatus(source)])),
  };
}
