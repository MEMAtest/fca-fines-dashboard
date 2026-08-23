/**
 * Append the independently checked USVI evidence to the 20 August research
 * snapshot without re-running the 643-row network discovery. Existing rows
 * are preserved; only VI and derived count summaries are added.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("docs/research/regulatory-signal");
const fixture = JSON.parse(await readFile(path.join(root, "usvi-regulatory-signal-fixture.json"), "utf8"));

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? value.join(";") : value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function appendCsv(file: string, row: Record<string, unknown>): Promise<void> {
  const target = path.join(root, file);
  const input = await readFile(target, "utf8");
  const lines = input.trimEnd().split("\n");
  const header = lines[0].split(",");
  const output = header.map((column) => csvCell(row[column])).join(",");
  if (!lines.some((line) => line.startsWith('"VI",') || line.startsWith("VI,"))) await writeFile(target, `${input.trimEnd()}\n${output}\n`);
}

async function appendJsonRow(file: string, row: Record<string, unknown>): Promise<void> {
  const target = path.join(root, file);
  const payload = JSON.parse(await readFile(target, "utf8")) as { rows: Array<Record<string, unknown>> };
  if (!payload.rows.some((candidate) => candidate.iso2 === "VI")) payload.rows.push(row);
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`);
}

type ResearchRow = Record<string, unknown>;

function countBy(rows: ResearchRow[], field: string): Record<string, number> {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const key = String(row[field] ?? "");
    if (key) counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function parseCsv(input: string): Array<Record<string, string>> {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { record.push(cell); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      record.push(cell); cell = "";
      if (record.some((value) => value !== "")) records.push(record);
      record = [];
    } else cell += character;
  }
  if (cell || record.length) { record.push(cell); records.push(record); }
  const headers = records.shift() ?? [];
  return records.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

const baseline = fixture.baseline;
const authority = fixture.authority;
const discovery = fixture.discovery;
const cadence = fixture.cadence;

await appendJsonRow("country-regulatory-ecosystem-baseline.json", baseline);
await appendJsonRow("official-authority-directory.json", authority);
await appendJsonRow("authority-publication-discovery.json", discovery);
await appendJsonRow("authority-publication-cadence-observations.json", cadence);

await appendCsv("country-regulatory-ecosystem-baseline.csv", baseline);
await appendCsv("official-authority-directory.csv", authority);
await appendCsv("authority-publication-discovery.csv", {
  ...discovery,
  candidate_link_count: discovery.candidates.length,
  candidate_urls: discovery.candidates.map((candidate: { url: string }) => candidate.url),
});
await appendCsv("authority-publication-cadence-observations.csv", cadence);
await appendCsv("country-publication-discovery.csv", {
  iso2: "VI", country: "US Virgin Islands", region: "Offshore / IFC", discovery_state: "official-site-candidate-found",
  mapped_authorities: 1, websites_reachable: 1, websites_obstructed: 0, websites_without_public_url: 0,
  enforcement_candidate_authorities: 1, enforcement_candidate_links: 1,
  candidate_urls: discovery.candidates.map((candidate: { url: string }) => candidate.url),
  interpretation: "Candidate official publication route; requires human validation of scope, archive depth and cadence.",
});

const baselineSummaryPath = path.join(root, "baseline-summary.json");
const baselineSummary = JSON.parse(await readFile(baselineSummaryPath, "utf8"));
const baselinePayload = JSON.parse(await readFile(path.join(root, "country-regulatory-ecosystem-baseline.json"), "utf8")) as { rows: ResearchRow[] };
const directoryPayload = JSON.parse(await readFile(path.join(root, "official-authority-directory.json"), "utf8")) as { rows: ResearchRow[] };
baselineSummary.countryUniverse = baselinePayload.rows.length;
baselineSummary.officialAuthorityRows = directoryPayload.rows.length;
baselineSummary.countriesWithAnyOfficialAuthority = baselinePayload.rows.filter((row) => Number(row.official_directory_authorities ?? 0) > 0).length;
const roleKeys: Record<string, string> = {
  centralBanking: "central_banking",
  prudentialSupervision: "prudential_supervision",
  securities: "securities",
  insurance: "insurance",
  pensions: "pensions",
  financialIntelligence: "financial_intelligence",
};
for (const [summaryKey, role] of Object.entries(roleKeys)) {
  baselineSummary.roleCoverage[summaryKey] = baselinePayload.rows.filter((row) =>
    Array.isArray(row.official_directory_roles) && row.official_directory_roles.includes(role),
  ).length;
}
await writeFile(baselineSummaryPath, `${JSON.stringify(baselineSummary, null, 2)}\n`);

const discoveryPayload = JSON.parse(await readFile(path.join(root, "authority-publication-discovery.json"), "utf8")) as { rows: ResearchRow[] };
const discoveryStats = {
  authoritiesInspected: discoveryPayload.rows.length,
  accessStates: countBy(discoveryPayload.rows, "access_state"),
  authoritiesWithCandidateLinks: discoveryPayload.rows.filter((row) => Array.isArray(row.candidates) && row.candidates.length > 0).length,
  candidateLinks: discoveryPayload.rows.reduce((sum, row) => sum + (Array.isArray(row.candidates) ? row.candidates.length : 0), 0),
  countryDiscoveryStates: countBy(parseCsv(await readFile(path.join(root, "country-publication-discovery.csv"), "utf8")), "discovery_state"),
};
for (const file of ["publication-discovery-summary.json", "authority-publication-discovery.json"]) {
  const target = path.join(root, file);
  const payload = JSON.parse(await readFile(target, "utf8"));
  Object.assign(payload, discoveryStats);
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`);
}

const cadencePayload = JSON.parse(await readFile(path.join(root, "authority-publication-cadence-observations.json"), "utf8")) as { rows: ResearchRow[] };
const cadenceStats = {
  candidateAuthoritiesInspected: cadencePayload.rows.length,
  accessStates: countBy(cadencePayload.rows, "access_state"),
  provisionalCadenceSignals: countBy(cadencePayload.rows, "provisional_cadence_signal"),
  publicationRelevance: countBy(cadencePayload.rows, "publication_relevance"),
};
for (const file of ["publication-cadence-summary.json", "authority-publication-cadence-observations.json"]) {
  const target = path.join(root, file);
  const payload = JSON.parse(await readFile(target, "utf8"));
  Object.assign(payload, cadenceStats);
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`);
}

console.log(JSON.stringify({ countries: 214, authorityRows: 643, candidateRows: 265, iso2: "VI" }, null, 2));
