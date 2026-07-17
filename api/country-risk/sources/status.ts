import type { VercelRequest, VercelResponse } from "@vercel/node";
import { countryRiskSourcesAsOf } from "../../../src/data/countryRiskSources.js";
import { pageCountries } from "../../../src/data/countryView.js";
import { computeCountryRiskV2 } from "../../../src/data/countryRiskV2.js";
import { SANCTIONS_APPROVED_SNAPSHOT } from "../../../src/data/sanctionsApprovedData.js";
import { SANCTIONS_IMPOSERS } from "../../../src/data/sanctionsEvidence.js";
import { COUNTRIES } from "../../../src/data/countries.js";
import { assessCountryRiskReadiness } from "../../../src/data/countryRiskReadiness.js";
import {
  SANCTIONS_CANDIDATE_COUNTRY_COUNT,
  SANCTIONS_CATALOGUE_COVERAGE,
  SANCTIONS_REGIME_CANDIDATES,
  SANCTIONS_TIER_RULES,
} from "../../../src/data/sanctionsRegimeCandidates.js";
import { getSqlClient } from "../../../server/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  const asOf = new Date();
  const sources = countryRiskSourcesAsOf(asOf);
  const results = pageCountries().map((country) => computeCountryRiskV2(country.iso2, { asOf }));
  const readiness = assessCountryRiskReadiness(results, sources);
  let operationalSourceRuns: Array<Record<string, unknown>> = [];
  try {
    const sql = getSqlClient();
    operationalSourceRuns = await sql(
      `SELECT DISTINCT ON (source_id)
              source_id, status, source_url, retrieved_at, effective_at, sha256,
              parser_version, record_count, metadata
       FROM country_risk_source_runs
       WHERE source_id IN ('ofac-programmes', 'uk-regimes', 'eu-resources', 'un-consolidated-list',
                           'fatf-lists', 'fatf-assessments', 'world-bank-wgi', 'sanctions-regimes')
       ORDER BY source_id, retrieved_at DESC, id DESC`,
    );
  } catch (error) {
    console.warn("Country-risk operational source history unavailable", error instanceof Error ? error.message : error);
  }
  return res.status(200).json({
    generatedAt: asOf.toISOString(),
    readyForDefault: readiness.readyForDefault,
    readinessReasons: readiness.reasons,
    coverage: readiness.coverage,
    sources,
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
