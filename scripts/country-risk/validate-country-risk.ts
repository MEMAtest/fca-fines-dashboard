#!/usr/bin/env npx tsx
import { writeFile } from "node:fs/promises";
import { pageCountries } from "../../src/data/countryView.js";
import { computeCountryRiskV2, COUNTRY_RISK_PILLAR_WEIGHTS, governancePillarRisk } from "../../src/data/countryRiskV2.js";
import { getCpi } from "../../src/data/cpiData.js";
import { FATF_CHANGE_LOG } from "../../src/data/fatfStatus.js";
import { getGovernanceDimensions, GOVERNANCE_VINTAGE } from "../../src/data/governanceData.js";

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
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
// A deliberately narrow, non-leaking back-test: only WGI 2024 governance risk
// is used to test direction before later FATF additions. Current FATF status,
// current FATF ratings and sanctions are excluded from the historical input.
const additionEvents = [...new Map(
  FATF_CHANGE_LOG
    .filter((change) => change.change === "added" && change.date > `${GOVERNANCE_VINTAGE}-12-31`)
    .map((change) => [change.iso2, change]),
).values()];
const governanceUniverse = pageCountries().flatMap((country) => {
  const score = governancePillarRisk(getGovernanceDimensions(country.iso2)).score;
  return score === null ? [] : [{ iso2: country.iso2, score }];
});
const eventSet = new Set(additionEvents.map((event) => event.iso2));
const comparators = governanceUniverse.filter((item) => !eventSet.has(item.iso2));
const comparatorScores = comparators.map((item) => item.score);
const eventScores = additionEvents.flatMap((event) => {
  const score = governancePillarRisk(getGovernanceDimensions(event.iso2)).score;
  return score === null ? [] : [{ ...event, governanceRisk: score }];
});
const comparatorMedian = median(comparatorScores);
const backtestEvents = eventScores.map((event) => ({
  ...event,
  higherRiskPercentile: Math.round(
    (comparators.filter((item) => item.score <= event.governanceRisk).length / comparators.length) * 1000,
  ) / 10,
  aboveComparatorMedian: event.governanceRisk > comparatorMedian,
}));
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
    status: "completed-limited",
    design: `WGI ${GOVERNANCE_VINTAGE} governance-only risk compared with jurisdictions added to FATF increased monitoring after ${GOVERNANCE_VINTAGE}; current listing, assessment and sanctions inputs are excluded.`,
    eventCount: backtestEvents.length,
    comparatorCount: comparators.length,
    eventMeanGovernanceRisk: Math.round(mean(eventScores.map((event) => event.governanceRisk)) * 100) / 100,
    comparatorMeanGovernanceRisk: Math.round(mean(comparatorScores) * 100) / 100,
    comparatorMedianGovernanceRisk: comparatorMedian,
    proportionAboveComparatorMedian: Math.round(
      (backtestEvents.filter((event) => event.aboveComparatorMedian).length / backtestEvents.length) * 1000,
    ) / 1000,
    events: backtestEvents,
    limitation: "Exploratory direction test with a small event sample; it is not causal validation and independent quantitative review remains a separately disclosed assurance step.",
  },
};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary));
console.log(`Wrote validation evidence to ${output}`);
