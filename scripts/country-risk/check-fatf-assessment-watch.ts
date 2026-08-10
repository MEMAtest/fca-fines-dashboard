#!/usr/bin/env npx tsx
import { appendFileSync, writeFileSync } from "node:fs";
import { countryRiskSourceStatus } from "../../src/data/countryRiskSources.js";
import { FATF_ASSESSMENT_RECORDS } from "../../src/data/fatfAssessmentData.js";

const checkedAt = new Date();
const source = countryRiskSourceStatus("fatf-assessments", checkedAt);
const recordCount = Object.keys(FATF_ASSESSMENT_RECORDS).length;

if (
  source.state !== "current" ||
  !source.retrievedAt ||
  !source.effectiveAt ||
  !source.sha256 ||
  recordCount < 100
) {
  throw new Error(
    `Live FATF workbook ingestion failed and the retained evidence is not current and complete (${source.state}, ${recordCount} records).`,
  );
}

const report = {
  status: "watch",
  code: "live-workbooks-unavailable-current-evidence-retained",
  checkedAt: checkedAt.toISOString(),
  sourceId: source.id,
  sourceUrl: source.sourceUrl,
  effectiveAt: source.effectiveAt,
  retrievedAt: source.retrievedAt,
  sha256: source.sha256,
  recordCount,
  message:
    "FATF's protected consolidated-rating workbooks were unavailable; the last schema-validated evidence remains inside its 45-day freshness threshold.",
};

writeFileSync(
  "/tmp/country-risk-fatf-assessment-watch.json",
  `${JSON.stringify(report, null, 2)}\n`,
);

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  appendFileSync(
    summaryPath,
    `## FATF assessment workbook watch\n\n${report.message}\n\n` +
      `Verified: ${source.retrievedAt}; evidence date: ${source.effectiveAt}; retained records: ${recordCount}.\n`,
  );
}

console.warn(JSON.stringify(report));
