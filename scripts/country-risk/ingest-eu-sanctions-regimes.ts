#!/usr/bin/env npx tsx
import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SanctionsMeasureType } from "../../src/data/sanctionsEvidence.js";

interface InventorySource {
  id: string;
  healthy: boolean;
  fingerprint?: string;
  sha256?: string;
  retrievedAt?: string;
  inventory?: Array<Record<string, any>>;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUTPUT_PATH = join(ROOT, "src", "data", "euSanctionsRegimeData.ts");
const SOURCE_REPORT_PATH = process.env.COUNTRY_RISK_SOURCE_REPORT
  ?? "/tmp/country-risk-sanctions-review.json";
const SITUATION_RELATED = new Set(["GT", "MD", "TR", "UA", "US"]);

function measureTypes(title: string, description: string): SanctionsMeasureType[] {
  const text = `${title} ${description}`.toLowerCase();
  const result = new Set<SanctionsMeasureType>();
  if (/asset freeze|funds available/.test(text)) result.add("asset-freeze");
  if (/admission|travel ban|travel restriction/.test(text)) result.add("travel-ban");
  if (/arms|military cooperation/.test(text)) result.add("arms-embargo");
  if (/import|purchase|transfer .* from/.test(text)) result.add("import-restriction");
  if (/export|sell|supply|transfer .* to/.test(text)) result.add("export-restriction");
  if (/financ|capital|securit|deposit|loan|credit|insurance|claims/.test(text)) result.add("financial-restriction");
  if (/service|technical assistance|brokering/.test(text)) result.add("services-restriction");
  if (/transport|flight|aircraft|airport|vessel|shipping|road/.test(text)) result.add("transport-restriction");
  if (/oil|petroleum|gas|gold|diamond|charcoal|mineral|commodity|cement|steel|wood|rubber|potash|tobacco/.test(text)) {
    result.add("commodity-restriction");
  }
  return [...result].sort();
}

const sourceReportRaw = await readFile(SOURCE_REPORT_PATH);
const sourceReport = JSON.parse(sourceReportRaw.toString("utf8")) as {
  schemaVersion?: number;
  checkedAt: string;
  results: InventorySource[];
};
if (sourceReport.schemaVersion !== 2) throw new Error("Sanctions source-assurance schema v2 is required");
const euSource = sourceReport.results.find((source) => source.id === "eu-resources");
if (!euSource?.healthy || !euSource.fingerprint || !euSource.sha256 || !euSource.retrievedAt || !euSource.inventory?.length) {
  throw new Error("A healthy EU sanctions regime inventory is required");
}

const asOf = new Date(sourceReport.checkedAt);
const regimes = euSource.inventory.filter((record) => record.type === 0).map((record) => {
  const iso2 = record.country?.data?.code as string | undefined;
  if (!iso2 || !/^[A-Z]{2}$/.test(iso2)) throw new Error(`EU regime ${record.id}: ISO2 country code is missing`);
  const measures = (record.measures?.data ?? []).map((measure: Record<string, any>) => {
    const title = String(measure.type?.data?.title ?? "").trim();
    const description = String(measure.description ?? "").trim();
    return {
      id: Number(measure.id),
      title,
      description,
      suspended: Boolean(measure.suspend),
      types: measureTypes(title, description),
    };
  });
  const activeMeasureTypes = [...new Set(measures
    .filter((measure: { suspended: boolean }) => !measure.suspended)
    .flatMap((measure: { types: SanctionsMeasureType[] }) => measure.types))].sort();
  const designationOnly = activeMeasureTypes.every((type) => type === "asset-freeze" || type === "travel-ban");
  const expiration = typeof record.expiration === "number" ? new Date(record.expiration * 1000) : null;
  const legalStatus = expiration && expiration.getTime() <= asOf.getTime() ? "terminated" : "active";
  const legalActs = (record.legalActs?.data ?? []).map((act: Record<string, any>) => ({
    id: Number(act.id),
    title: String(act.title ?? "").trim(),
    number: String(act.number ?? "").trim(),
    url: String(act.url ?? "").replace(/^http:\/\//i, "https://"),
    type: String(act.type?.data?.title ?? "").trim(),
  }));
  const primaryLegalAct = legalActs.find((act: { type: string }) => /regulation/i.test(act.type))
    ?? legalActs.find((act: { type: string }) => /decision/i.test(act.type))
    ?? legalActs[0]
    ?? null;
  const materialNonDesignationRestriction = activeMeasureTypes.length > 0 && !designationOnly;
  return {
    sourceId: Number(record.id),
    iso2,
    country: String(record.country?.data?.title ?? iso2),
    specification: String(record.specification ?? "").trim(),
    adoptedBy: String(record.adoptedBy?.data?.title ?? "").trim(),
    programmeCodes: Array.isArray(record.programme) ? record.programme : [],
    legalStatus,
    expiration: expiration?.toISOString() ?? null,
    lastAmendedAt: typeof record.amendment === "number" ? new Date(record.amendment * 1000).toISOString() : null,
    relationship: SITUATION_RELATED.has(iso2) ? "situation-related" : "direct-country-exposure",
    measures,
    measureTypes: activeMeasureTypes,
    broadTradeProhibition: false,
    broadFinancialProhibition: false,
    materialNonDesignationRestriction,
    proposedTier: materialNonDesignationRestriction ? "sectoral" : "targeted",
    legalActs,
    primaryLegalAct,
    apiUrl: `https://sanctionsmap.eu/api/v1/regime/${record.id}?lang=en`,
  };
}).sort((a, b) => a.sourceId - b.sourceId);

if (regimes.length < 45) throw new Error(`EU sanctions country-regime coverage too small: ${regimes.length}`);
if (regimes.some((regime) => !regime.measures.length)) throw new Error("EU country-regime record without measure evidence");
const dataSha256 = createHash("sha256").update(JSON.stringify(regimes)).digest("hex");
const output = `/** GENERATED by scripts/country-risk/ingest-eu-sanctions-regimes.ts.\n * Official source: EU Sanctions Map regime API. Candidate facts must pass the versioned deterministic evidence classifier.\n */\nimport type { SanctionsMeasureType } from "./sanctionsEvidence.js";\nimport type { SanctionsRegimeRelationship } from "./sanctionsRegimeCandidates.js";\nimport type { SanctionsTier } from "./sanctionsStatus.js";\n\nexport interface EuSanctionsLegalAct {\n  id: number;\n  title: string;\n  number: string;\n  url: string;\n  type: string;\n}\n\nexport interface EuSanctionsRegimeRecord {\n  sourceId: number;\n  iso2: string;\n  country: string;\n  specification: string;\n  adoptedBy: string;\n  programmeCodes: string[];\n  legalStatus: "active" | "terminated";\n  expiration: string | null;\n  lastAmendedAt: string | null;\n  relationship: SanctionsRegimeRelationship;\n  measures: Array<{ id: number; title: string; description: string; suspended: boolean; types: SanctionsMeasureType[] }>;\n  measureTypes: SanctionsMeasureType[];\n  broadTradeProhibition: boolean;\n  broadFinancialProhibition: boolean;\n  materialNonDesignationRestriction: boolean;\n  proposedTier: SanctionsTier;\n  legalActs: EuSanctionsLegalAct[];\n  primaryLegalAct: EuSanctionsLegalAct | null;\n  apiUrl: string;\n}\n\nexport const EU_SANCTIONS_REGIME_SNAPSHOT = ${JSON.stringify({
  sourceUrl: "https://sanctionsmap.eu/api/v1/regime?lang=en",
  sourceFingerprint: euSource.fingerprint,
  sourceRawSha256: euSource.sha256,
  sourceReportSha256: createHash("sha256").update(sourceReportRaw).digest("hex"),
  retrievedAt: sourceReport.checkedAt,
  dataSha256,
  recordCount: regimes.length,
}, null, 2)} as const;\n\nexport const EU_SANCTIONS_REGIMES: EuSanctionsRegimeRecord[] = ${JSON.stringify(regimes, null, 2)};\n`;

const temporaryOutput = `${OUTPUT_PATH}.tmp`;
await writeFile(temporaryOutput, output);
await rename(temporaryOutput, OUTPUT_PATH);
console.log(JSON.stringify({
  output: OUTPUT_PATH,
  records: regimes.length,
  countries: new Set(regimes.map((regime) => regime.iso2)).size,
  situationRelated: regimes.filter((regime) => regime.relationship === "situation-related").length,
  sectoralProposals: regimes.filter((regime) => regime.proposedTier === "sectoral").length,
  targetedProposals: regimes.filter((regime) => regime.proposedTier === "targeted").length,
  dataSha256,
  productionScoresChanged: false,
}, null, 2));
