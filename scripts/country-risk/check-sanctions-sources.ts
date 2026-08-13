#!/usr/bin/env npx tsx
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { classifySanctionsCatalogueChange } from "./lib/sanctionsCatalogueChange.js";

type DiscoveryMode = "ofac-programmes" | "uk-country-regimes" | "eu-regime-api" | "un-list-types";

interface ManifestSource {
  id: string;
  url: string;
  format?: "html" | "xml" | "json";
  discoveryMode: DiscoveryMode;
  minimumBytes: number;
  minimumRecords: number;
  requiredText: string;
  approvedFingerprint: string | null;
  approvedScoringFingerprint?: string | null;
  approvedCoverageFingerprint?: string | null;
}
interface Manifest { version: number; approvedAt: string | null; sources: ManifestSource[] }

interface DiscoveryResult {
  /** Country-regime identity used to distinguish thematic-only catalogue drift. */
  coverageFingerprintItems: string[];
  /** Scoring-relevant country-regime evidence: coverage, expiry and measures. */
  scoringFingerprintItems: string[];
  /** Complete official catalogue, retained for audit even when not scored. */
  catalogueFingerprintItems: string[];
  inventory: Array<Record<string, unknown>>;
}

function euMeasureTypes(title: string, description: string): string[] {
  const text = `${title} ${description}`.toLowerCase();
  const result = new Set<string>();
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST_PATH = join(ROOT, "scripts", "country-risk", "data", "sanctions-source-manifest.json");
const REPORT_PATH = process.env.COUNTRY_RISK_SOURCE_REPORT ?? "/tmp/country-risk-sanctions-review.json";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function absoluteUrl(href: string, base: string): string {
  return new URL(href, base).toString();
}

function htmlLinks(text: string, baseUrl: string): Array<{ label: string; href: string }> {
  const $ = cheerio.load(text);
  return $("a").toArray().flatMap((element) => {
    const label = $(element).text().replace(/\s+/g, " ").trim();
    const href = $(element).attr("href")?.trim();
    return label && href ? [{ label, href: absoluteUrl(href, baseUrl) }] : [];
  });
}

function extractDiscovery(source: ManifestSource, text: string): DiscoveryResult {
  if (source.discoveryMode === "un-list-types") {
    const names = [...new Set([...text.matchAll(/<UN_LIST_TYPE>([^<]+)<\/UN_LIST_TYPE>/g)]
      .map((match) => match[1].replace(/\s+/g, " ").trim()))].sort();
    return {
      coverageFingerprintItems: names,
      scoringFingerprintItems: names,
      catalogueFingerprintItems: names,
      inventory: names.map((name) => ({ regimeListType: name })),
    };
  }
  if (source.discoveryMode === "eu-regime-api") {
    const parsed = JSON.parse(text) as { data?: Array<Record<string, unknown>> };
    const records = parsed.data ?? [];
    const fingerprintRecords = records.map((record) => canonical({
      id: record.id,
      type: record.type,
      specification: record.specification,
      expiration: record.expiration,
      amendment: record.amendment,
      programme: record.programme,
      underConstruction: record.under_construction,
      adoptedBy: record.adopted_by,
      country: record.country,
      legalActs: record.legal_acts,
      measures: record.measures,
    }));
    return {
      coverageFingerprintItems: fingerprintRecords
        .filter((record: any) => record.type === 0 && /^[A-Z]{2}$/.test(String(record.country?.data?.code ?? "")))
        .map((record: any) => JSON.stringify({ id: record.id, iso2: record.country.data.code })).sort(),
      // The score engine consumes only country regimes (type 0) with an ISO
      // country. Legal status and classified measure types can affect a tier,
      // so they are deliberately inside the score-evidence fingerprint. Full
      // catalogue additions remain visible below without blocking a score.
      scoringFingerprintItems: records
        .filter((record: any) => record.type === 0 && /^[A-Z]{2}$/.test(String(record.country?.data?.code ?? "")))
        .map((record: any) => canonical({
          id: record.id,
          iso2: record.country.data.code,
          expiration: typeof record.expiration === "number" ? new Date(record.expiration * 1000).toISOString() : null,
          measures: (record.measures?.data ?? []).map((measure: any) => ({
            id: Number(measure.id),
            suspended: Boolean(measure.suspend),
            types: euMeasureTypes(String(measure.type?.data?.title ?? ""), String(measure.description ?? "")),
          })).sort((a: any, b: any) => a.id - b.id),
        }))
        .map((record) => JSON.stringify(record)).sort(),
      catalogueFingerprintItems: fingerprintRecords.map((record) => JSON.stringify(record)).sort(),
      inventory: records.map((record) => ({
        id: record.id,
        type: record.type,
        specification: record.specification,
        expiration: record.expiration,
        amendment: record.amendment,
        programme: record.programme,
        adoptedBy: record.adopted_by,
        country: record.country,
        legalActs: record.legal_acts,
        measures: record.measures,
      })),
    };
  }
  const links = htmlLinks(text, source.url);
  if (source.discoveryMode === "ofac-programmes") {
    const byHref = new Map(links
      .filter(({ href }) => /\/sanctions-programs-and-country-information\/[^/?#]+/i.test(href))
      .filter(({ label }) => !/where is ofac|list of country-related|archive/i.test(label))
      .map((link) => [link.href, link]));
    const inventory = [...byHref.values()].sort((a, b) => a.href.localeCompare(b.href));
    return {
      coverageFingerprintItems: inventory.map(({ label, href }) => `${label}|${href}`),
      scoringFingerprintItems: inventory.map(({ label, href }) => `${label}|${href}`),
      catalogueFingerprintItems: inventory.map(({ label, href }) => `${label}|${href}`),
      inventory: inventory.map((record) => ({ ...record, kind: "active-programme" })),
    };
  }
  const byHref = new Map(links
    .filter(({ label, href }) => /sanctions:\s*guidance/i.test(label)
      && /\/government\/publications\//i.test(href))
    .map((link) => [link.href, link]));
  const inventory = [...byHref.values()].sort((a, b) => a.href.localeCompare(b.href));
  return {
    coverageFingerprintItems: inventory.map(({ label, href }) => `${label}|${href}`),
    scoringFingerprintItems: inventory.map(({ label, href }) => `${label}|${href}`),
    catalogueFingerprintItems: inventory.map(({ label, href }) => `${label}|${href}`),
    inventory: inventory.map((record) => ({
      ...record,
      kind: /chemical|terror|cyber|global|drilling/i.test(record.label) ? "thematic-candidate" : "country-candidate",
    })),
  };
}

async function fetchSource(source: ManifestSource) {
  const response = await fetch(source.url, {
    headers: { "User-Agent": "RegActions-Country-Risk-Source-Assurance/2.1" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`${source.id}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  const text = data.toString("utf8");
  if (data.length < source.minimumBytes) throw new Error(`${source.id}: response too small (${data.length} bytes)`);
  if (/just a moment|captcha|access denied|challenge-platform/i.test(text)) {
    throw new Error(`${source.id}: source challenge detected`);
  }
  if (!text.toLowerCase().includes(source.requiredText.toLowerCase())) {
    throw new Error(`${source.id}: required marker not found`);
  }
  const sha256 = createHash("sha256").update(data).digest("hex");
  const discovery = extractDiscovery(source, text);
  if (discovery.inventory.length < source.minimumRecords) {
    throw new Error(`${source.id}: discovery corpus too small (${discovery.inventory.length} < ${source.minimumRecords})`);
  }
  const coverageFingerprint = createHash("sha256")
    .update(discovery.coverageFingerprintItems.join("\n"))
    .digest("hex");
  const scoringFingerprint = createHash("sha256")
    .update(discovery.scoringFingerprintItems.join("\n"))
    .digest("hex");
  const catalogueFingerprint = createHash("sha256")
    .update(discovery.catalogueFingerprintItems.join("\n"))
    .digest("hex");
  const change = classifySanctionsCatalogueChange(source, {
    catalogueFingerprint,
    coverageFingerprint,
    scoringFingerprint,
  });
  return {
    id: source.id,
    url: source.url,
    discoveryMode: source.discoveryMode,
    retrievedAt: new Date().toISOString(),
    bytes: data.length,
    sha256,
    // Keep `fingerprint` as the complete official catalogue fingerprint. It
    // binds the legal-evidence and promotion ledger to exactly what was read.
    fingerprint: catalogueFingerprint,
    catalogueFingerprint,
    coverageFingerprint,
    scoringFingerprint,
    discoveryItems: discovery.inventory.length,
    inventory: discovery.inventory,
    // `changed` is deliberately score-affecting only. A thematic catalogue
    // addition is retained below as `catalogueChanged`, but must not put the
    // country-score snapshot into review.
    changed: change.scoreEvidenceChanged || change.coverageChanged,
    coverageChanged: change.coverageChanged,
    catalogueChanged: change.catalogueChanged,
    baselineMissing: source.approvedFingerprint === null,
  };
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as Manifest;
  const settled = await Promise.allSettled(manifest.sources.map(fetchSource));
  const results = settled.map((item, index) => item.status === "fulfilled"
    ? { ...item.value, healthy: true }
    : { id: manifest.sources[index].id, url: manifest.sources[index].url, healthy: false, error: String(item.reason) });
  const report = {
    schemaVersion: 2,
    checkedAt: new Date().toISOString(),
    productionScoresChanged: false,
    requiresHumanReview: results.some((result) => !result.healthy || ("changed" in result && result.changed) || ("baselineMissing" in result && result.baselineMissing)),
    results,
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  if (process.argv.includes("--approve-baseline")) {
    const failed = results.filter((result) => !result.healthy);
    if (failed.length) throw new Error(`Cannot approve: ${failed.map((result) => result.id).join(", ")}`);
    const fingerprints = new Map(results.map((result) => [result.id, "fingerprint" in result ? result.fingerprint : null]));
    const scoringFingerprints = new Map(results.map((result) => [result.id, "scoringFingerprint" in result ? result.scoringFingerprint : null]));
    const coverageFingerprints = new Map(results.map((result) => [result.id, "coverageFingerprint" in result ? result.coverageFingerprint : null]));
    manifest.approvedAt = report.checkedAt;
    manifest.sources = manifest.sources.map((source) => ({
      ...source,
      approvedFingerprint: fingerprints.get(source.id) ?? null,
      approvedScoringFingerprint: scoringFingerprints.get(source.id) ?? null,
      approvedCoverageFingerprint: coverageFingerprints.get(source.id) ?? null,
    }));
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  console.log(JSON.stringify({
    ...report,
    results: report.results.map((result) => "inventory" in result ? { ...result, inventory: undefined } : result),
  }, null, 2));
  if (results.some((result) => !result.healthy)) process.exitCode = 1;
  if (!process.argv.includes("--approve-baseline") && results.some((result) => "changed" in result && result.changed)) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
