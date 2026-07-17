#!/usr/bin/env npx tsx
import { readFile, writeFile } from "node:fs/promises";
import { SANCTIONS_REGIME_CANDIDATES } from "../../src/data/sanctionsRegimeCandidates.js";
import {
  completeCatalogueReview,
  completeInventoryDisposition,
  decideSanctionsRecord,
  SANCTIONS_AUTOMATED_APPROVAL_MODE,
  SANCTIONS_EXTERNAL_VALIDATION_STATUS,
  type DeterministicReviewRecord,
} from "./lib/deterministicSanctionsDecision.js";
import type {
  CompletedSanctionsCatalogueReview,
  CompletedSanctionsInventoryDisposition,
} from "./lib/sanctionsReviewImport.js";

const INPUT_PATH = process.env.COUNTRY_RISK_SANCTIONS_REVIEW_JSON
  ?? "/tmp/country-risk-sanctions-taxonomy-review.json";
const OUTPUT_PATH = process.env.COUNTRY_RISK_SANCTIONS_COMPLETED_REVIEW_JSON
  ?? "/tmp/country-risk-sanctions-deterministic-review.json";

const document = JSON.parse(await readFile(INPUT_PATH, "utf8")) as {
  generatedAt: string;
  records: DeterministicReviewRecord[];
  catalogueReviews: CompletedSanctionsCatalogueReview[];
  catalogueDispositionLedger: CompletedSanctionsInventoryDisposition[];
  [key: string]: unknown;
};
if (!document.generatedAt || !Array.isArray(document.records)
  || !Array.isArray(document.catalogueReviews)
  || !Array.isArray(document.catalogueDispositionLedger)) {
  throw new Error("A complete generated sanctions review pack is required");
}
const recordByKey = new Map(document.records.map((record) => [
  `${record.iso2}|${record.imposer}|${record.regime}`,
  record,
]));
if (recordByKey.size !== SANCTIONS_REGIME_CANDIDATES.length) {
  throw new Error(`Deterministic decision input coverage mismatch: ${recordByKey.size}/${SANCTIONS_REGIME_CANDIDATES.length}`);
}
const decisions = SANCTIONS_REGIME_CANDIDATES.map((candidate) => {
  const key = `${candidate.iso2}|${candidate.imposer}|${candidate.regime}`;
  const record = recordByKey.get(key);
  if (!record) throw new Error(`${key}: generated evidence record is missing`);
  return decideSanctionsRecord(candidate, record, document.generatedAt);
});
const records = decisions.map((decision) => decision.record);
const completed = {
  ...document,
  automatedDecision: {
    mode: SANCTIONS_AUTOMATED_APPROVAL_MODE,
    externalValidation: SANCTIONS_EXTERNAL_VALIDATION_STATUS,
    generatedAt: document.generatedAt,
    failClosed: true,
    exceptionCount: 0,
    basisCounts: Object.fromEntries([...new Set(decisions.map((decision) => decision.basis))]
      .map((basis) => [basis, decisions.filter((decision) => decision.basis === basis).length])),
  },
  productionScoresChanged: false,
  scoringReady: true,
  remainingGate: null,
  summary: {
    pending: 0,
    approved: records.filter((record) => record.reviewDecision === "approved").length,
    rejected: records.filter((record) => record.reviewDecision === "rejected").length,
    situationRelatedExcluded: records.filter((record) => record.relationship === "situation-related").length,
  },
  records,
  catalogueReviews: document.catalogueReviews.map((review) =>
    completeCatalogueReview(review, document.generatedAt)),
  catalogueDispositionLedger: document.catalogueDispositionLedger.map(completeInventoryDisposition),
};
await writeFile(OUTPUT_PATH, `${JSON.stringify(completed, null, 2)}\n`);
console.log(JSON.stringify({
  output: OUTPUT_PATH,
  ...completed.automatedDecision,
  ...completed.summary,
  catalogueReviews: completed.catalogueReviews.length,
  catalogueItems: completed.catalogueDispositionLedger.length,
}, null, 2));
