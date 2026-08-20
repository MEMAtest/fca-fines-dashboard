import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  COMPONENT_WEIGHTS,
  INDEX_ROLES,
  METHODOLOGY_VERSION,
  SHADOW_AS_OF,
  Authority,
  AuthorityMapping,
  CaseSample,
  CountryShadowResult,
  LiveObservation,
  LiveRegulator,
  QualifiedRoute,
  RegulatorShadowResult,
  SampleSnapshot,
  calculateCountryShadow,
  calculateRegulatorShadow,
  mapLiveRegulator,
  stableAuthorityId,
} from "./regulatory-transparency-shadow.js";

const ROOT = path.resolve("docs/research/regulatory-signal");
const SAMPLE_PATH = path.join(ROOT, "live-regulator-sample-snapshot.json");
const SAMPLE_LIMIT = 100;

function parseCsv(input: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift() ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
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

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(ROOT, name), "utf8")) as T;
}

async function refreshSample(codes: string[]): Promise<SampleSnapshot> {
  const rows: Record<string, CaseSample[]> = {};
  const responseTotals: Record<string, number | null> = {};
  for (const code of codes) {
    const endpoint = `https://regactions.com/api/unified/search?regulator=${encodeURIComponent(code)}&limit=${SAMPLE_LIMIT}&sortBy=date_issued&order=desc`;
    const response = await fetch(endpoint, { headers: { accept: "application/json", "user-agent": "RegActions shadow research/1.0" }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${code} sample request failed with HTTP ${response.status}`);
    const payload = await response.json() as { results?: CaseSample[]; pagination?: { total?: number } };
    rows[code] = payload.results ?? [];
    responseTotals[code] = payload.pagination?.total ?? null;
  }
  return { capturedAt: new Date().toISOString(), endpoint: "https://regactions.com/api/unified/search", limit: SAMPLE_LIMIT, rows, responseTotals };
}

function scoreRows(results: RegulatorShadowResult[]): Array<Record<string, unknown>> {
  return results.flatMap((result) => Object.entries(result.components).map(([component, value]) => ({
    regulator_code: result.regulatorCode,
    stable_regulator_id: result.stableRegulatorId,
    authority_id: result.authorityId,
    country_code: result.countryCode,
    authority: result.authority,
    role_mapping: result.roles,
    component,
    weight_pct: COMPONENT_WEIGHTS[component as keyof typeof COMPONENT_WEIGHTS],
    value: value.value,
    available: value.available,
    evidence: value.evidence,
    blocker: value.blocker,
  })));
}

function resultRows(results: RegulatorShadowResult[]): Array<Record<string, unknown>> {
  return results.map((result) => ({
    regulator_code: result.regulatorCode,
    stable_regulator_id: result.stableRegulatorId,
    authority_id: result.authorityId,
    country_code: result.countryCode,
    country: result.country,
    authority: result.authority,
    roles: result.roles,
    accessibility: result.components.accessibility.value,
    case_level_specificity: result.components.caseLevelSpecificity.value,
    source_traceability: result.components.sourceTraceability.value,
    archive_depth: result.components.archiveDepth.value,
    timeliness: result.components.timeliness.value,
    component_coverage_weight_pct: result.componentCoverageWeight,
    score: result.score,
    band: result.band,
    status: result.status,
    sample_size: result.sampleSize,
    observed_records: result.observedRecords,
    enforcement_activity_signal: result.activitySignal,
  }));
}

function countryRows(results: CountryShadowResult[]): Array<Record<string, unknown>> {
  return results.map((result) => ({
    iso2: result.iso2,
    country: result.country,
    region: result.region,
    applicable_roles: result.applicableRoles,
    assessed_roles: result.assessedRoles,
    role_scores: result.roleScores,
    role_authority_counts: result.roleAuthorityCounts,
    role_coverage_pct: result.roleCoveragePct,
    score: result.score,
    band: result.band,
    status: result.status,
    blocker: result.blocker,
  }));
}

function correlation(left: number[], right: number[]): number | null {
  if (left.length < 2 || left.length !== right.length) return null;
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const leftMean = mean(left); const rightMean = mean(right);
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0);
  const denominator = Math.sqrt(left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0) * right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0));
  return denominator === 0 ? null : Number((numerator / denominator).toFixed(6));
}

function buildBiasReport(countries: CountryShadowResult[], regulators: RegulatorShadowResult[], baseline: Array<Record<string, any>>) {
  const byIso = new Map(baseline.map((row) => [row.iso2, row]));
  // Keep the research baseline's geography labels verbatim. In particular,
  // Asia Pacific is one cohort here; inventing an Oceania bucket would make
  // that cohort appear falsely empty without an explicit geography split.
  const cohorts = [...new Set(baseline.map((row) => String(row.region || "Other")))].sort();
  const byRegion = Object.fromEntries(cohorts.map((region) => {
    const rows = countries.filter((country) => String(byIso.get(country.iso2)?.region ?? "Other") === region);
    const assessed = rows.filter((row) => row.score !== null);
    return [region, { countries: rows.length, assessed: assessed.length, mean_score: assessed.length ? Number((assessed.reduce((sum, row) => sum + row.score!, 0) / assessed.length).toFixed(4)) : null }];
  }));
  const architecture = { integrated: [] as string[], fragmented: [] as string[] };
  for (const row of baseline) {
    const authorities = Number(row.official_directory_authorities ?? 0);
    const roles = String(row.official_directory_roles ?? "").split(/[;,]/).filter(Boolean);
    const integrated = authorities > 0 && (roles.length / authorities >= 2 || authorities <= 1);
    architecture[integrated ? "integrated" : "fragmented"].push(row.iso2);
  }
  const architectureSummary = Object.fromEntries(Object.entries(architecture).map(([kind, isos]) => {
    const rows = countries.filter((row) => isos.includes(row.iso2));
    const assessed = rows.filter((row) => row.score !== null);
    return [kind, { countries: rows.length, assessed: assessed.length, mean_score: assessed.length ? Number((assessed.reduce((sum, row) => sum + row.score!, 0) / assessed.length).toFixed(4)) : null }];
  }));
  const assessedCountries = countries.filter((row) => row.score !== null).map((row) => ({ score: row.score!, volume: Number(byIso.get(row.iso2)?.live_observed_records ?? 0) }));
  return {
    methodology_version: METHODOLOGY_VERSION,
    as_of: SHADOW_AS_OF,
    purpose: "Calibration-only report. No causal or normative interpretation is permitted.",
    region_cohorts: byRegion,
    architecture_cohorts: architectureSummary,
    language_cohort: { status: "not-assessed", blocker: "The qualified live-source snapshot does not provide a source-language field for every regulator; language bias must not be inferred from country or English accessibility." },
    monetary_cohort: { status: "not-used", blocker: "Amount disclosure is descriptive and has zero weight in every component and aggregate." },
    enforcement_volume_correlation_sample_size: assessedCountries.length,
    enforcement_volume_correlation: correlation(assessedCountries.map((row) => row.score), assessedCountries.map((row) => Math.log1p(row.volume))),
    enforcement_volume_correlation_interpretation: "Descriptive diagnostic only. A non-zero association can arise through evidence availability and sample selection; it is not a score input and requires further calibration before any public release.",
    invariants: [
      "Raw observed record count and monetary values are not score inputs.",
      "Integrated and fragmented architecture use role medians and equal role means; authority count does not add weight.",
      "Unavailable components are null and excluded from the weighted denominator; they are never imputed as zero.",
      "Challenge-protected and low-frequency sources remain unavailable/watch states, not failures or low scores.",
    ],
  };
}

async function main() {
  const live = parseCsv(await readFile(path.join(ROOT, "regulator-shadow-measures.csv"), "utf8")).map((row) => ({
    ...row,
    stale_after_days: row.stale_after_days ? Number(row.stale_after_days) : null,
    latest_action_age_days: row.latest_action_age_days ? Number(row.latest_action_age_days) : null,
    observed_records: row.observed_records ? Number(row.observed_records) : null,
    active_years: row.active_years ? Number(row.active_years) : null,
  })) as LiveRegulator[];
  const observations = (await readJson<{ rows: LiveObservation[] }>("live-regulator-observations.json")).rows;
  const observationByCode = new Map(observations.map((row) => [row.regulator, row]));
  const authorities = (await readJson<{ rows: Authority[] }>("official-authority-directory.json")).rows;
  const routes = (await readJson<{ rows: QualifiedRoute[] }>("publication-qualification-ledger.json")).rows;
  const baseline = (await readJson<{ rows: Array<Record<string, any>> }>("country-regulatory-ecosystem-baseline.json")).rows;
  const existingSample = process.argv.includes("--refresh") ? null : JSON.parse(await readFile(SAMPLE_PATH, "utf8")) as SampleSnapshot | null;
  const sample = process.argv.includes("--refresh") ? await refreshSample(live.map((row) => row.regulator_code)) : existingSample;
  if (!sample) throw new Error(`Missing ${SAMPLE_PATH}; run with --refresh once to capture the fixed live feed sample.`);
  await writeFile(SAMPLE_PATH, `${JSON.stringify(sample, null, 2)}\n`);

  const mappings: AuthorityMapping[] = live.map((regulator) => mapLiveRegulator(regulator, authorities));
  const mappingByCode = new Map(mappings.map((mapping) => [mapping.regulatorCode, mapping]));
  const regulatorResults = live.map((regulator) => calculateRegulatorShadow({ regulator, observation: observationByCode.get(regulator.regulator_code), mapping: mappingByCode.get(regulator.regulator_code)!, routes, sample: sample.rows[regulator.regulator_code] ?? [] }));
  const regulatorByCountry = new Map<string, RegulatorShadowResult[]>();
  for (const result of regulatorResults) regulatorByCountry.set(result.countryCode, [...(regulatorByCountry.get(result.countryCode) ?? []), result]);
  const countries = baseline.map((row) => calculateCountryShadow({
    iso2: row.iso2,
    country: row.country,
    region: row.region,
    applicableRoles: (Array.isArray(row.official_directory_roles) ? row.official_directory_roles : String(row.official_directory_roles ?? "").split(";")).filter((role): role is typeof INDEX_ROLES[number] => (INDEX_ROLES as readonly string[]).includes(role)),
    regulators: regulatorByCountry.get(row.iso2) ?? [],
  }));
  const bias = buildBiasReport(countries, regulatorResults, baseline);
  const gaps = regulatorResults.flatMap((result) => Object.entries(result.components).filter(([, component]) => !component.available).map(([component, value]) => ({ regulator_code: result.regulatorCode, country_code: result.countryCode, authority_id: result.authorityId, component, blocker: value.blocker, evidence: value.evidence })));
  const out = {
    methodology_version: METHODOLOGY_VERSION,
    as_of: SHADOW_AS_OF,
    generated_at: SHADOW_AS_OF,
    status: "shadow-only",
    publication_guard: "No public route, UI, API or rendering is enabled by this artifact.",
    component_weights_pct: COMPONENT_WEIGHTS,
    country_thresholds: { complete_min_role_coverage_pct: 80, provisional_min_role_coverage_pct: 50, min_assessed_roles: 2 },
    summary: { regulator_count: regulatorResults.length, country_count: countries.length, regulator_complete: regulatorResults.filter((row) => row.status === "complete").length, regulator_provisional: regulatorResults.filter((row) => row.status === "provisional").length, regulator_not_assessed: regulatorResults.filter((row) => row.status === "not-assessed").length, country_complete: countries.filter((row) => row.status === "complete").length, country_provisional: countries.filter((row) => row.status === "provisional").length, country_not_assessed: countries.filter((row) => row.status === "not-assessed").length },
    regulator_results: regulatorResults,
    country_results: countries,
    counts: { regulators: regulatorResults.length, regulator_complete: regulatorResults.filter((row) => row.status === "complete").length, regulator_provisional: regulatorResults.filter((row) => row.status === "provisional").length, regulator_not_assessed: regulatorResults.filter((row) => row.status === "not-assessed").length, countries: countries.length, country_complete: countries.filter((row) => row.status === "complete").length, country_provisional: countries.filter((row) => row.status === "provisional").length, country_not_assessed: countries.filter((row) => row.status === "not-assessed").length },
    provenance: ["regulator-shadow-measures.csv", "live-regulator-observations.json", "official-authority-directory.json", "publication-qualification-ledger.json", "live-regulator-sample-snapshot.json"],
  };
  await mkdir(ROOT, { recursive: true });
  await Promise.all([
    writeFile(path.join(ROOT, "regulatory-transparency-authority-mapping.json"), `${JSON.stringify({ methodology_version: METHODOLOGY_VERSION, as_of: SHADOW_AS_OF, rows: mappings }, null, 2)}\n`),
    writeFile(path.join(ROOT, "regulatory-transparency-authority-mapping.csv"), toCsv(mappings.map((row) => ({ ...row, roles: row.roles })))),
    writeFile(path.join(ROOT, "regulatory-transparency-component-evidence.json"), `${JSON.stringify({ methodology_version: METHODOLOGY_VERSION, as_of: SHADOW_AS_OF, rows: scoreRows(regulatorResults) }, null, 2)}\n`),
    writeFile(path.join(ROOT, "regulatory-transparency-component-evidence.csv"), toCsv(scoreRows(regulatorResults))),
    writeFile(path.join(ROOT, "regulatory-transparency-regulator-results.json"), `${JSON.stringify({ methodology_version: METHODOLOGY_VERSION, as_of: SHADOW_AS_OF, status: "shadow-only", rows: regulatorResults }, null, 2)}\n`),
    writeFile(path.join(ROOT, "regulatory-transparency-regulator-results.csv"), toCsv(resultRows(regulatorResults))),
    writeFile(path.join(ROOT, "regulatory-transparency-country-results.json"), `${JSON.stringify({ methodology_version: METHODOLOGY_VERSION, as_of: SHADOW_AS_OF, status: "shadow-only", rows: countries }, null, 2)}\n`),
    writeFile(path.join(ROOT, "regulatory-transparency-country-results.csv"), toCsv(countryRows(countries))),
    writeFile(path.join(ROOT, "regulatory-transparency-bias-calibration.json"), `${JSON.stringify(bias, null, 2)}\n`),
    writeFile(path.join(ROOT, "regulatory-transparency-unresolved-gaps.csv"), toCsv(gaps)),
    writeFile(path.join(ROOT, "regulatory-transparency-shadow.json"), `${JSON.stringify(out, null, 2)}\n`),
  ]);
  const files = ["live-regulator-sample-snapshot.json", "regulatory-transparency-authority-mapping.json", "regulatory-transparency-authority-mapping.csv", "regulatory-transparency-component-evidence.json", "regulatory-transparency-component-evidence.csv", "regulatory-transparency-regulator-results.json", "regulatory-transparency-regulator-results.csv", "regulatory-transparency-country-results.json", "regulatory-transparency-country-results.csv", "regulatory-transparency-bias-calibration.json", "regulatory-transparency-unresolved-gaps.csv", "regulatory-transparency-shadow.json", "regulatory-transparency-methodology-1.0.0.md"];
  const hashes: Record<string, string> = {};
  for (const file of files) hashes[file] = createHash("sha256").update(await readFile(path.join(ROOT, file))).digest("hex");
  hashes["methodology_version"] = METHODOLOGY_VERSION;
  await writeFile(path.join(ROOT, "regulatory-transparency-shadow.sha256.json"), `${JSON.stringify(hashes, null, 2)}\n`);
  console.log(JSON.stringify(out.counts, null, 2));
  console.log(`shadow_hash=${createHash("sha256").update(JSON.stringify(hashes)).digest("hex")}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
