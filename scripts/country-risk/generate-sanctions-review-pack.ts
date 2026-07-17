#!/usr/bin/env npx tsx
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import {
  SANCTIONS_CANDIDATE_COUNTRY_COUNT,
  SANCTIONS_CATALOGUE_COVERAGE,
  SANCTIONS_CATALOGUE_REVIEWED_AS_OF,
  SANCTIONS_REGIME_CANDIDATES,
  SANCTIONS_TIER_RULES,
} from "../../src/data/sanctionsRegimeCandidates.js";
import { getCountryByIso2 } from "../../src/data/countries.js";
import { COUNTRIES } from "../../src/data/countries.js";
import { SANCTIONS_APPROVED_SNAPSHOT } from "../../src/data/sanctionsApprovedData.js";
import { SANCTIONS_IMPOSERS, type SanctionsLegalStatus, type SanctionsMeasureType } from "../../src/data/sanctionsEvidence.js";
import type { SanctionsSourceAssuranceReport } from "./lib/sanctionsPromotion.js";

const JSON_PATH = process.env.COUNTRY_RISK_SANCTIONS_REVIEW_JSON
  ?? "/tmp/country-risk-sanctions-taxonomy-review.json";
const MARKDOWN_PATH = process.env.COUNTRY_RISK_SANCTIONS_REVIEW_MARKDOWN
  ?? "/tmp/country-risk-sanctions-taxonomy-review.md";
const SOURCE_REPORT_PATH = process.env.COUNTRY_RISK_SOURCE_REPORT
  ?? "/tmp/country-risk-sanctions-review.json";
const CENSUS_REPORT_PATH = process.env.COUNTRY_RISK_SANCTIONS_CENSUS_JSON
  ?? "/tmp/country-risk-sanctions-census.json";
const LEGAL_EVIDENCE_PATH = process.env.COUNTRY_RISK_SANCTIONS_LEGAL_EVIDENCE_JSON
  ?? "/tmp/country-risk-sanctions-legal-evidence.json";

interface PreparedLegalEvidence {
  key: string;
  sourceUrl: string;
  sourceSha256: string | null;
  retrievedAt: string;
  pageTitle: string;
  legalStatus: SanctionsLegalStatus | null;
  preferredLegalInstrument: { id: string | number; title: string; number: string; url: string; type: string } | null;
  legalEffectiveFrom: string | null;
  legalEffectiveTo: string | null;
  sourceLastUpdated: string | null;
  evidenceLocator: string;
  measures: SanctionsMeasureType[];
  broadTradeProhibition: boolean | null;
  broadFinancialProhibition: boolean | null;
  materialNonDesignationRestriction: boolean | null;
  warnings: string[];
}

const sourceReport = JSON.parse(await readFile(SOURCE_REPORT_PATH, "utf8")) as SanctionsSourceAssuranceReport;
const censusRaw = await readFile(CENSUS_REPORT_PATH);
const census = JSON.parse(censusRaw.toString("utf8")) as {
  automatedDiscoveryGapsResolved?: boolean;
  gaps?: unknown;
  inventoryDispositions?: Array<{
    imposer: string;
    itemKey: string;
    label: string;
    url: string;
    proposedDisposition: string;
    candidateKeys: string[];
    rationale: string;
  }>;
};
if (!census.automatedDiscoveryGapsResolved || !census.inventoryDispositions?.length) {
  throw new Error("Resolve the automated sanctions census gaps before generating the final review pack");
}
const censusSha256 = createHash("sha256").update(censusRaw).digest("hex");
const legalEvidenceRaw = await readFile(LEGAL_EVIDENCE_PATH);
const legalEvidence = JSON.parse(legalEvidenceRaw.toString("utf8")) as {
  schemaVersion?: number;
  candidates?: number;
  prepared?: number;
  failed?: unknown[];
  evidence?: PreparedLegalEvidence[];
};
if (legalEvidence.schemaVersion !== 3
  || legalEvidence.candidates !== SANCTIONS_REGIME_CANDIDATES.length
  || legalEvidence.prepared !== SANCTIONS_REGIME_CANDIDATES.length
  || legalEvidence.failed?.length
  || legalEvidence.evidence?.length !== SANCTIONS_REGIME_CANDIDATES.length) {
  throw new Error("A complete sanctions legal-evidence preparation report is required");
}
const legalEvidenceByKey = new Map(legalEvidence.evidence.map((record) => [record.key, record]));
if (legalEvidenceByKey.size !== SANCTIONS_REGIME_CANDIDATES.length) {
  throw new Error("Sanctions legal-evidence preparation contains duplicate or missing records");
}
const legalEvidenceSha256 = createHash("sha256").update(legalEvidenceRaw).digest("hex");
const sourceById = new Map(sourceReport.results.map((source) => [source.id, source]));
if (sourceReport.requiresHumanReview) {
  throw new Error("Source assurance contains drift or a missing baseline and cannot be used for a review pack");
}
const sourceIdByImposer = {
  OFAC: "ofac-programmes",
  UK: "uk-regimes",
  EU: "eu-resources",
  UN: "un-consolidated-list",
} as const;
for (const sourceId of Object.values(sourceIdByImposer)) {
  const source = sourceById.get(sourceId);
  if (!source?.healthy || !source.fingerprint || !source.url) {
    throw new Error(`${sourceId}: a healthy source-assurance fingerprint is required before generating a review pack`);
  }
}

