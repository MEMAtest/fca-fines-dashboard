#!/usr/bin/env npx tsx
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pageCountries } from "../../src/data/countryView.js";
import { COUNTRY_RISK_SOURCES } from "../../src/data/countryRiskSources.js";
import { computeCountryRiskV2, COUNTRY_RISK_METHODOLOGY_VERSION } from "../../src/data/countryRiskV2.js";
import { computeCountryRiskScore } from "../../src/data/countryRiskScore.js";

const output = process.argv.find((arg) => arg.startsWith("--output="))?.split("=")[1]
  ?? "/tmp/country-risk-v2-score-run.json";
const results = pageCountries().map((country) => {
  const current = computeCountryRiskV2(country.iso2);
  const previous = computeCountryRiskScore(country.iso2);
  return { iso2: country.iso2, country: country.name, current, previous: { version: "1.0.0", score: previous.score, band: previous.band } };
});
const canonical = JSON.stringify({ methodologyVersion: COUNTRY_RISK_METHODOLOGY_VERSION, sources: COUNTRY_RISK_SOURCES, results });
const report = {
  runId: createHash("sha256").update(canonical).digest("hex"),
  generatedAt: new Date().toISOString(),
  methodologyVersion: COUNTRY_RISK_METHODOLOGY_VERSION,
  readyForDefault: COUNTRY_RISK_SOURCES.filter((source) => source.scored).every((source) => source.state === "current")
    && results.every(({ current }) => current.status === "complete"),
  distribution: results.reduce<Record<string, number>>((counts, { current }) => {
    counts[current.status] = (counts[current.status] ?? 0) + 1;
    if (current.band) counts[`band:${current.band}`] = (counts[`band:${current.band}`] ?? 0) + 1;
    return counts;
  }, {}),
  sources: COUNTRY_RISK_SOURCES,
  results,
};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote reproducible v2 run ${report.runId} to ${output}; readyForDefault=${report.readyForDefault}`);
if (process.argv.includes("--require-ready") && !report.readyForDefault) process.exitCode = 1;
