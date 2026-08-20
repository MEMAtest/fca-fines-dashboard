/**
 * Produce the deterministic fallback evidence artifacts from the compiled
 * 642-authority manifest. No network access is used here: reruns are stable
 * until an approved research snapshot changes.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildRegulatorySignalEvidence } from "../../src/data/regulatorySignalExport.js";
import { REGULATORY_SIGNAL_COUNTRY_COUNT, REGULATORY_SIGNAL_GENERATED_AT, listRegulatorySignalCountries } from "../../src/data/regulatorySignal.js";

const root = path.resolve(import.meta.dirname, "../..");
const outputDir = path.join(root, "docs/research/regulatory-signal");
const methodologyVersion = "fallback-evidence-1.0.0";

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function buildCsv(): string {
  const header = ["iso2", "iso3", "country", "authority", "mandate", "evidenceLevel", "website", "accessState", "publicationUrl", "publicationCandidates", "regulatoryUpdates", "enforcementCandidates", "publicationKind", "directorySources", "directoryEvidenceUrls", "researchEffectiveAt", "retrievedAt", "researchPublicationSnapshotCheckedAt", "activitySignal", "observedWindowStart", "observedWindowEnd", "observedCount", "observedMonths", "latestObservedDate", "publicationRelevance", "publicationRouteType", "sourceHostScope", "transparencyIndex"];
  const rows: unknown[][] = [header];
  for (const country of listRegulatorySignalCountries()) {
    const evidence = buildRegulatorySignalEvidence(country.iso2)!;
    for (const authority of evidence.ecosystem.authorities) rows.push([
      evidence.country.iso2,
      evidence.country.iso3,
      evidence.country.name,
      authority.name,
      authority.mandate.map((role) => role.label).join("; "),
      authority.evidenceLevel,
      authority.website,
      authority.accessState,
      authority.publicationUrl,
      authority.publicationCandidates.map((candidate) => `${candidate.label ?? ""}|${candidate.url}`).join("; "),
      authority.regulatoryUpdates.map((candidate) => `${candidate.label ?? ""}|${candidate.url}`).join("; "),
      authority.enforcementCandidates.map((candidate) => `${candidate.label ?? ""}|${candidate.url}`).join("; "),
      authority.publicationKind,
      authority.identityProvenance.directorySources.join("; "),
      authority.identityProvenance.evidenceUrls.join("; "),
      authority.researchEffectiveAt,
      authority.retrievedAt,
      authority.researchPublicationSnapshotCheckedAt,
      authority.activity.signal,
      authority.activity.observedWindowStart,
      authority.activity.observedWindowEnd,
      authority.activity.observedCount,
      authority.activity.observedMonths.join("; "),
      authority.activity.latestObservedDate,
      authority.publicationRelevance,
      authority.publicationRouteType,
      authority.sourceHostScope,
      "",
    ]);
  }
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function buildJson() {
  const countries = listRegulatorySignalCountries().map((country) => buildRegulatorySignalEvidence(country.iso2)!);
  const authorities = countries.flatMap((country) => country.ecosystem.authorities);
  const counts = authorities.reduce<Record<string, number>>((result, authority) => {
    result[authority.evidenceLevel] = (result[authority.evidenceLevel] ?? 0) + 1;
    return result;
  }, {});
  return {
    schemaVersion: "1.0.0",
    methodologyVersion,
    status: "research-only",
    generatedAt: REGULATORY_SIGNAL_GENERATED_AT,
    totalJurisdictions: REGULATORY_SIGNAL_COUNTRY_COUNT,
    totalAuthorities: authorities.length,
    evidenceLevelCounts: counts,
    transparencyIndex: null,
    countryRiskV3: "separate",
    secondaryReporting: null,
    countries,
  };
}

async function main() {
  const json = `${JSON.stringify(buildJson(), null, 2)}\n`;
  const csv = buildCsv();
  const hashes = {
    schemaVersion: "1.0.0",
    methodologyVersion,
    generatedAt: REGULATORY_SIGNAL_GENERATED_AT,
    files: {
      "regulatory-fallback-evidence.json": createHash("sha256").update(json).digest("hex"),
      "regulatory-fallback-evidence.csv": createHash("sha256").update(csv).digest("hex"),
    },
  };
  await Promise.all([
    writeFile(path.join(outputDir, "regulatory-fallback-evidence.json"), json),
    writeFile(path.join(outputDir, "regulatory-fallback-evidence.csv"), csv),
    writeFile(path.join(outputDir, "regulatory-fallback-evidence.sha256.json"), `${JSON.stringify(hashes, null, 2)}\n`),
  ]);
  console.log(JSON.stringify({ countries: REGULATORY_SIGNAL_COUNTRY_COUNT, authorities: hashes.files, evidenceLevelCounts: buildJson().evidenceLevelCounts }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
