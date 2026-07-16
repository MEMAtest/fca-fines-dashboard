#!/usr/bin/env npx tsx
import { writeFile } from "node:fs/promises";
import { pageCountries } from "../../src/data/countryView.js";
import { computeCountryRiskV2, COUNTRY_RISK_PILLAR_WEIGHTS } from "../../src/data/countryRiskV2.js";
import { getCpi } from "../../src/data/cpiData.js";

const output = process.argv.find((arg) => arg.startsWith("--output="))?.split("=")[1]
  ?? "/tmp/country-risk-v2-validation.json";
const asOf = new Date();
const base = pageCountries().map((country) => ({ country, result: computeCountryRiskV2(country.iso2, { asOf }) }));
const scenarios = Object.entries(COUNTRY_RISK_PILLAR_WEIGHTS).flatMap(([pillar, weight]) => [-0.2, 0.2].map((delta) => ({
  name: `${pillar}${delta > 0 ? "+20%" : "-20%"}`,
  weights: { ...COUNTRY_RISK_PILLAR_WEIGHTS, [pillar]: weight * (1 + delta) },
})));
const sensitivity = scenarios.map((scenario) => {
  const changed = base.flatMap(({ country, result }) => {
    const alternative = computeCountryRiskV2(country.iso2, { pillarWeights: scenario.weights, asOf });
    return result.band !== alternative.band ? [{ iso2: country.iso2, from: result.band, to: alternative.band }] : [];
  });
  return { scenario: scenario.name, bandChanges: changed.length, countries: changed };
});
const cpiComparisons = base.filter(({ result, country }) => result.score !== null && getCpi(country.iso2));
const correlation = (() => {
  if (cpiComparisons.length < 2) return null;
  const xs = cpiComparisons.map(({ result }) => result.score as number);
  const ys = cpiComparisons.map(({ country }) => 100 - (getCpi(country.iso2)?.score ?? 0));
  const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const numerator = xs.reduce((sum, value, index) => sum + (value - xMean) * (ys[index] - yMean), 0);
  const denominator = Math.sqrt(
    xs.reduce((sum, value) => sum + (value - xMean) ** 2, 0)
      * ys.reduce((sum, value) => sum + (value - yMean) ** 2, 0),
  );
  return denominator ? Math.round((numerator / denominator) * 1000) / 1000 : null;
})();
const report = {
  generatedAt: asOf.toISOString(),
  summary: {
    countries: base.length,
    complete: base.filter(({ result }) => result.status === "complete").length,
    provisional: base.filter(({ result }) => result.status === "provisional").length,
    insufficientData: base.filter(({ result }) => result.status === "insufficient-data").length,
    cpiDirectionComparisons: cpiComparisons.length,
    cpiRiskDirectionCorrelation: correlation,
  },
  sensitivity,
  backtest: {
    status: "not-run",
    reason: "Historical point-in-time FATF assessments and WGI snapshots are required; current listings must not leak into historical scores.",
  },
};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary));
console.log(`Wrote validation evidence to ${output}`);
