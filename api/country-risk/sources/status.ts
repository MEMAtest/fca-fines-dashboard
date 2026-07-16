import type { VercelRequest, VercelResponse } from "@vercel/node";
import { COUNTRY_RISK_SOURCES } from "../../../src/data/countryRiskSources.js";
import { pageCountries } from "../../../src/data/countryView.js";
import { computeCountryRiskV2 } from "../../../src/data/countryRiskV2.js";
import {
  SANCTIONS_CANDIDATE_COUNTRY_COUNT,
  SANCTIONS_CANDIDATE_SCORING_READY,
  SANCTIONS_CATALOGUE_COVERAGE,
  SANCTIONS_REGIME_CANDIDATES,
  SANCTIONS_TIER_RULES,
} from "../../../src/data/sanctionsRegimeCandidates.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  const results = pageCountries().map((country) => computeCountryRiskV2(country.iso2));
  const complete = results.filter((result) => result.status === "complete").length;
  const sourcesCurrent = COUNTRY_RISK_SOURCES.filter((source) => source.scored)
    .every((source) => source.state === "current");
  return res.status(200).json({
    generatedAt: new Date().toISOString(),
    readyForDefault: sourcesCurrent && complete === results.length,
    coverage: {
      total: results.length,
      complete,
      provisional: results.filter((result) => result.status === "provisional").length,
      insufficientData: results.filter((result) => result.status === "insufficient-data").length,
    },
    sources: COUNTRY_RISK_SOURCES,
    sanctionsReview: {
      scoringReady: SANCTIONS_CANDIDATE_SCORING_READY,
      countries: SANCTIONS_CANDIDATE_COUNTRY_COUNT,
      imposerCountryRecords: SANCTIONS_REGIME_CANDIDATES.length,
      pending: SANCTIONS_REGIME_CANDIDATES.filter((candidate) => candidate.reviewStatus === "pending-independent-review").length,
      situationRelated: SANCTIONS_REGIME_CANDIDATES.filter((candidate) => candidate.relationship === "situation-related").length,
      taxonomy: SANCTIONS_TIER_RULES,
      catalogueCoverage: SANCTIONS_CATALOGUE_COVERAGE,
      candidates: SANCTIONS_REGIME_CANDIDATES,
      remainingGate: "Independent compliance approval of each country nexus and proposed tier against the linked official measure evidence.",
    },
  });
}
