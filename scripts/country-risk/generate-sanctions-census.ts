#!/usr/bin/env npx tsx
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { COUNTRIES } from "../../src/data/countries.js";
import { SANCTIONS_IMPOSERS } from "../../src/data/sanctionsEvidence.js";
import { SANCTIONS_REGIME_CANDIDATES } from "../../src/data/sanctionsRegimeCandidates.js";

interface InventorySource {
  id: string;
  url: string;
  healthy: boolean;
  fingerprint?: string;
  inventory?: Array<Record<string, any>>;
}

const SOURCE_REPORT_PATH = process.env.COUNTRY_RISK_SOURCE_REPORT
  ?? "/tmp/country-risk-sanctions-review.json";
const CENSUS_JSON_PATH = process.env.COUNTRY_RISK_SANCTIONS_CENSUS_JSON
  ?? "/tmp/country-risk-sanctions-census.json";
const CENSUS_MARKDOWN_PATH = process.env.COUNTRY_RISK_SANCTIONS_CENSUS_MARKDOWN
  ?? "/tmp/country-risk-sanctions-census.md";
const LEGAL_EVIDENCE_PATH = process.env.COUNTRY_RISK_SANCTIONS_LEGAL_EVIDENCE_JSON
  ?? "/tmp/country-risk-sanctions-legal-evidence.json";

const sourceReport = JSON.parse(await readFile(SOURCE_REPORT_PATH, "utf8")) as {
  schemaVersion?: number;
  checkedAt: string;
  results: InventorySource[];
};
if (sourceReport.schemaVersion !== 2) throw new Error("Sanctions source-assurance schema v2 is required");
const sourceById = new Map(sourceReport.results.map((source) => [source.id, source]));
for (const id of ["ofac-programmes", "uk-regimes", "eu-resources", "un-consolidated-list"]) {
  const source = sourceById.get(id);
  if (!source?.healthy || !source.fingerprint || !source.inventory?.length) {
    throw new Error(`${id}: healthy inventory-bearing assurance result is required`);
  }
}

const ofacInventory = sourceById.get("ofac-programmes")!.inventory!;
const ukInventory = sourceById.get("uk-regimes")!.inventory!;
const euInventory = sourceById.get("eu-resources")!.inventory!;
const unInventory = sourceById.get("un-consolidated-list")!.inventory!;
const legalEvidence = JSON.parse(await readFile(LEGAL_EVIDENCE_PATH, "utf8")) as {
  schemaVersion?: number;
  catalogueFailure?: string | null;
  catalogues?: {
    unCommittees?: {
      sourceUrl: string;
      retrievedAt: string;
      sourceSha256: string;
      fingerprint: string;
      items: Array<{ label: string; url: string }>;
    } | null;
  };
};
const unCommitteeCatalogue = legalEvidence.catalogues?.unCommittees;
if (legalEvidence.schemaVersion !== 3 || legalEvidence.catalogueFailure || !unCommitteeCatalogue || unCommitteeCatalogue.items.length < 15) {
  throw new Error("A complete browser-assisted UN committee catalogue is required for the census");
}

const candidatesByImposer = Object.fromEntries(["OFAC", "UK", "EU", "UN"].map((imposer) => [
  imposer,
  SANCTIONS_REGIME_CANDIDATES.filter((candidate) => candidate.imposer === imposer),
]));

const normalizedUrl = (value: string) => value.replace(/\/$/, "");
const candidateKey = (candidate: (typeof SANCTIONS_REGIME_CANDIDATES)[number]) =>
  `${candidate.iso2}|${candidate.imposer}|${candidate.regime}`;
const candidateUrl = (candidate: (typeof SANCTIONS_REGIME_CANDIDATES)[number]) => normalizedUrl(candidate.measureEvidenceUrl);
const inventoryItems = [
  ...ofacInventory.map((item) => ({
    imposer: "OFAC" as const,
    itemKey: normalizedUrl(String(item.href)),
    label: String(item.label),
    url: normalizedUrl(String(item.href)),
    kind: String(item.kind ?? "active-programme"),
  })),
  ...ukInventory.map((item) => ({
    imposer: "UK" as const,
    itemKey: normalizedUrl(String(item.href)),
    label: String(item.label),
    url: normalizedUrl(String(item.href)),
    kind: String(item.kind ?? "unknown"),
  })),
  ...euInventory.map((item) => ({
    imposer: "EU" as const,
    itemKey: `eu-regime-${item.id}`,
    label: String(item.specification ?? `EU regime ${item.id}`),
    url: `https://sanctionsmap.eu/api/v1/regime/${item.id}?lang=en`,
    kind: item.type === 0 ? "country-regime" : "thematic-regime",
  })),
  ...unCommitteeCatalogue.items.map((item) => ({
    imposer: "UN" as const,
    itemKey: normalizedUrl(item.url),
    label: item.label,
    url: normalizedUrl(item.url),
    kind: /\/1267$/.test(item.url) ? "thematic-regime" : "country-or-situation-regime",
  })),
];

