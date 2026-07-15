#!/usr/bin/env npx tsx
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

interface ManifestSource {
  id: string;
  url: string;
  format?: "html" | "xml";
  minimumBytes: number;
  requiredText: string;
  approvedFingerprint: string | null;
}
interface Manifest { version: number; approvedAt: string | null; sources: ManifestSource[] }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST_PATH = join(ROOT, "scripts", "country-risk", "data", "sanctions-source-manifest.json");
const REPORT_PATH = process.env.COUNTRY_RISK_SOURCE_REPORT ?? "/tmp/country-risk-sanctions-review.json";

async function fetchSource(source: ManifestSource) {
  const response = await fetch(source.url, {
    headers: { "User-Agent": "RegActions-Country-Risk-Source-Assurance/2.0" },
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
  const discoveryItems = source.format === "xml"
    ? [...text.matchAll(/<UN_LIST_TYPE>([^<]+)<\/UN_LIST_TYPE>/g)]
        .map((match) => match[1].replace(/\s+/g, " ").trim())
    : (() => {
        const $ = cheerio.load(text);
        return $("a")
          .toArray()
          .flatMap((element) => {
            const label = $(element).text().replace(/\s+/g, " ").trim();
            const href = $(element).attr("href")?.trim() ?? "";
            return /sanction|regime|programme|program|restrictive measure/i.test(`${label} ${href}`)
              ? [`${label}|${href}`]
              : [];
          });
      })();
  const uniqueDiscoveryItems = [...new Set(discoveryItems)].sort();
  const fingerprint = createHash("sha256")
    .update(uniqueDiscoveryItems.join("\n"))
    .digest("hex");
  if (!discoveryItems.length) throw new Error(`${source.id}: no sanctions discovery links found`);
  return {
    id: source.id,
    url: source.url,
    retrievedAt: new Date().toISOString(),
    bytes: data.length,
    sha256,
    fingerprint,
    discoveryItems: uniqueDiscoveryItems.length,
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

  console.log(JSON.stringify(report, null, 2));
  if (results.some((result) => !result.healthy)) process.exitCode = 1;
  if (results.some((result) => "changed" in result && result.changed)) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
