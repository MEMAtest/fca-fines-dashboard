#!/usr/bin/env npx tsx
import { appendFileSync, writeFileSync } from "node:fs";
import { countryRiskSourceStatus } from "../../src/data/countryRiskSources.js";
import { FATF_NEXT_PLENARY } from "../../src/data/fatfStatus.js";

const checkedAt = new Date();
const source = countryRiskSourceStatus("fatf-lists", checkedAt);

if (
  source.state !== "current" ||
  !source.retrievedAt ||
  !source.effectiveAt ||
  !source.sha256
) {
  throw new Error(
    `Live FATF verification failed and the retained evidence is not current (${source.state}).`,
  );
}

const report = {
  status: "watch",
  code: "live-page-unavailable-current-evidence-retained",
  checkedAt: checkedAt.toISOString(),
  sourceId: source.id,
  sourceUrl: source.sourceUrl,
  effectiveAt: source.effectiveAt,
  retrievedAt: source.retrievedAt,
  sha256: source.sha256,
  nextPlenary: FATF_NEXT_PLENARY,
  message: "FATF's protected live page was unavailable; the last directly verified evidence remains inside its freshness threshold.",
};

writeFileSync(
  "/tmp/country-risk-fatf-list-watch.json",
  `${JSON.stringify(report, null, 2)}\n`,
);

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  appendFileSync(
    summaryPath,
    `## FATF list watch\n\n${report.message}\n\n` +
      `Verified: ${source.retrievedAt}; evidence date: ${source.effectiveAt}; next scheduled plenary: ${FATF_NEXT_PLENARY}.\n`,
  );
}

console.warn(JSON.stringify(report));
