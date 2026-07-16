import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCountryByIso2 } from "../../src/data/countries.js";
import { getFatfAssessment, FATF_ASSESSMENT_EFFECTIVE_AT, FATF_ASSESSMENT_RETRIEVED_AT, FATF_ASSESSMENT_SHA256, FATF_ASSESSMENT_SOURCE } from "../../src/data/fatfAssessmentData.js";
import { getFatfStatus, FATF_LIST_SHA256, FATF_SOURCE_URL, FATF_VERIFIED_AT } from "../../src/data/fatfStatus.js";
import { getGovernanceDimensions, GOVERNANCE_LICENCE, GOVERNANCE_RETRIEVED_AT, GOVERNANCE_SHA256, GOVERNANCE_SOURCE, GOVERNANCE_VINTAGE } from "../../src/data/governanceData.js";
import { computeCountryRiskV2, COUNTRY_RISK_METHODOLOGY_VERSION, fatfAssessmentRisk } from "../../src/data/countryRiskV2.js";
import { getCpi, CPI_LICENCE, CPI_SOURCE, CPI_YEAR } from "../../src/data/cpiData.js";
import { computeCountryRiskScore } from "../../src/data/countryRiskScore.js";
import { countryRiskSourcesAsOf } from "../../src/data/countryRiskSources.js";
import { getSanctionsRegimeCandidates } from "../../src/data/sanctionsRegimeCandidates.js";
import { getApprovedSanctions, SANCTIONS_APPROVED_SNAPSHOT } from "../../src/data/sanctionsApprovedData.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const iso2 = String(req.query.iso2 ?? "").toUpperCase();
  const methodology = String(req.query.methodology ?? "v2");
  if (methodology !== "v2" && methodology !== COUNTRY_RISK_METHODOLOGY_VERSION) {
    return res.status(400).json({ error: `Unsupported methodology: ${methodology}` });
  }
  const country = getCountryByIso2(iso2);
  if (!country) return res.status(404).json({ error: "Country not found" });
  const asOf = new Date();
  const result = computeCountryRiskV2(iso2, { asOf });
  const previous = computeCountryRiskScore(iso2);
  const assessment = getFatfAssessment(iso2);
  const fatf = getFatfStatus(iso2);
  const governance = getGovernanceDimensions(iso2);
  const sanctions = getApprovedSanctions(iso2);
  const sanctionsCandidates = getSanctionsRegimeCandidates(iso2);
  const appliedFloors = result.floors.filter((floor) => floor.applied);
  const sources = countryRiskSourcesAsOf(asOf);
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  return res.status(200).json({
    country,
    result,
    previous: { methodologyVersion: "1.0.0", score: previous.score, band: previous.band },
    change: result.score === null ? null : {
      points: Math.round((result.score - previous.score) * 10) / 10,
      explanation: appliedFloors.length
        ? `The weighted v2 score was raised by ${appliedFloors.map((floor) => `${floor.reason} (${floor.minimum})`).join(", ")}.`
        : "No regulatory floor raised the weighted v2 score; any unavailable pillar is explicitly excluded and the available weights are renormalised.",
      drivers: {
        weightedBeforeFloors: result.preFloorScore,
        floors: result.floors,
        bandAdjustment: result.bandAdjustment,
        unavailablePillars: Object.entries(result.pillars)
          .filter(([, pillar]) => pillar.coverageStatus === "unavailable")
          .map(([pillar]) => pillar),
      },
    },
    calculationContext: {
      asOf: result.asOf,
      methodologyVersion: COUNTRY_RISK_METHODOLOGY_VERSION,
      persistedScoreRunId: null,
      note: "This API response is calculated deterministically at request time. Persisted score-run IDs are emitted by the versioned score-run pipeline.",
    },
    evidence: {
      aml: {
        coverageStatus: result.pillars.aml.coverageStatus,
        sourceState: result.pillars.aml.sourceState,
        listing: fatf ?? null,
        assessment: assessment ? {
          country: assessment.country,
          methodology: assessment.methodology,
          assessmentDate: assessment.assessmentDate ?? null,
          ratingsDate: assessment.ratingsDate ?? null,
          dateSemantics: "assessmentDate and ratingsDate are the fields published in the consolidated FATF workbook; no legal adoption date is inferred.",
          effectiveness: assessment.effectiveness,
          technicalCompliance: assessment.technicalCompliance,
          technicalNotApplicable: assessment.technicalNotApplicable ?? [],
          calculatedComponents: fatfAssessmentRisk(assessment),
        } : null,
        source: {
          url: FATF_ASSESSMENT_SOURCE,
          effectiveAt: FATF_ASSESSMENT_EFFECTIVE_AT,
          retrievedAt: FATF_ASSESSMENT_RETRIEVED_AT,
          sha256: FATF_ASSESSMENT_SHA256,
        },
        listingSource: {
          url: FATF_SOURCE_URL,
          verifiedAt: FATF_VERIFIED_AT,
          sha256: FATF_LIST_SHA256,
          state: sources.find((source) => source.id === "fatf-lists")?.state ?? "unavailable",
        },
      },
      governance: {
        coverageStatus: result.pillars.governance.coverageStatus,
        sourceState: result.pillars.governance.sourceState,
        dimensions: governance ?? null,
        formula: "For each of cc, rl, rq, ge, pv and va: (100 - percentile) / 10; then equal-weight the six results.",
        source: {
          url: GOVERNANCE_SOURCE,
          vintage: GOVERNANCE_VINTAGE,
          retrievedAt: GOVERNANCE_RETRIEVED_AT,
          sha256: GOVERNANCE_SHA256,
          licence: GOVERNANCE_LICENCE,
        },
      },
      sanctions: {
        coverageStatus: result.pillars.sanctions.coverageStatus,
        sourceState: result.pillars.sanctions.sourceState,
        approvedSnapshot: SANCTIONS_APPROVED_SNAPSHOT,
        approvedPrograms: sanctions?.programs ?? [],
        catalogueCandidates: sanctionsCandidates,
        pendingCandidates: SANCTIONS_APPROVED_SNAPSHOT.coverageComplete ? [] : sanctionsCandidates,
        formula: "70% of the highest imposer score plus 30% of the mean across OFAC, UK, EU and UN; an absent programme can score zero only after complete catalogue approval.",
      },
    },
    context: {
      transparencyInternationalCpi: getCpi(iso2) ?? null,
      cpiYear: CPI_YEAR,
      cpiSource: CPI_SOURCE,
      cpiLicence: CPI_LICENCE,
      scored: false,
    },
    methodologyVersion: COUNTRY_RISK_METHODOLOGY_VERSION,
    sources,
    sanctionsEvidenceCandidates: sanctionsCandidates,
  });
}