const pending = SANCTIONS_APPROVED_SNAPSHOT.coverageComplete
  ? []
  : SANCTIONS_REGIME_CANDIDATES.filter((candidate) => candidate.reviewStatus === "pending-independent-review");
const situationRelated = pending.filter((candidate) => candidate.relationship === "situation-related");

function evidenceKey(candidate: (typeof SANCTIONS_REGIME_CANDIDATES)[number]): string {
  return `${candidate.iso2}|${candidate.imposer}|${candidate.regime}`;
}

const report = {
  generatedAt: new Date().toISOString(),
  catalogueReviewedAsOf: SANCTIONS_CATALOGUE_REVIEWED_AS_OF,
  productionScoresChanged: false,
  scoringReady: SANCTIONS_APPROVED_SNAPSHOT.coverageComplete,
  coverage: {
    countries: SANCTIONS_CANDIDATE_COUNTRY_COUNT,
    regimeCountryRecords: SANCTIONS_REGIME_CANDIDATES.length,
    imposerCountryRecords: SANCTIONS_REGIME_CANDIDATES.length,
    byImposer: SANCTIONS_CATALOGUE_COVERAGE.map((item) => ({
      imposer: item.imposer,
      countryRegimeCount: item.countryRegimeCount,
      catalogueUrl: item.catalogueUrl,
      excludedProgrammes: item.excludedProgrammes,
    })),
  },
  taxonomy: SANCTIONS_TIER_RULES,
  catalogueDispositionLedger: census.inventoryDispositions,
  legalEvidencePreparation: {
    sourcePath: LEGAL_EVIDENCE_PATH,
    sha256: legalEvidenceSha256,
    candidates: legalEvidence.candidates,
    prepared: legalEvidence.prepared,
  },
  catalogueReviews: SANCTIONS_IMPOSERS.map((imposer) => {
    const sourceId = sourceIdByImposer[imposer];
    const source = sourceById.get(sourceId)!;
    const dispositions = census.inventoryDispositions!.filter((item) => item.imposer === imposer);
    return {
      imposer,
      sourceId,
      catalogueUrl: source.url!,
      sourceFingerprint: source.fingerprint!,
      censusSha256,
      officialInventoryItems: dispositions.length,
      candidateMappedItems: dispositions.filter((item) => item.proposedDisposition === "candidate-mapped").length,
      proposedExclusions: dispositions.filter((item) => item.proposedDisposition === "proposed-exclusion").length,
      reviewDecision: null,
      reviewer: null,
      reviewerOrganisation: null,
      reviewedAt: null,
      reviewNote: null,
    };
  }),
  remainingGate: {
    role: "Named compliance practitioner independent of the implementation",
    decisionsRequiredPerRecord: [
      "Confirm that the official programme remains active on the effective date.",
      "Confirm whether restrictions create direct country exposure or merely relate to a situation in the named country.",
      "Confirm that the linked legal measures satisfy the proposed deterministic tier definition.",
    ],
    catalogueDecisionsRequired: [
      "Assign a final disposition to every official catalogue item in catalogueDispositionLedger.",
      "Mapped items must remain linked to their candidate decisions; exclusions require a specific category and reviewer note.",
      "Confirm the UN active-committee catalogue is reconciled to the consolidated designation-list types, including committees with no current listed names.",
    ],
    approvalEvidenceRequired: [
      "Reviewer name and organisation",
      "Review timestamp",
      "Decision for every imposer-country record",
      "Reason and replacement evidence URL for every amended or rejected record",
      "Approved source fingerprints from the same source-assurance run",
      "Completed item-by-item catalogue disposition ledger bound to the census hash",
    ],
    promotionCondition:
      "All records approved or rejected, no unresolved situation-related nexus, four healthy approved source fingerprints, and an approved country_risk_reviews audit record for every score-affecting change.",
  },
  summary: {
    pending: pending.length,
    situationRelatedRequiringNexusDecision: situationRelated.length,
    approved: SANCTIONS_REGIME_CANDIDATES.filter((candidate) => candidate.reviewStatus === "approved").length,
    rejected: SANCTIONS_REGIME_CANDIDATES.filter((candidate) => candidate.reviewStatus === "rejected").length,
  },
  records: SANCTIONS_REGIME_CANDIDATES.map((candidate) => {
    const evidence = legalEvidenceByKey.get(evidenceKey(candidate));
    if (!evidence) throw new Error(`${evidenceKey(candidate)}: prepared legal evidence is missing`);
    return {
      ...candidate,
      country: getCountryByIso2(candidate.iso2)?.name ?? candidate.iso2,
      reviewDecision: null,
      finalTier: null,
      coverageState: null,
      legalStatus: evidence.legalStatus,
      legalInstrumentId: evidence.preferredLegalInstrument?.number ?? null,
      legalInstrumentUrl: evidence.preferredLegalInstrument?.url ?? null,
      officialGuidanceUrl: evidence.sourceUrl,
      legalEffectiveFrom: evidence.legalEffectiveFrom,
      legalEffectiveTo: evidence.legalEffectiveTo,
      sourceLastUpdated: evidence.sourceLastUpdated,
      evidenceLocator: evidence.evidenceLocator,
      measures: evidence.measures,
      broadTradeProhibition: evidence.broadTradeProhibition,
      broadFinancialProhibition: evidence.broadFinancialProhibition,
      materialNonDesignationRestriction: evidence.materialNonDesignationRestriction,
      preparedBy: null,
      preparedAt: null,
      decisionEvidenceUrl: evidence.preferredLegalInstrument?.url ?? evidence.sourceUrl,
      reviewer: null,
      reviewerOrganisation: null,
      reviewedAt: null,
      reviewNote: null,
      preparationEvidence: {
        sourceSha256: evidence.sourceSha256,
        retrievedAt: evidence.retrievedAt,
        pageTitle: evidence.pageTitle,
        warnings: evidence.warnings,
      },
    };
  }),
  coveragePreview: COUNTRIES.flatMap((country) => SANCTIONS_IMPOSERS.map((imposer) => {
    const matching = SANCTIONS_REGIME_CANDIDATES.filter((candidate) => candidate.iso2 === country.iso2 && candidate.imposer === imposer);
    return {
      iso2: country.iso2,
      country: country.name,
      imposer,
      proposedState: matching.some((candidate) => candidate.relationship === "direct-country-exposure")
        ? "active-direct"
        : matching.some((candidate) => candidate.relationship === "situation-related")
          ? "active-situation-related"
          : "no-direct-regime",
      candidateCount: matching.length,
      finalState: null,
    };
  })),
};

