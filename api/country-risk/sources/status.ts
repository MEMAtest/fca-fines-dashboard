import type { VercelRequest, VercelResponse } from "@vercel/node";
import { countryRiskSourcesForMethodology } from "../../../src/data/countryRiskSources.js";
import { pageCountries } from "../../../src/data/countryView.js";
import { computeCountryRiskV3, COUNTRY_RISK_V3_METHODOLOGY_VERSION } from "../../../src/data/countryRiskV3.js";
import { SANCTIONS_APPROVED_SNAPSHOT } from "../../../src/data/sanctionsApprovedData.js";
import { SANCTIONS_IMPOSERS } from "../../../src/data/sanctionsEvidence.js";
import { COUNTRIES } from "../../../src/data/countries.js";
import { assessCountryRiskReadiness } from "../../../src/data/countryRiskReadiness.js";
import {
  getCountryRiskOperationalHealth,
} from "../../../server/services/countryRiskOperationalHealth.js";
import {
  SANCTIONS_CANDIDATE_COUNTRY_COUNT,
  SANCTIONS_CATALOGUE_COVERAGE,
  SANCTIONS_REGIME_CANDIDATES,
  SANCTIONS_TIER_RULES,
} from "../../../src/data/sanctionsRegimeCandidates.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  const asOf = new Date();
  const sources = countryRiskSourcesForMethodology("v3", asOf);
  const results = pageCountries().map((country) => computeCountryRiskV3(country.iso2, { asOf }));
  const readiness = assessCountryRiskReadiness(results, sources);
  const { sourceHealth, operationalSourceRuns } = await getCountryRiskOperationalHealth(asOf, sources);
  const readinessReasons = [
    ...readiness.reasons,
    ...sourceHealth.issues.map((issue) => issue.message),
  ];
  return res.status(200).json({
    methodologyVersion: COUNTRY_RISK_V3_METHODOLOGY_VERSION,
    generatedAt: asOf.toISOString(),
    // The default needs both a valid approved snapshot and current operational evidence.
    readyForDefault: readiness.readyForDefault && sourceHealth.readyForScoring,
    snapshotReady: readiness.readyForDefault,
    sourcesCurrent: sourceHealth.readyForScoring,
    readinessReasons,
    coverage: readiness.coverage,
    sources,
    sourceHealth,
    operationalSourceRuns,
    sanctionsReview: {
      scoringReady: SANCTIONS_APPROVED_SNAPSHOT.coverageComplete,
      approvedSnapshot: SANCTIONS_APPROVED_SNAPSHOT,
      countries: SANCTIONS_CANDIDATE_COUNTRY_COUNT,
      regimeCountryRecords: SANCTIONS_REGIME_CANDIDATES.length,
      imposerCountryRecords: SANCTIONS_REGIME_CANDIDATES.length,
      coverageModel: "explicit-country-by-imposer",
      expectedCoverageCells: COUNTRIES.length * SANCTIONS_IMPOSERS.length,
      materialisedCoverageCells: SANCTIONS_APPROVED_SNAPSHOT.coverageCellCount,
      explicitCoverageCells: SANCTIONS_APPROVED_SNAPSHOT.coverageCellCount,
      automatedCatalogueAttestations: SANCTIONS_IMPOSERS.length,
      pending: SANCTIONS_APPROVED_SNAPSHOT.coverageComplete
        ? 0
        : SANCTIONS_APPROVED_SNAPSHOT.candidateCount - SANCTIONS_APPROVED_SNAPSHOT.approvedCount - SANCTIONS_APPROVED_SNAPSHOT.rejectedCount,
      situationRelated: SANCTIONS_REGIME_CANDIDATES.filter((candidate) => candidate.relationship === "situation-related").length,
      taxonomy: SANCTIONS_TIER_RULES,
      catalogueCoverage: SANCTIONS_CATALOGUE_COVERAGE,
      candidates: SANCTIONS_REGIME_CANDIDATES,
      approvalMode: SANCTIONS_APPROVED_SNAPSHOT.approvalMode,
      externalValidation: SANCTIONS_APPROVED_SNAPSHOT.externalValidation,
      remainingGate: SANCTIONS_APPROVED_SNAPSHOT.coverageComplete
        ? null
        : "Complete deterministic official-evidence classification and explicit country-by-imposer coverage.",
    },
  });
}
