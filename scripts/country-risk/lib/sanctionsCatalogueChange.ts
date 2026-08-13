export interface SanctionsCatalogueBaseline {
  approvedFingerprint: string | null;
  approvedCoverageFingerprint?: string | null;
  approvedScoringFingerprint?: string | null;
}

export interface SanctionsCatalogueFingerprint {
  catalogueFingerprint: string;
  coverageFingerprint: string;
  scoringFingerprint: string;
}

/**
 * Separates a full official-catalogue change from a country-risk scoring
 * change. The legacy approved fingerprint remains a safe fallback for sources
 * whose full catalogue and scoring scopes are identical.
 */
export function classifySanctionsCatalogueChange(
  baseline: SanctionsCatalogueBaseline,
  current: SanctionsCatalogueFingerprint,
) {
  const approvedCoverageFingerprint = baseline.approvedCoverageFingerprint ?? baseline.approvedFingerprint;
  const approvedScoringFingerprint = baseline.approvedScoringFingerprint ?? baseline.approvedFingerprint;
  return {
    catalogueChanged: baseline.approvedFingerprint !== null
      && baseline.approvedFingerprint !== current.catalogueFingerprint,
    coverageChanged: approvedCoverageFingerprint !== null
      && approvedCoverageFingerprint !== current.coverageFingerprint,
    scoreEvidenceChanged: approvedScoringFingerprint !== null
      && approvedScoringFingerprint !== current.scoringFingerprint,
  };
}
