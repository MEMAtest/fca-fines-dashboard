#!/usr/bin/env npx tsx
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

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
}
interface Manifest { version: number; approvedAt: string | null; sources: ManifestSource[] }

interface DiscoveryResult {
  fingerprintItems: string[];
  inventory: Array<Record<string, unknown>>;
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
      fingerprintItems: names,
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
      fingerprintItems: fingerprintRecords.map((record) => JSON.stringify(record)).sort(),
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
      fingerprintItems: inventory.map(({ label, href }) => `${label}|${href}`),
      inventory: inventory.map((record) => ({ ...record, kind: "active-programme" })),
    };
  }
  const byHref = new Map(links
    .filter(({ label, href }) => /sanctions:\s*guidance/i.test(label)
      && /\/government\/publications\//i.test(href))
    .map((link) => [link.href, link]));
  const inventory = [...byHref.values()].sort((a, b) => a.href.localeCompare(b.href));
  return {
    fingerprintItems: inventory.map(({ label, href }) => `${label}|${href}`),
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
  const fingerprint = createHash("sha256")
    .update(discovery.fingerprintItems.join("\n"))
    .digest("hex");
  return {
    id: source.id,
    url: source.url,
    discoveryMode: source.discoveryMode,
    retrievedAt: new Date().toISOString(),
    bytes: data.length,
    sha256,
    fingerprint,
    discoveryItems: discovery.inventory.length,
    inventory: discovery.inventory,
    changed: source.approvedFingerprint !== null && source.approvedFingerprint !== fingerprint,
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
    manifest.approvedAt = report.checkedAt;
    manifest.sources = manifest.sources.map((source) => ({ ...source, approvedFingerprint: fingerprints.get(source.id) ?? null }));
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
