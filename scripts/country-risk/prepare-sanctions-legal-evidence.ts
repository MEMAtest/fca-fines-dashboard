#!/usr/bin/env npx tsx
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import * as cheerio from "cheerio";
import type { Browser } from "playwright";
import { EU_SANCTIONS_REGIMES, EU_SANCTIONS_REGIME_SNAPSHOT } from "../../src/data/euSanctionsRegimeData.js";
import { SANCTIONS_REGIME_CANDIDATES } from "../../src/data/sanctionsRegimeCandidates.js";
import type { SanctionsMeasureType } from "../../src/data/sanctionsEvidence.js";

const OUTPUT_PATH = process.env.COUNTRY_RISK_SANCTIONS_LEGAL_EVIDENCE_JSON
  ?? "/tmp/country-risk-sanctions-legal-evidence.json";
const ALLOWED_HOSTS: Record<string, string[]> = {
  OFAC: ["ofac.treasury.gov"],
  UK: ["www.gov.uk", "gov.uk"],
  UN: ["main.un.org"],
};
let browserPromise: Promise<Browser> | null = null;

async function fetchWithBrowser(url: string): Promise<{ buffer: Buffer; finalUrl: string }> {
  browserPromise ??= import("playwright").then(({ chromium }) => chromium.launch({ headless: true }));
  const browser = await browserPromise;
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36 RegActions/2.1",
  });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForFunction(() => {
      const text = document.body?.innerText ?? "";
      const challenge = /just a moment|checking your browser|challenge-platform/i.test(text);
      return !challenge && text.replace(/\s+/g, " ").trim().length >= 1_000;
    }, undefined, { timeout: 60_000 });
    const html = await page.content();
    return { buffer: Buffer.from(html, "utf8"), finalUrl: page.url() };
  } finally {
    await context.close();
  }
}

async function discoverUnCommitteeCatalogue() {
  const sourceUrl = "https://main.un.org/securitycouncil/en/sanctions/information";
  const { buffer, finalUrl } = await fetchWithBrowser(sourceUrl);
  const $ = cheerio.load(buffer.toString("utf8"));
  const items = [...new Map($("a").toArray().flatMap((element) => {
    const href = $(element).attr("href")?.trim();
    const label = $(element).text().replace(/\s+/g, " ").trim();
    const url = href ? absoluteUrl(href, finalUrl) : null;
    return url && label && /\/sanctions\/\d+\/?$/.test(url) ? [[url.replace(/\/$/, ""), { label, url: url.replace(/\/$/, "") }] as const] : [];
  })).values()].sort((a, b) => a.url.localeCompare(b.url));
  if (items.length < 15) throw new Error(`UN committee catalogue too small (${items.length})`);
  return {
    sourceUrl: finalUrl,
    retrievedAt: new Date().toISOString(),
    sourceSha256: createHash("sha256").update(buffer).digest("hex"),
    fingerprint: createHash("sha256").update(items.map((item) => `${item.label}|${item.url}`).join("\n")).digest("hex"),
    items,
  };
}

function key(value: { iso2: string; imposer: string; regime: string }): string {
  return `${value.iso2}|${value.imposer}|${value.regime}`;
}

function absoluteUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString().replace(/^http:\/\//i, "https://");
  } catch {
    return null;
  }
}

function measureTypes(text: string): SanctionsMeasureType[] {
  const normalized = text.toLowerCase();
  const result = new Set<SanctionsMeasureType>();
  if (/asset freeze|blocked property|funds.*available/.test(normalized)) result.add("asset-freeze");
  if (/travel ban|travel restriction|restrictions on admission/.test(normalized)) result.add("travel-ban");
  if (/arms embargo|arms and related materiel|military goods/.test(normalized)) result.add("arms-embargo");
  if (/\bimport|purchase.*from/.test(normalized)) result.add("import-restriction");
  if (/\bexport|sell, supply|transfer.*to/.test(normalized)) result.add("export-restriction");
  if (/financ|capital market|securit|deposit|loan|credit|insurance|debt/.test(normalized)) result.add("financial-restriction");
  if (/services restriction|provision of services|technical assistance|brokering/.test(normalized)) result.add("services-restriction");
  if (/transport|flight|aircraft|airport|vessel|shipping|road/.test(normalized)) result.add("transport-restriction");
  if (/oil|petroleum|gas|gold|diamond|charcoal|mineral|commodity|cement|steel|wood|rubber|potash/.test(normalized)) {
    result.add("commodity-restriction");
  }
  return [...result].sort();
}