const markdown = [
  "# RegActions sanctions taxonomy v2 review pack",
  "",
  `Generated: ${report.generatedAt}`,
  `Official catalogues reviewed: ${SANCTIONS_CATALOGUE_REVIEWED_AS_OF}`,
  `Coverage: ${report.coverage.countries} countries; ${report.coverage.regimeCountryRecords} regime-country records`,
  `Scoring ready: ${report.scoringReady ? "yes" : "no"}`,
  "",
  "## Reviewer attestation",
  "",
  "Reviewer name: ____________________",
  "Organisation / role: ____________________",
  "Review completed at: ____________________",
  "",
  "I confirm that I reviewed each active regime against the linked official legal-measure evidence, applied the published tier definitions consistently, and resolved every situation-related nexus before approving score use.",
  "",
  "Signature / recorded approval reference: ____________________",
  "",
  "## Deterministic taxonomy",
  "",
  ...Object.entries(SANCTIONS_TIER_RULES).map(([tier, definition]) => `- **${tier}** — ${definition}`),
  "",
  "## Catalogue completeness attestations",
  "",
  "A zero is permitted only after the reviewer approves the complete official catalogue fingerprint for each imposer.",
  "",
  "| Imposer | Source fingerprint | Items | Mapped | Proposed exclusions | Complete? |",
  "|---|---|---:|---:|---:|---|",
  ...report.catalogueReviews.map((review) => `| ${review.imposer} | \`${review.sourceFingerprint}\` | ${review.officialInventoryItems} | ${review.candidateMappedItems} | ${review.proposedExclusions} | ☐ approve ☐ reject |`),
  "",
  "Each approval covers the complete item-by-item disposition ledger embedded in the JSON pack and bound by the census SHA-256.",
  "",
  "## Candidate decisions",
  "",
  "| Country | Imposer | Proposed tier | Relationship | Starting evidence | Legal act required | Decision |",
  "|---|---|---|---|---|---|---|",
  ...report.records.map((record) =>
    `| ${record.country} (${record.iso2}) | ${record.imposer} | ${record.proposedTier} | ${record.relationship} | [source](${record.measureEvidenceUrl}) | ID, URL, dates, measures and locator | ☐ approve ☐ amend ☐ reject |`
  ),
  "",
  "## Explicit negative coverage",
  "",
  `The completed snapshot will materialise ${report.coveragePreview.length} country-imposer cells. Cells without a reviewed direct regime become no-direct-regime only from the four approved catalogue attestations.`,
  "",
  "## Promotion gate",
  "",
  report.remainingGate.promotionCondition,
  "",
].join("\n");

await writeFile(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(MARKDOWN_PATH, markdown);

console.log(JSON.stringify({
  json: JSON_PATH,
  markdown: MARKDOWN_PATH,
  scoringReady: report.scoringReady,
  countries: report.coverage.countries,
  records: report.coverage.regimeCountryRecords,
  pending: report.summary.pending,
  situationRelated: report.summary.situationRelatedRequiringNexusDecision,
  catalogueAttestations: report.catalogueReviews.length,
  censusSha256,
  legalEvidenceSha256,
  coverageCells: report.coveragePreview.length,
}, null, 2));
