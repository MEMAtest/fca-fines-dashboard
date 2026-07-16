#!/usr/bin/env npx tsx
import { writeFile } from "node:fs/promises";
import {
  SANCTIONS_CANDIDATE_COUNTRY_COUNT,
  SANCTIONS_CATALOGUE_COVERAGE,
  SANCTIONS_CATALOGUE_REVIEWED_AS_OF,
  SANCTIONS_REGIME_CANDIDATES,
  SANCTIONS_TIER_RULES,
} from "../../src/data/sanctionsRegimeCandidates.js";
import { getCountryByIso2 } from "../../src/data/countries.js";
import { SANCTIONS_APPROVED_SNAPSHOT } from "../../src/data/sanctionsApprovedData.js";

const JSON_PATH = process.env.COUNTRY_RISK_SANCTIONS_REVIEW_JSON
  ?? "/tmp/country-risk-sanctions-taxonomy-review.json";
const MARKDOWN_PATH = process.env.COUNTRY_RISK_SANCTIONS_REVIEW_MARKDOWN
  ?? "/tmp/country-risk-sanctions-taxonomy-review.md";

const pending = SANCTIONS_APPROVED_SNAPSHOT.coverageComplete
  ? []
  : SANCTIONS_REGIME_CANDIDATES.filter((candidate) => candidate.reviewStatus === "pending-independent-review");
const situationRelated = pending.filter((candidate) => candidate.relationship === "situation-related");

const report = {
  generatedAt: new Date().toISOString(),
  catalogueReviewedAsOf: SANCTIONS_CATALOGUE_REVIEWED_AS_OF,
  productionScoresChanged: false,
  scoringReady: SANCTIONS_APPROVED_SNAPSHOT.coverageComplete,
  coverage: {
    countries: SANCTIONS_CANDIDATE_COUNTRY_COUNT,
    imposerCountryRecords: SANCTIONS_REGIME_CANDIDATES.length,
    byImposer: SANCTIONS_CATALOGUE_COVERAGE.map((item) => ({
      imposer: item.imposer,
      countryRegimeCount: item.countryRegimeCount,
      catalogueUrl: item.catalogueUrl,
      excludedProgrammes: item.excludedProgrammes,
    })),
  },
  taxonomy: SANCTIONS_TIER_RULES,
  remainingGate: {
    role: "Named compliance practitioner independent of the implementation",
    decisionsRequiredPerRecord: [
      "Confirm that the official programme remains active on the effective date.",
      "Confirm whether restrictions create direct country exposure or merely relate to a situation in the named country.",
      "Confirm that the linked legal measures satisfy the proposed deterministic tier definition.",
    ],
    approvalEvidenceRequired: [
      "Reviewer name and organisation",
      "Review timestamp",
      "Decision for every imposer-country record",
      "Reason and replacement evidence URL for every amended or rejected record",
      "Approved source fingerprints from the same source-assurance run",
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
  records: SANCTIONS_REGIME_CANDIDATES.map((candidate) => ({
    ...candidate,
    country: getCountryByIso2(candidate.iso2)?.name ?? candidate.iso2,
    reviewDecision: null,
    finalTier: null,
    decisionEvidenceUrl: null,
    reviewer: null,
    reviewerOrganisation: null,
    reviewedAt: null,
    reviewNote: null,
  })),
};

const markdown = [
  "# RegActions sanctions taxonomy v2 review pack",
  "",
  `Generated: ${report.generatedAt}`,
  `Official catalogues reviewed: ${SANCTIONS_CATALOGUE_REVIEWED_AS_OF}`,
  `Coverage: ${report.coverage.countries} countries; ${report.coverage.imposerCountryRecords} imposer-country records`,
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
  "## Candidate decisions",
  "",
  "| Country | Imposer | Proposed tier | Relationship | Official evidence | Decision | Note |",
  "|---|---|---|---|---|---|---|",
  ...report.records.map((record) =>
    `| ${record.country} (${record.iso2}) | ${record.imposer} | ${record.proposedTier} | ${record.relationship} | [source](${record.measureEvidenceUrl}) | ☐ approve ☐ amend ☐ reject | |`
  ),
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
  records: report.coverage.imposerCountryRecords,
  pending: report.summary.pending,
  situationRelated: report.summary.situationRelatedRequiringNexusDecision,
}, null, 2));
