#!/usr/bin/env npx tsx
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pageCountries } from "../../src/data/countryView.js";
import { countryRiskSourcesAsOf } from "../../src/data/countryRiskSources.js";
import { computeCountryRiskV2, COUNTRY_RISK_METHODOLOGY_VERSION } from "../../src/data/countryRiskV2.js";
import { computeCountryRiskScore } from "../../src/data/countryRiskScore.js";
import { assessCountryRiskReadiness } from "../../src/data/countryRiskReadiness.js";

const output = process.argv.find((arg) => arg.startsWith("--output="))?.split("=")[1]
  ?? "/tmp/country-risk-v2-score-run.json";
const asOf = new Date();
const sources = countryRiskSourcesAsOf(asOf);
const results = pageCountries().map((country) => {
  const current = computeCountryRiskV2(country.iso2, { asOf });
  const previous = computeCountryRiskScore(country.iso2);
  return {
    iso2: country.iso2,
    country: country.name,
    current,
    previous: {
      version: "1.0.0",
      score: previous.hasGovernance ? previous.score : null,
      band: previous.hasGovernance ? previous.band : null,
      status: previous.hasGovernance ? "rated" : "insufficient-data",
    },
  };
});
const canonical = JSON.stringify({
  methodologyVersion: COUNTRY_RISK_METHODOLOGY_VERSION,
  effectiveDate: asOf.toISOString().slice(0, 10),
  sources: sources.map(({ id, state, effectiveAt, retrievedAt, sha256 }) => ({ id, state, effectiveAt, retrievedAt, sha256 })),
  results: results.map(({ iso2, current, previous }) => ({
    iso2,
    current: { ...current, asOf: undefined },
    previous,
  })),
});
const readiness = assessCountryRiskReadiness(results.map(({ current }) => current), sources);
const report = {
  runId: createHash("sha256").update(canonical).digest("hex"),
  generatedAt: asOf.toISOString(),
  methodologyVersion: COUNTRY_RISK_METHODOLOGY_VERSION,
  readyForDefault: readiness.readyForDefault,
  readinessReasons: readiness.reasons,
  distribution: results.reduce<Record<string, number>>((counts, { current }) => {
    counts[current.status] = (counts[current.status] ?? 0) + 1;
    if (current.band) counts[`band:${current.band}`] = (counts[`band:${current.band}`] ?? 0) + 1;
    return counts;
  }, {}),
  sources,
  results,
};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote reproducible v2 run ${report.runId} to ${output}; readyForDefault=${report.readyForDefault}`);
if (process.argv.includes("--persist")) {
  const { persistCountryRiskScoreRun } = await import("./lib/scoreRunPersistence.js");
  const persisted = await persistCountryRiskScoreRun(report);
  console.log(`Persisted score run ${persisted.scoreRunId}; created=${persisted.created}; scores=${persisted.scoreCount}; evidence=${persisted.evidenceCount}`);
}
if (process.argv.includes("--require-ready") && !report.readyForDefault) process.exitCode = 1;