function legalLinkPriority(imposer: string, href: string, label: string): number {
  const value = `${href} ${label}`.toLowerCase();
  if (imposer === "UK" && /legislation\.gov\.uk/.test(value)) return 1;
  if (imposer === "UN" && /undocs\.org|docs\.un\.org|documents\.un\.org|resolution/.test(value)) return 1;
  if (imposer === "OFAC" && /federalregister\.gov|govinfo\.gov|ecfr\.gov|congress\.gov|executive order|public law|regulations/.test(value)) return 1;
  if (/\.gov|\.un\.org/.test(value)) return 2;
  return 9;
}

async function mapLimit<T, U>(items: T[], concurrency: number, fn: (item: T) => Promise<U>): Promise<U[]> {
  const results = new Array<U>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function prepare(candidate: (typeof SANCTIONS_REGIME_CANDIDATES)[number]) {
  const eu = candidate.imposer === "EU"
    ? EU_SANCTIONS_REGIMES.find((record) => record.apiUrl === candidate.measureEvidenceUrl)
    : undefined;
  if (eu) {
    return {
      key: key(candidate),
      iso2: candidate.iso2,
      imposer: candidate.imposer,
      regime: candidate.regime,
      sourceUrl: candidate.measureEvidenceUrl,
      sourceSha256: EU_SANCTIONS_REGIME_SNAPSHOT.sourceRawSha256,
      retrievedAt: EU_SANCTIONS_REGIME_SNAPSHOT.retrievedAt,
      pageTitle: eu.specification,
      legalStatus: eu.legalStatus,
      legalInstrumentCandidates: eu.legalActs,
      preferredLegalInstrument: eu.primaryLegalAct,
      legalEffectiveFrom: eu.primaryLegalAct?.number.match(/^(\d{2})\.(\d{2})\.(\d{4})/)
        ? eu.primaryLegalAct.number.replace(/^(\d{2})\.(\d{2})\.(\d{4}).*$/, "$3-$2-$1")
        : null,
      legalEffectiveTo: eu.expiration?.slice(0, 10) ?? null,
      sourceLastUpdated: eu.lastAmendedAt,
      evidenceLocator: `EU Sanctions Map regime ${eu.sourceId}; legal act ${eu.primaryLegalAct?.number ?? "not supplied"}; measure IDs ${eu.measures.map((measure) => measure.id).join(", ")}`,
      measures: eu.measureTypes,
      broadTradeProhibition: eu.broadTradeProhibition,
      broadFinancialProhibition: eu.broadFinancialProhibition,
      materialNonDesignationRestriction: eu.materialNonDesignationRestriction,
      warnings: eu.primaryLegalAct ? [] : ["No legal act is supplied by the official API; reviewer must add primary evidence."],
    };
  }

  const url = new URL(candidate.measureEvidenceUrl);
  if (!ALLOWED_HOSTS[candidate.imposer]?.includes(url.hostname)) {
    throw new Error(`${key(candidate)}: non-official evidence host ${url.hostname}`);
  }
  const response = await fetch(url, {
    headers: { "User-Agent": "RegActions-Sanctions-Evidence-Preparation/2.1" },
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
  });
  let buffer: Buffer;
  let finalUrl: string;
  if (response.ok) {
    buffer = Buffer.from(await response.arrayBuffer());
    finalUrl = response.url;
  } else if (candidate.imposer === "UN" && (response.status === 403 || response.status === 429)) {
    ({ buffer, finalUrl } = await fetchWithBrowser(url.toString()));
  } else {
    throw new Error(`${key(candidate)}: HTTP ${response.status} for ${url}`);
  }
  const html = buffer.toString("utf8");
  if (buffer.length < 2_000) throw new Error(`${key(candidate)}: evidence response too small (${buffer.length})`);
  if (/just a moment|captcha|access denied|challenge-platform/i.test(html)) {
    throw new Error(`${key(candidate)}: source challenge detected`);
  }
  const $ = cheerio.load(html);
  const pageTitle = $("h1").first().text().replace(/\s+/g, " ").trim()
    || $("title").text().replace(/\s+/g, " ").trim();
  const bodyText = $("main").text().replace(/\s+/g, " ").trim()
    || $("body").text().replace(/\s+/g, " ").trim();
  const legalLinks = $("a").toArray().flatMap((element) => {
    const href = $(element).attr("href")?.trim();
    const label = $(element).text().replace(/\s+/g, " ").trim();
    const absolute = href ? absoluteUrl(href, finalUrl) : null;
    if (!absolute || !label) return [];
    const priority = legalLinkPriority(candidate.imposer, absolute, label);
    return priority < 9 ? [{ id: label, title: label, number: label, url: absolute, type: "official legal source", priority }] : [];
  }).sort((a, b) => a.priority - b.priority || a.url.localeCompare(b.url));
  const uniqueLegalLinks = [...new Map(legalLinks.map((link) => [link.url, link])).values()];
  const inferredMeasures = measureTypes(bodyText);
  const designationOnly = inferredMeasures.length > 0
    && inferredMeasures.every((type) => type === "asset-freeze" || type === "travel-ban");
  const preferred = uniqueLegalLinks[0] ?? {
    id: pageTitle,
    title: pageTitle,
    number: pageTitle,
    url: finalUrl,
    type: "official programme or statutory guidance",
    priority: 8,
  };
  return {
    key: key(candidate),
    iso2: candidate.iso2,
    imposer: candidate.imposer,
    regime: candidate.regime,
    sourceUrl: finalUrl,
    sourceSha256: createHash("sha256").update(buffer).digest("hex"),
    retrievedAt: new Date().toISOString(),
    pageTitle,
    legalStatus: null,
    legalInstrumentCandidates: uniqueLegalLinks.map(({ priority: _priority, ...link }) => link),
    preferredLegalInstrument: (() => { const { priority: _priority, ...link } = preferred; return link; })(),
    legalEffectiveFrom: null,
    legalEffectiveTo: null,
    sourceLastUpdated: null,
    evidenceLocator: `${pageTitle}; official evidence page and linked legal-source inventory`,
    measures: inferredMeasures,
    broadTradeProhibition: null,
    broadFinancialProhibition: null,
    materialNonDesignationRestriction: inferredMeasures.length > 0 && !designationOnly,
    warnings: [
      "Automated measure keywords and preferred legal link are preparation aids only; a practitioner must verify scope, dates and operative provisions.",
    ],
  };
}

const unCommitteeCataloguePromise = discoverUnCommitteeCatalogue();
const settled = await mapLimit(SANCTIONS_REGIME_CANDIDATES, 6, async (candidate) => {
  try {
    return { status: "fulfilled" as const, value: await prepare(candidate) };
  } catch (error) {
    return { status: "rejected" as const, key: key(candidate), error: error instanceof Error ? error.message : String(error) };
  }
});
const failed = settled.filter((item) => item.status === "rejected");
let unCommitteeCatalogue: Awaited<ReturnType<typeof discoverUnCommitteeCatalogue>> | null = null;
let catalogueFailure: string | null = null;
try {
  unCommitteeCatalogue = await unCommitteeCataloguePromise;
} catch (error) {
  catalogueFailure = error instanceof Error ? error.message : String(error);
}
const launchedBrowser = browserPromise as Promise<Browser> | null;
if (launchedBrowser) await (await launchedBrowser).close();
const report = {
  schemaVersion: 3,
  generatedAt: new Date().toISOString(),
  productionScoresChanged: false,
  candidates: SANCTIONS_REGIME_CANDIDATES.length,
  prepared: settled.length - failed.length,
  catalogueFailure,
  catalogues: { unCommittees: unCommitteeCatalogue },
  failed,
  evidence: settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []),
};
await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  output: OUTPUT_PATH,
  candidates: report.candidates,
  prepared: report.prepared,
  failed: failed.length,
  unCommitteeItems: unCommitteeCatalogue?.items.length ?? 0,
  catalogueFailure,
  failedRecords: failed,
  productionScoresChanged: false,
}, null, 2));
if (failed.length || catalogueFailure) process.exitCode = 1;
