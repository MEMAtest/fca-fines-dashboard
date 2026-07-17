import type { VercelRequest, VercelResponse } from "@vercel/node";
import { countryRiskSourcesAsOf } from "../../../src/data/countryRiskSources.js";
import { pageCountries } from "../../../src/data/countryView.js";
import { computeCountryRiskV2 } from "../../../src/data/countryRiskV2.js";
import { SANCTIONS_APPROVED_SNAPSHOT } from "../../../src/data/sanctionsApprovedData.js";
import { SANCTIONS_IMPOSERS } from "../../../src/data/sanctionsEvidence.js";
import {
  SANCTIONS_CANDIDATE_COUNTRY_COUNT,
  SANCTIONS_CATALOGUE_COVERAGE,
  SANCTIONS_REGIME_CANDIDATES,
  SANCTIONS_TIER_RULES,
} from "../../../src/data/sanctionsRegimeCandidates.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  const asOf = new Date();
  const sources = countryRiskSourcesAsOf(asOf);
  const results = pageCountries().map((country) => computeCountryRiskV2(country.iso2, { asOf }));
  const complete = results.filter((result) => result.status === "complete").length;
  const sourcesCurrent = sources.filter((source) => source.scored)
    .every((source) => source.state === "current");
  return res.status(200).json({
    generatedAt: asOf.toISOString(),
    readyForDefault: sourcesCurrent && complete === results.length,
    coverage: {
      total: results.length,
      complete,
      provisional: results.filter((result) => result.status === "provisional").length,
      insufficientData: results.filter((result) => result.status === "insufficient-data").length,
    },
    sources,
    sanctionsReview: {
      scoringReady: SANCTIONS_APPROVED_SNAPSHOT.coverageComplete,
      approvedSnapshot: SANCTIONS_APPROVED_SNAPSHOT,
      countries: SANCTIONS_CANDIDATE_COUNTRY_COUNT,
      regimeCountryRecords: SANCTIONS_REGIME_CANDIDATES.length,
      imposerCountryRecords: SANCTIONS_REGIME_CANDIDATES.length,
      coverageModel: "explicit-country-by-imposer",
      expectedCoverageCells: results.length * SANCTIONS_IMPOSERS.length,
      materialisedCoverageCells: SANCTIONS_APPROVED_SNAPSHOT.coverageCellCount,
      explicitCoverageCells: SANCTIONS_APPROVED_SNAPSHOT.coverageCellCount,
      catalogueAttestationsRequired: SANCTIONS_IMPOSERS.length,
      pending: SANCTIONS_APPROVED_SNAPSHOT.coverageComplete
        ? 0
        : SANCTIONS_APPROVED_SNAPSHOT.candidateCount - SANCTIONS_APPROVED_SNAPSHOT.approvedCount - SANCTIONS_APPROVED_SNAPSHOT.rejectedCount,
      situationRelated: SANCTIONS_REGIME_CANDIDATES.filter((candidate) => candidate.relationship === "situation-related").length,
      taxonomy: SANCTIONS_TIER_RULES,
      catalogueCoverage: SANCTIONS_CATALOGUE_COVERAGE,
      candidates: SANCTIONS_REGIME_CANDIDATES,
      remainingGate: "Independent compliance approval of each country nexus and proposed tier against the linked official measure evidence.",
    },
  });
}