const inventoryDispositions = inventoryItems.map((item) => {
  const matches = SANCTIONS_REGIME_CANDIDATES.filter((candidate) =>
    candidate.imposer === item.imposer && candidateUrl(candidate) === normalizedUrl(item.url));
  const proposedDisposition = matches.length ? "candidate-mapped" : "proposed-exclusion";
  const rationale = matches.length
    ? "The official catalogue item has one or more regime-country decision records."
    : item.kind.includes("thematic")
      ? "The official catalogue describes a thematic regime and cannot be attributed to a country without separate legal nexus evidence."
      : "No distinct geographic candidate is proposed; the reviewer must confirm the item is regional, thematic, duplicative or an umbrella authority.";
  return {
    ...item,
    proposedDisposition,
    candidateKeys: matches.map(candidateKey).sort(),
    rationale,
    finalDisposition: null,
    reviewerNote: null,
  };
});

const supplementalOfficialCandidateUrls = new Set([
  "https://www.gov.uk/guidance/uk-arms-embargo-on-mainland-china-and-hong-kong",
]);
const candidateCoverage = SANCTIONS_REGIME_CANDIDATES.map((candidate) => {
  const itemKeys = inventoryDispositions
    .filter((item) => item.candidateKeys.includes(candidateKey(candidate)))
    .map((item) => item.itemKey);
  const supplementalOfficialMeasure = supplementalOfficialCandidateUrls.has(candidateUrl(candidate));
  return {
    candidateKey: candidateKey(candidate),
    inventoryItemKeys: itemKeys,
    supplementalOfficialMeasure,
    covered: itemKeys.length > 0 || supplementalOfficialMeasure,
  };
});

const unListTypeToCommittee = new Map<string, string>([
  ["Al-Qaida", "1267"], ["CAR", "2745"], ["DPRK", "1718"], ["DRC", "1533"],
  ["GB", "2048"], ["Haiti", "2653"], ["Iran", "1737"], ["Iraq", "1518"],
  ["Libya", "1970"], ["Somalia", "2713"], ["SouthSudan", "2206"], ["Sudan", "1591"],
  ["Taliban", "1988"], ["Yemen", "2140"],
]);
const unDesignationListReconciliation = unInventory.map((item) => {
  const listType = String(item.regimeListType);
  const committee = unListTypeToCommittee.get(listType) ?? null;
  return {
    listType,
    committee,
    matchedCommitteeItem: committee
      ? unCommitteeCatalogue.items.some((candidate) => normalizedUrl(candidate.url).endsWith(`/sanctions/${committee}`))
      : false,
  };
});

const officialEuCountryRegimes = euInventory.filter((record) => record.type === 0);
const officialEuCountryCodes = [...new Set(officialEuCountryRegimes
  .map((record) => record.country?.data?.code as string | undefined)
  .filter((code): code is string => Boolean(code)))].sort();
const candidateEuCodes = [...new Set(candidatesByImposer.EU.map((candidate) => candidate.iso2))].sort();
const officialEuWithoutCandidate = officialEuCountryCodes.filter((iso2) => !candidateEuCodes.includes(iso2));
const candidateEuWithoutOfficial = candidateEuCodes.filter((iso2) => !officialEuCountryCodes.includes(iso2));

const euLegalActCandidates = officialEuCountryCodes.map((iso2) => ({
  iso2,
  regimes: officialEuCountryRegimes.filter((record) => record.country?.data?.code === iso2).map((record) => ({
    id: record.id,
    specification: record.specification,
    adoptedBy: record.adoptedBy?.data?.title ?? null,
    expiration: record.expiration,
    amendment: record.amendment,
    legalActs: (record.legalActs?.data ?? []).map((act: Record<string, any>) => ({
      id: act.id,
      title: act.title,
      number: act.number,
      url: act.url,
      type: act.type?.data?.title ?? null,
    })),
    measures: (record.measures?.data ?? []).map((measure: Record<string, any>) => ({
      id: measure.id,
      title: measure.type?.data?.title ?? null,
      suspended: measure.suspend,
      description: measure.description,
    })),
  })),
}));

const candidateCanonical = SANCTIONS_REGIME_CANDIDATES
  .map((candidate) => `${candidate.iso2}|${candidate.imposer}|${candidate.regime}|${candidate.measureEvidenceUrl}`)
  .sort();
