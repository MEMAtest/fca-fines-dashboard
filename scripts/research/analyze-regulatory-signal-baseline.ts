import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pageCountries } from "../../src/data/countryView.js";
import { buildCountryView } from "../../src/data/countryView.js";
import { REGULATOR_COVERAGE } from "../../src/data/regulatorCoverage.js";

type ActivitySignal = "frequent" | "active" | "periodic" | "low-frequency" | "no-recent-signal" | "insufficient-data";

interface LiveObservation {
  regulator: string;
  ok: boolean;
  count: number | null;
  latestDate: string | null;
  latestIngestionAt: string | null;
  latestSourceCheckAt: string | null;
  amountDisclosureRate: number | null;
  activeYears: number | null;
  actionsPerActiveYear: number | null;
  activeMonthsLast24: number | null;
  activitySignal: ActivitySignal;
}

interface CountryBaseline {
  iso2: string;
  iso3: string;
  country: string;
  region: string;
  subregion: string;
  authority_evidence_state: string;
  authority_evidence_note: string;
  external_authority_evidence_url: string;
  official_directory_authorities: number;
  official_directory_roles: string[];
  ecosystem_research_depth: string;
  configured_regulators: number;
  live_regulators: number;
  live_regulator_codes: string[];
  pipeline_regulator_codes: string[];
  internal_regulator_codes: string[];
  live_observed_records: number;
  latest_observed_action: string | null;
}

const ROOT = path.resolve("docs/research/regulatory-signal");
const AS_OF = new Date("2026-08-20T00:00:00.000Z");

function daysSince(value: string | null): number | null {
  if (!value) return null;
  return Math.max(0, Math.floor((AS_OF.getTime() - new Date(value).getTime()) / 86_400_000));
}

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? value.join(";") : value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return `${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\n")}\n`;
}

