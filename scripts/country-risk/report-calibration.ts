/**
 * Repeatable v3.1 calibration report.
 *
 * KYC contributes public directional bands only. Basel can be supplied as an
 * official, locally saved JSON export (`--basel path.json`) with rows shaped
 * `{ iso2, score }`; without that file we report the absence explicitly and
 * never scrape or infer a competitor score.
 */
import { readFile } from "node:fs/promises";
import { buildPublicBenchmarkReport, renderPublicBenchmarkMarkdown } from "./report-public-benchmark.js";
import { pageCountries } from "../../src/data/countryView.js";
import { computeCountryRiskCurrent } from "../../src/data/countryRiskMethodology.js";

interface BaselRow { iso2: string; score: number }

function pearson(pairs: Array<[number, number]>): number | null {
  if (pairs.length < 2) return null;
  const ax = pairs.reduce((sum, [x]) => sum + x, 0) / pairs.length;
  const ay = pairs.reduce((sum, [, y]) => sum + y, 0) / pairs.length;
  const numerator = pairs.reduce((sum, [x, y]) => sum + (x - ax) * (y - ay), 0);
  const dx = Math.sqrt(pairs.reduce((sum, [x]) => sum + (x - ax) ** 2, 0));
  const dy = Math.sqrt(pairs.reduce((sum, [, y]) => sum + (y - ay) ** 2, 0));
  return dx && dy ? Math.round((numerator / (dx * dy)) * 1000) / 1000 : null;
}

export async function buildCalibrationReport(baselPath?: string) {
  const asOf = new Date();
  const countryResults = pageCountries().map((country) => ({ iso2: country.iso2, result: computeCountryRiskCurrent(country.iso2, { asOf }) }));
  const allCountries = {
    total: countryResults.length,
    status: Object.fromEntries(["complete", "provisional", "insufficient-data"].map((status) => [status, countryResults.filter(({ result }) => result.status === status).length])),
    resultKind: Object.fromEntries(["complete", "provisional", "indicative-governance-proxy"].map((kind) => [kind, countryResults.filter(({ result }) => result.resultKind === kind).length])),
    confidence: Object.fromEntries(["high", "medium", "low"].map((confidence) => [confidence, countryResults.filter(({ result }) => result.confidence === confidence).length])),
    band: Object.fromEntries(["low", "moderate", "high", "very-high"].map((band) => [band, countryResults.filter(({ result }) => result.band === band).length])),
    rankedEligible: countryResults.filter(({ result }) => result.score !== null && result.band !== null && result.resultKind !== "indicative-governance-proxy").length,
    completeRanked: countryResults.filter(({ result }) => result.score !== null && result.band !== null && result.resultKind === "complete").length,
    provisionalCompositeRanked: countryResults.filter(({ result }) => result.score !== null && result.band !== null && result.resultKind === "provisional").length,
    indicativeProxyUnranked: countryResults.filter(({ result }) => result.resultKind === "indicative-governance-proxy").length,
  };
  const thresholds = [3, 5, 7];
  const nearThreshold = (distance: number) => countryResults.filter(({ result }) => result.score !== null && thresholds.some((threshold) => {
    // Published scores use one decimal place. Compare in published precision so
    // binary floating-point artefacts do not exclude values such as 7.2 from a
    // 0.2 boundary window.
    const publishedDistance = Math.round(Math.abs(result.score! - threshold) * 10) / 10;
    return publishedDistance <= distance;
  })).length;
  const sensitivity = countryResults.map(({ result }) => result.sensitivity).filter((item) => item.scoreRange !== null);
  const kyc = buildPublicBenchmarkReport();
  let basel: { status: "not-loaded" | "loaded"; source?: string; sampleSize: number; pearson: number | null } = {
    status: "not-loaded",
    sampleSize: 0,
    pearson: null,
  };
  if (baselPath) {
    const raw = JSON.parse(await readFile(baselPath, "utf8")) as BaselRow[];
    const byIso = new Map(raw.map((row) => [row.iso2.toUpperCase(), row.score]));
    const pairs = kyc.rows.flatMap((row) => {
      const score = byIso.get(row.iso2);
      return score === undefined || row.current.score === null ? [] : [[score, row.current.score] as [number, number]];
    });
    basel = { status: "loaded", source: baselPath, sampleSize: pairs.length, pearson: pearson(pairs) };
  }
  return {
    methodologyVersion: "3.1.0",
    generatedAt: asOf.toISOString(),
    allCountries: {
      ...allCountries,
      nearThresholdCounts: { within0_1: nearThreshold(0.1), within0_2: nearThreshold(0.2), within0_3: nearThreshold(0.3) },
      sensitivity: {
        availableResults: sensitivity.length,
        meanSpan: sensitivity.length ? Math.round((sensitivity.reduce((sum, item) => sum + (item.scoreRange!.high - item.scoreRange!.low), 0) / sensitivity.length) * 10) / 10 : null,
        maxSpan: sensitivity.length ? Math.round(Math.max(...sensitivity.map((item) => item.scoreRange!.high - item.scoreRange!.low)) * 10) / 10 : null,
        maxWeightShift: sensitivity.length ? Math.max(...sensitivity.map((item) => item.maxWeightShift)) : null,
        bandCrossingCount: countryResults.filter(({ result }) => result.resultKind !== "indicative-governance-proxy" && result.sensitivity.scoreRange !== null && thresholds.some((threshold) => result.sensitivity.scoreRange!.low < threshold && result.sensitivity.scoreRange!.high >= threshold)).length,
        onePillarRangeNotApplicable: countryResults.filter(({ result }) => result.resultKind === "indicative-governance-proxy").length,
      },
    },
    kyc: {
      observedAt: kyc.observedAt,
      baselineMethodologyVersion: kyc.baselineMethodologyVersion,
      sampleSize: kyc.sampleSize,
      comparisonBasis: kyc.comparisonBasis,
      comparisonCounts: kyc.comparisonCounts,
      changedSinceObservation: kyc.changedSinceObservation.length,
    },
    basel,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const baselArg = process.argv.find((arg) => arg.startsWith("--basel="))?.slice("--basel=".length);
  const report = await buildCalibrationReport(baselArg);
  if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    process.stdout.write(`# RegActions country-risk v3.1 calibration\n\n`);
    process.stdout.write(`Generated: ${report.generatedAt}\n\n`);
    process.stdout.write(`## KnowYourCountry\n\n${renderPublicBenchmarkMarkdown(buildPublicBenchmarkReport())}\n\n`);
    process.stdout.write(`## Basel AML Index\n\nStatus: ${report.basel.status}. Sample: ${report.basel.sampleSize}. Pearson correlation: ${report.basel.pearson ?? "not calculated"}.\n`);
    if (report.basel.status === "not-loaded") process.stdout.write("Supply an official local JSON export with --basel=path.json; no public score is inferred.\n");
  }
}