const candidateSetSha256 = createHash("sha256").update(candidateCanonical.join("\n")).digest("hex");
const genericEvidence = SANCTIONS_REGIME_CANDIDATES
  .filter((candidate) => candidate.measureEvidenceUrl === candidate.catalogueUrl)
  .map((candidate) => ({ iso2: candidate.iso2, imposer: candidate.imposer, regime: candidate.regime }));

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceCheckedAt: sourceReport.checkedAt,
  productionScoresChanged: false,
  candidateSetSha256,
  currentCandidateCount: SANCTIONS_REGIME_CANDIDATES.length,
  currentCandidateCountries: new Set(SANCTIONS_REGIME_CANDIDATES.map((candidate) => candidate.iso2)).size,
  expectedCoverageCells: COUNTRIES.length * SANCTIONS_IMPOSERS.length,
  sourceInventories: [
    { imposer: "OFAC", officialItems: ofacInventory.length, currentCandidates: candidatesByImposer.OFAC.length },
    { imposer: "UK", officialItems: ukInventory.length, currentCandidates: candidatesByImposer.UK.length },
    { imposer: "EU", officialItems: euInventory.length, officialCountryRegimes: officialEuCountryRegimes.length, officialCountryCodes: officialEuCountryCodes.length, currentCandidates: candidatesByImposer.EU.length },
    {
      imposer: "UN",
      officialItems: unCommitteeCatalogue.items.length,
      designationListTypes: unInventory.length,
      currentCandidates: candidatesByImposer.UN.length,
    },
  ],
  inventoryDispositions,
  candidateCoverage,
  unCommitteeCatalogue,
  unDesignationListReconciliation,
  gaps: {
    genericMeasureEvidence: genericEvidence,
    officialEuCountryCodesWithoutCandidate: officialEuWithoutCandidate,
    candidateEuCodesWithoutOfficialRegime: candidateEuWithoutOfficial,
    catalogueItemsWithoutDisposition: inventoryDispositions.filter((item) =>
      item.proposedDisposition !== "candidate-mapped" && item.proposedDisposition !== "proposed-exclusion"),
    candidatesWithoutCatalogueOrSupplementalEvidence: candidateCoverage.filter((item) => !item.covered),
    unDesignationListTypesWithoutCommittee: unDesignationListReconciliation.filter((item) => !item.matchedCommitteeItem),
  },
  euLegalActCandidates,
  sourceFingerprints: Object.fromEntries(sourceReport.results.map((source) => [source.id, source.fingerprint])),
  automatedDiscoveryGapsResolved: genericEvidence.length === 0
    && officialEuWithoutCandidate.length === 0
    && candidateEuWithoutOfficial.length === 0
    && candidateCoverage.every((item) => item.covered)
    && unDesignationListReconciliation.every((item) => item.matchedCommitteeItem),
  promotionReady: false,
  remainingGate: "Every official inventory item requires a reviewed candidate mapping or explicit exclusion, followed by four catalogue attestations.",
};

const markdown = [
  "# RegActions sanctions source census",
  "",
  `Generated: ${report.generatedAt}`,
  `Source assurance: ${report.sourceCheckedAt}`,
  `Candidate set: ${report.currentCandidateCount} records across ${report.currentCandidateCountries} countries`,
  `Expected explicit coverage: ${report.expectedCoverageCells} country-imposer cells`,
  `Automated discovery gaps resolved: ${report.automatedDiscoveryGapsResolved ? "yes" : "no"}`,
  "Promotion ready: no — independent inventory dispositions and catalogue attestations remain required",
  "",
  "## Official inventories",
  "",
  "| Imposer | Official items | Current candidates | Note |",
  "|---|---:|---:|---|",
  ...report.sourceInventories.map((source) =>
    `| ${source.imposer} | ${source.officialItems} | ${source.currentCandidates} | ${"officialCountryCodes" in source ? `${source.officialCountryCodes} distinct country codes` : "thematic and country items require disposition"} |`),
  "",
  "## Blocking gaps",
  "",
  `- Generic measure evidence: ${genericEvidence.length}`,
  `- EU official country codes without a candidate decision: ${officialEuWithoutCandidate.join(", ") || "none"}`,
  `- EU candidates without an official country-regime record: ${candidateEuWithoutOfficial.join(", ") || "none"}`,
  `- Candidates without a catalogue item or approved supplemental source: ${candidateCoverage.filter((item) => !item.covered).length}`,
  `- UN designation list types without an active committee match: ${unDesignationListReconciliation.filter((item) => !item.matchedCommitteeItem).length}`,
  "",
  "## Item-by-item disposition ledger",
  "",
  "| Imposer | Official item | Proposed disposition | Candidate decisions |",
  "|---|---|---|---:|",
  ...inventoryDispositions.map((item) =>
    `| ${item.imposer} | [${item.label}](${item.url}) | ${item.proposedDisposition} | ${item.candidateKeys.length} |`),
  "",
  "Every official inventory item must be mapped to a reviewed country candidate or an explicit thematic, inactive, duplicate or situation-related exclusion before catalogue attestation.",
  "",
].join("\n");

await writeFile(CENSUS_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(CENSUS_MARKDOWN_PATH, markdown);
console.log(JSON.stringify({
  json: CENSUS_JSON_PATH,
  markdown: CENSUS_MARKDOWN_PATH,
  promotionReady: report.promotionReady,
  automatedDiscoveryGapsResolved: report.automatedDiscoveryGapsResolved,
  currentCandidates: report.currentCandidateCount,
  inventoryItems: inventoryDispositions.length,
  proposedExclusions: inventoryDispositions.filter((item) => item.proposedDisposition === "proposed-exclusion").length,
  officialEuCountryCodes: officialEuCountryCodes.length,
  officialEuWithoutCandidate,
  genericEvidence: genericEvidence.length,
}, null, 2));