function countBy<T>(values: T[], key: (value: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const label = key(value);
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
}

async function main() {
  const baseline = JSON.parse(await readFile(path.join(ROOT, "country-regulatory-ecosystem-baseline.json"), "utf8")) as { rows: CountryBaseline[] };
  const observationPayload = JSON.parse(await readFile(path.join(ROOT, "live-regulator-observations.json"), "utf8")) as { rows: LiveObservation[] };
  const publicationDiscovery = await readFile(path.join(ROOT, "country-publication-discovery.csv"), "utf8");
  const authorityDiscovery = JSON.parse(await readFile(path.join(ROOT, "authority-publication-discovery.json"), "utf8")) as {
    rows: Array<{ iso2: string; authority: string; candidates: Array<{ url: string }> }>;
  };
  const cadence = JSON.parse(await readFile(path.join(ROOT, "authority-publication-cadence-observations.json"), "utf8")) as {
    rows: Array<{ iso2: string; authority: string; access_state: string; publication_relevance: string; provisional_cadence_signal: string; observed_month_count: number; candidate_url: string }>;
  };
  // The CSV read is intentional: it ensures the country-level discovery artifact
  // was generated before this integrator runs, while JSON retains nested evidence.
  if (!publicationDiscovery.trim()) throw new Error("country publication discovery is empty");
  const observations = new Map(observationPayload.rows.map((row) => [row.regulator, row]));

  const regulatorRows = Object.values(REGULATOR_COVERAGE)
    .filter((entry) => entry.stage === "live")
    .map((entry) => {
      const observation = observations.get(entry.code);
      const latestActionAgeDays = daysSince(observation?.latestDate ?? null);
      const freshnessState = !observation?.ok
        ? "observation-failed"
        : latestActionAgeDays === null
          ? "no-action-date"
          : latestActionAgeDays > entry.feedContract.staleAfterDays
            ? entry.automationLevel === "low_frequency" || entry.automationLevel === "sparse_source"
              ? "watch-low-frequency-beyond-contract"
              : "review-beyond-contract"
            : "within-contract";
      return {
        regulator_code: entry.code,
        regulator: entry.fullName,
        country_code: entry.countryCode,
        country: entry.country,
        source_type: entry.sourceType,
        scrape_mode: entry.scrapeMode,
        automation_level: entry.automationLevel,
        operational_confidence: entry.operationalConfidence,
        contract_cadence: entry.feedContract.cadence,
        stale_after_days: entry.feedContract.staleAfterDays,
        latest_action: observation?.latestDate ?? null,
        latest_action_age_days: latestActionAgeDays,
        freshness_state: freshnessState,
        observed_records: observation?.count ?? null,
        registry_static_records: entry.count,
        registry_count_delta: observation?.count === null || observation?.count === undefined ? null : observation.count - entry.count,
        active_years: observation?.activeYears ?? null,
        actions_per_active_year: observation?.actionsPerActiveYear ?? null,
        active_months_last_24: observation?.activeMonthsLast24 ?? null,
        enforcement_activity_signal: observation?.activitySignal ?? "insufficient-data",
        monetary_amount_disclosure_rate_pct: observation?.amountDisclosureRate ?? null,
        activity_interpretation: "Neutral publication/activity descriptor; not regulator quality or country risk.",
        amount_interpretation: "Observed monetary disclosure only; non-monetary legal regimes and source design make cross-regulator ranking unsafe.",
      };
    });

  const countryByIso2 = new Map(pageCountries().map((country) => [country.iso2, country]));
  const gapRows = baseline.rows.map((row) => {
    const country = countryByIso2.get(row.iso2);
    const view = country ? buildCountryView(country) : null;
    const fsrbs = view?.regulatory.fsrbs.map((entry) => entry.code) ?? [];
    const discoveredAuthorities = authorityDiscovery.rows.filter((entry) => entry.iso2 === row.iso2);
    const candidateUrls = [...new Set(discoveredAuthorities.flatMap((entry) => entry.candidates.map((candidate) => candidate.url)))];
    const cadenceRows = cadence.rows.filter((entry) => entry.iso2 === row.iso2);
    const datedCadenceRows = cadenceRows.filter((entry) => entry.access_state === "reachable" && entry.observed_month_count > 0);
    const coverageState = row.live_regulators > 0
      ? "live"
      : row.pipeline_regulator_codes.length > 0
        ? "official-enforcement-source-validated"
        : row.internal_regulator_codes.length > 0
          ? "internal-not-live"
          : row.authority_evidence_state === "external-risk-evidence-only"
            ? "domestic-publication-unobservable"
            : "ecosystem-mapped-no-validated-feed";
    const nextResearch = coverageState === "live"
      ? "Calibrate publication transparency and coverage confidence; preserve regulator-specific cadence contract."
      : coverageState === "official-enforcement-source-validated"
        ? "Profile archive structure, historical depth, language, stable identifiers and publication cadence before ingestion design."
        : coverageState === "domestic-publication-unobservable"
          ? "Retain an explicit unobservable/watch state; do not infer no regulator, no action or low risk."
          : "Locate official enforcement/disciplinary publication routes for each mapped sector authority; record genuine non-publication explicitly.";
    return {
      iso2: row.iso2,
      iso3: row.iso3,
      country: row.country,
      region: row.region,
      subregion: row.subregion,
      authority_evidence_state: row.authority_evidence_state,
      authority_count: row.official_directory_authorities,
      mapped_roles: row.official_directory_roles,
      ecosystem_research_depth: row.ecosystem_research_depth,
      fatf_direct_member: view?.regulatory.fatfMember ?? false,
      fsrb_membership: fsrbs,
      regactions_coverage_state: coverageState,
      live_regulators: row.live_regulator_codes,
      pipeline_regulators: row.pipeline_regulator_codes,
      live_observed_records: row.live_observed_records,
      latest_observed_action: row.latest_observed_action,
      discovered_official_publication_candidates: candidateUrls.length,
      candidate_publication_urls: candidateUrls.slice(0, 12),
      cadence_pages_observed: cadenceRows.length,
      cadence_pages_with_dates: datedCadenceRows.length,
      strong_official_publication_candidates: cadenceRows.filter((entry) => entry.publication_relevance === "strong-official-publication-candidate").length,
      plausible_official_publication_candidates: cadenceRows.filter((entry) => entry.publication_relevance === "plausible-official-publication-candidate").length,
      provisional_cadence_signals: [...new Set(cadenceRows.map((entry) => entry.provisional_cadence_signal))].sort(),
      next_research: nextResearch,
      evidence_note: row.authority_evidence_note,
      external_evidence_url: row.external_authority_evidence_url,
    };
  });

  const regionRows = [...new Set(baseline.rows.map((row) => row.region))].sort().map((region) => {
    const rows = gapRows.filter((row) => row.region === region);
    return {
      region,
      jurisdictions: rows.length,
      live_countries: rows.filter((row) => row.regactions_coverage_state === "live").length,
      validated_pipeline_countries: rows.filter((row) => row.regactions_coverage_state === "official-enforcement-source-validated").length,
      mapped_without_validated_feed: rows.filter((row) => row.regactions_coverage_state === "ecosystem-mapped-no-validated-feed").length,
      domestic_publication_unobservable: rows.filter((row) => row.regactions_coverage_state === "domestic-publication-unobservable").length,
      broad_ecosystem_evidence: rows.filter((row) => row.ecosystem_research_depth === "broad").length,
    };
  });

  const analysis = {
    asOf: AS_OF.toISOString(),
    modelBoundary: {
      recommendation: "Keep country risk v3 unchanged. Research a separate RegActions Regulatory Signal family.",
      measures: [
        "Regulator Publication Transparency — how observable and reusable an authority's official enforcement record is.",
        "RegActions Coverage Confidence — how reliably RegActions captures, verifies and refreshes that official record.",
        "Enforcement Activity Signal — neutral description of observed publication frequency/intensity, never a good/bad score.",
        "Regulatory Ecosystem Map — authority mandates and sector coverage, descriptive rather than evaluative.",
      ],
    },
    countryUniverse: {
      jurisdictions: gapRows.length,
      authorityEvidenceStates: countBy(gapRows, (row) => row.authority_evidence_state),
      ecosystemDepth: countBy(gapRows, (row) => row.ecosystem_research_depth),
      regActionsCoverageStates: countBy(gapRows, (row) => row.regactions_coverage_state),
      regionCoverage: regionRows,
    },
    liveRegulators: {
      regulators: regulatorRows.length,
      observedRecords: regulatorRows.reduce((sum, row) => sum + Number(row.observed_records ?? 0), 0),
      activitySignals: countBy(regulatorRows, (row) => row.enforcement_activity_signal),
      automationLevels: countBy(regulatorRows, (row) => row.automation_level),
      operationalConfidence: countBy(regulatorRows, (row) => row.operational_confidence),
      freshnessStates: countBy(regulatorRows, (row) => row.freshness_state),
      registryCountsDifferFromLive: regulatorRows.filter((row) => row.registry_count_delta !== 0).length,
    },
    interpretationGuards: [
      "Raw regulator count measures institutional structure, not regulatory quality.",
      "More published actions can reflect stronger transparency, higher misconduct, broader powers, or all three.",
      "Few actions can reflect low misconduct, low-frequency publication, weak enforcement, non-public decisions, or incomplete capture.",
      "Monetary disclosure rates are not comparable where authorities use non-monetary orders or omit amounts by law/design.",
      "A scraper freshness breach is RegActions operational evidence, not evidence that the regulator is ineffective.",
      "FATF status, sanctions and country-risk pillars remain treatment/risk context, not regulator-performance inputs.",
    ],
  };

  await Promise.all([
    writeFile(path.join(ROOT, "regulator-shadow-measures.csv"), toCsv(regulatorRows)),
    writeFile(path.join(ROOT, "coverage-gap-register.csv"), toCsv(gapRows)),
    writeFile(path.join(ROOT, "coverage-by-region.csv"), toCsv(regionRows)),
    writeFile(path.join(ROOT, "research-analysis.json"), `${JSON.stringify(analysis, null, 2)}\n`),
  ]);
  console.log(JSON.stringify(analysis, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
