import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildCountryRiskContext, listCountryRiskContexts } from "../../src/data/countryRiskContext.js";

const ROOT = path.resolve("docs/research/country-risk-context");

function cell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function main() {
  const contexts = listCountryRiskContexts();
  const rows = contexts.flatMap((context) => context.factors.map((factor) => ({
    iso2: context.country.iso2,
    country: context.country.name,
    region: context.country.region,
    factor: factor.factor,
    label: factor.label,
    availability: factor.availability,
    scored: factor.scored,
    value_kind: factor.value?.kind ?? null,
    value_label: factor.value?.label ?? null,
    value_raw: factor.value?.raw ?? null,
    source_provider: factor.source?.provider ?? null,
    source_url: factor.source?.url ?? null,
    licence: factor.source?.licence ?? null,
    effective_at: factor.source?.effectiveAt ?? null,
    retrieved_at: factor.source?.retrievedAt ?? null,
    source_candidates: factor.sourceCandidates.map((source) => `${source.provider}|${source.url}|${source.reviewStatus}`),
    limitation: factor.limitation,
  })));
  const headers = Object.keys(rows[0] ?? {});
  const csv = `${headers.join(",")}\n${rows.map((row) => headers.map((header) => cell(row[header as keyof typeof row])).join(",")).join("\n")}\n`;
  const summary = {
    schemaVersion: contexts[0]?.schemaVersion ?? "1.0.0",
    asOf: contexts[0]?.asOf ?? null,
    status: "research-only",
    publicationGuard: "Context evidence is not imported into headline country-risk scoring.",
    countries: contexts.length,
    factorsPerCountry: contexts[0]?.factors.length ?? 0,
    evidenceRows: rows.length,
    availableByFactor: Object.fromEntries([...new Set(rows.map((row) => row.factor))].map((factor) => [factor, rows.filter((row) => row.factor === factor && row.availability === "available").length])),
    unavailableByFactor: Object.fromEntries([...new Set(rows.map((row) => row.factor))].map((factor) => [factor, rows.filter((row) => row.factor === factor && row.availability === "unavailable").length])),
    sources: [...new Set(rows.map((row) => row.source_url).filter(Boolean))],
    candidateSources: [...new Set(contexts.flatMap((context) => context.factors.flatMap((factor) => factor.sourceCandidates.map((source) => source.url))))],
    limitations: ["Unavailable threat datasets are not represented by zeros or inferred country findings.", "The available signals are descriptive context only and do not change the v3 headline score."],
  };
  await mkdir(ROOT, { recursive: true });
  await writeFile(path.join(ROOT, "country-risk-context.json"), `${JSON.stringify({ summary, rows }, null, 2)}\n`);
  await writeFile(path.join(ROOT, "country-risk-context.csv"), csv);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
