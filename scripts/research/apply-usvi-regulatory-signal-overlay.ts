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
baselineSummary.countryUniverse += 1;
baselineSummary.officialAuthorityRows += 1;
baselineSummary.countriesWithAnyOfficialAuthority += 1;
for (const role of ["prudentialSupervision", "securities", "insurance"]) baselineSummary.roleCoverage[role] += 1;
await writeFile(baselineSummaryPath, `${JSON.stringify(baselineSummary, null, 2)}\n`);

for (const file of ["publication-discovery-summary.json", "authority-publication-discovery.json"]) {
  const target = path.join(root, file);
  const payload = JSON.parse(await readFile(target, "utf8"));
  if (payload.authoritiesInspected !== undefined) payload.authoritiesInspected += 1;
  if (payload.accessStates?.reachable !== undefined) payload.accessStates.reachable += 1;
  if (payload.authoritiesWithCandidateLinks !== undefined) payload.authoritiesWithCandidateLinks += 1;
  if (payload.candidateLinks !== undefined) payload.candidateLinks += 1;
  if (payload.countryDiscoveryStates?.["official-site-candidate-found"] !== undefined) payload.countryDiscoveryStates["official-site-candidate-found"] += 1;
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`);
}

for (const file of ["publication-cadence-summary.json", "authority-publication-cadence-observations.json"]) {
  const target = path.join(root, file);
  const payload = JSON.parse(await readFile(target, "utf8"));
  if (payload.candidateAuthoritiesInspected !== undefined) payload.candidateAuthoritiesInspected += 1;
  if (payload.accessStates?.reachable !== undefined) payload.accessStates.reachable += 1;
  if (payload.provisionalCadenceSignals?.["no-dated-first-page-signal"] !== undefined) payload.provisionalCadenceSignals["no-dated-first-page-signal"] += 1;
  if (payload.publicationRelevance?.["generic-or-ambiguous-link"] !== undefined) payload.publicationRelevance["generic-or-ambiguous-link"] += 1;
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`);
}

console.log(JSON.stringify({ countries: 214, authorityRows: 643, candidateRows: 265, iso2: "VI" }, null, 2));
