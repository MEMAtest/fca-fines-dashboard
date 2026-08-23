import benchmarkRaw from "../../research/country-risk-public-benchmark.json" with { type: "json" };
import { getCountryByIso2 } from "../../src/data/countries.js";
import { computeCountryRiskCurrent } from "../../src/data/countryRiskMethodology.js";
import { pageCountries } from "../../src/data/countryView.js";

type Comparison = "aligned" | "kyc-higher" | "regactions-higher" | "unavailable";
type CurrentBenchmarkResult = { score: number | null; band: string | null; status: string; confidence: string };
interface BenchmarkRow {
  iso2: string;
  kycBand: string;
  kycUrl: string;
  regActions: { score: number; band: string; status: string; confidence: string };
  comparison: Comparison;
  note: string;
}
interface BenchmarkFile {
  benchmarkVersion: string;
  baselineMethodologyVersion?: string;
  observedAt: string;
  competitor: { name: string; publicCoverageClaim: number; methodologyUrl: string; scoreAccess: string };
  rows: BenchmarkRow[];
}

export interface PublicBenchmarkReport {
  benchmarkVersion: string;
  baselineMethodologyVersion: string;
  observedAt: string;
  generatedAt: string;
  regActionsCoverage: number;
  competitorPublicCoverageClaim: number;
  unreconciledCoverageCount: number;
  sampleSize: number;
  comparisonCounts: Record<Comparison, number>;
  unavailableCount: number;
  comparisonBasis: "current-band-directional-v1";
  changedSinceObservation: Array<{
    iso2: string;
    observed: BenchmarkRow["regActions"];
    current: CurrentBenchmarkResult;
  }>;
  rows: Array<BenchmarkRow & { country: string; current: CurrentBenchmarkResult }>;
}

export function buildPublicBenchmarkReport(
  data: BenchmarkFile = benchmarkRaw as BenchmarkFile,
  asOf = new Date(),
): PublicBenchmarkReport {
  const seen = new Set<string>();
  const comparisonCounts: Record<Comparison, number> = { aligned: 0, "kyc-higher": 0, "regactions-higher": 0, unavailable: 0 };
  const changedSinceObservation: PublicBenchmarkReport["changedSinceObservation"] = [];
  const rows = data.rows.map((row) => {
    if (seen.has(row.iso2)) throw new Error(`Duplicate benchmark ISO2: ${row.iso2}`);
    seen.add(row.iso2);
    const country = getCountryByIso2(row.iso2);
    if (!country) throw new Error(`Unknown benchmark ISO2: ${row.iso2}`);
    if (!row.kycUrl.startsWith("https://www.knowyourcountry.com/")) throw new Error(`Invalid KYC URL for ${row.iso2}`);
    // Public benchmark rows are always compared with the current published
    // methodology. Historical v2 remains available only through an explicit
    // methodology selector on the country-risk APIs and evidence exports.
    const result = computeCountryRiskCurrent(row.iso2, { asOf });
    const current = {
      score: result.score,
      band: result.band,
      status: result.status,
      confidence: result.confidence,
    };
    if (JSON.stringify(current) !== JSON.stringify(row.regActions)) {
      changedSinceObservation.push({ iso2: row.iso2, observed: row.regActions, current });
    }
    // Recompute the directional comparison from today's RegActions result.
    // The stored comparison field is a historical observation and must not
    // silently survive a methodology release. KYC publishes bands rather than
    // numeric scores, so this remains directional evidence, not calibration.
    const kycOrder = row.kycBand.toLowerCase().includes("higher")
      ? 4
      : row.kycBand.toLowerCase().includes("medium-high") ? 3
        : row.kycBand.toLowerCase().includes("medium-low") ? 1 : 2;
    const regActionsOrder = result.band === "very-high" ? 4
      : result.band === "high" ? 3
        : result.band === "moderate" ? 2 : 1;
    const comparison = result.score === null || result.band === null ? "unavailable"
      : regActionsOrder === kycOrder ? "aligned"
        : regActionsOrder > kycOrder ? "regactions-higher" : "kyc-higher";
    comparisonCounts[comparison] += 1;
    return { ...row, country: country.name, comparison, current };
  });
  const regActionsCoverage = pageCountries().length;
  return {
    benchmarkVersion: data.benchmarkVersion,
    baselineMethodologyVersion: data.baselineMethodologyVersion ?? "3.0.0",
    observedAt: data.observedAt,
    generatedAt: asOf.toISOString(),
    regActionsCoverage,
    competitorPublicCoverageClaim: data.competitor.publicCoverageClaim,
    unreconciledCoverageCount: Math.max(0, data.competitor.publicCoverageClaim - regActionsCoverage),
    sampleSize: rows.length,
    comparisonCounts,
    unavailableCount: comparisonCounts.unavailable,
    comparisonBasis: "current-band-directional-v1",
    changedSinceObservation,
    rows,
  };
}

export function renderPublicBenchmarkMarkdown(report: PublicBenchmarkReport): string {
  const lines = [
    "# RegActions public country-risk benchmark",
    "",
    `Generated: ${report.generatedAt}`,
    `Observed competitor bands: ${report.observedAt}`,
    `RegActions baseline captured: ${report.baselineMethodologyVersion}`,
    "",
    `- Sample: ${report.sampleSize} jurisdictions`,
    `- RegActions public coverage: ${report.regActionsCoverage}`,
    `- Competitor public coverage claim: ${report.competitorPublicCoverageClaim}`,
    `- Coverage-count difference requiring jurisdiction reconciliation: ${report.unreconciledCoverageCount}`,
    `- Directional comparison: ${report.comparisonCounts.aligned} aligned, ${report.comparisonCounts["kyc-higher"]} KYC higher, ${report.comparisonCounts["regactions-higher"]} RegActions higher`,
    `- Unavailable current scores: ${report.unavailableCount} (included in the sample and comparison reconciliation)`,
    `- Changed RegActions records since observation: ${report.changedSinceObservation.length}`,
    "",
    "| Country | RegActions current | KYC public band | Comparison | Evidence note |",
    "|---|---:|---|---|---|",
    ...report.rows.map((row) => `| ${row.country} | ${row.current.score === null ? "Not scored" : `${row.current.score.toFixed(1)} ${row.current.band}`} (${row.current.status}/${row.current.confidence}) | [${row.kycBand}](${row.kycUrl}) | ${row.comparison} | ${row.note} |`),
    "",
    "KYC numeric scores are not public and are not inferred. Bands are directional evidence only, not calibration targets.",
  ];
  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = buildPublicBenchmarkReport();
  process.stdout.write(process.argv.includes("--json")
    ? `${JSON.stringify(report, null, 2)}\n`
    : `${renderPublicBenchmarkMarkdown(report)}\n`);
}
