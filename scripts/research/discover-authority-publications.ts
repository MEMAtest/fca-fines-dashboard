import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";

interface Authority {
  iso2: string;
  country: string;
  authority: string;
  website: string | null;
  roles: string[];
  directory_sources: string[];
  evidence_urls: string[];
}

interface BaselineCountry {
  iso2: string;
  country: string;
  region: string;
  live_regulator_codes: string[];
  pipeline_regulator_codes: string[];
  internal_regulator_codes: string[];
  authority_evidence_state: string;
}

const ROOT = path.resolve("docs/research/regulatory-signal");
const KEYWORDS = [
  "enforcement", "sanction", "penalt", "fine", "disciplin", "decision", "notice", "administrative action",
  "sancion", "multa", "resolucion", "infraccion", "procedimiento sancionador",
  "sanction", "amende", "decision", "mesure administrative", "commission des sanctions",
  "sancao", "sanções", "multa", "decisao", "processo sancionador",
  "sanzion", "provvediment", "ammenda", "decisioni",
  "sanktion", "bussgeld", "bußgeld", "massnahme", "maßnahme", "verfugung", "verfügung",
  "boete", "maatregel", "besluit", "handhaving",
  "yaptirim", "yaptırım", "ceza", "idari para",
  "sanksi", "denda", "putusan", "penguatkuasaan",
  "处罚", "處罰", "行政处罚", "制裁", "处分", "處分",
  "제재", "처분", "과징금", "과태료",
  "処分", "行政処分", "課徴金",
  "санкц", "штраф", "решени",
  "عقوبات", "غرامة", "جزاءات", "قرارات",
] as const;
const KEYWORD_PATTERN = new RegExp(KEYWORDS.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
const CHALLENGE_PATTERN = /just a moment|checking your browser|verify you are human|access denied|captcha|cloudflare|incapsula|request unsuccessful/i;

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? value.join(";") : value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return `${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\n")}\n`;
}

function countBy<T>(values: T[], key: (value: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const label = key(value);
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
}

function safeUrl(value: string, base: string): string | null {
  try {
    const url = new URL(value, base);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

async function inspect(authority: Authority) {
  if (!authority.website) {
    return { ...authority, access_state: "no-public-website", http_status: null, final_url: null, title: null, candidates: [] as Array<{ label: string; url: string }>, error: null };
  }
  try {
    const response = await fetch(authority.website, {
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; RegActions regulatory ecosystem research/1.0; +https://regactions.com)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    const html = (await response.text()).slice(0, 3_000_000);
    const challenged = CHALLENGE_PATTERN.test(html.slice(0, 20_000));
    const accessState = challenged
      ? "challenge-protected"
      : response.ok
        ? "reachable"
        : response.status === 401 || response.status === 403
          ? "access-blocked"
          : "http-error";
    const $ = load(html);
    const candidates = new Map<string, { label: string; url: string }>();
    $("a[href]").each((_, element) => {
      const label = $(element).text().replace(/\s+/g, " ").trim();
      const href = $(element).attr("href") ?? "";
      const combined = `${label} ${href}`;
      if (!KEYWORD_PATTERN.test(combined)) return;
      const resolved = safeUrl(href, response.url || authority.website!);
      if (!resolved) return;
      candidates.set(resolved, { label: label || href, url: resolved });
    });
    return {
      ...authority,
      access_state: accessState,
      http_status: response.status,
      final_url: response.url || authority.website,
      title: $("title").first().text().replace(/\s+/g, " ").trim() || null,
      candidates: [...candidates.values()].slice(0, 20),
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...authority,
      access_state: /timeout|aborted/i.test(message) ? "timeout" : "network-error",
      http_status: null,
      final_url: authority.website,
      title: null,
      candidates: [] as Array<{ label: string; url: string }>,
      error: message,
    };
  }
}

async function mapLimit<T, R>(values: T[], limit: number, fn: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await fn(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

async function main() {
  const directory = JSON.parse(await readFile(path.join(ROOT, "official-authority-directory.json"), "utf8")) as { rows: Authority[] };
  const baseline = JSON.parse(await readFile(path.join(ROOT, "country-regulatory-ecosystem-baseline.json"), "utf8")) as { rows: BaselineCountry[] };
  const unique = new Map<string, Authority>();
  for (const authority of directory.rows) {
    const key = `${authority.iso2}|${authority.website ?? authority.authority}`;
    if (!unique.has(key)) unique.set(key, authority);
  }
  const results = await mapLimit([...unique.values()], 20, inspect);
  const countryRows = baseline.rows.map((country) => {
    const authorities = results.filter((row) => row.iso2 === country.iso2);
    const candidates = authorities.flatMap((row) => row.candidates.map((candidate) => ({ authority: row.authority, ...candidate })));
    const reachable = authorities.filter((row) => row.access_state === "reachable");
    const obstructed = authorities.filter((row) => ["challenge-protected", "access-blocked", "timeout", "network-error"].includes(row.access_state));
    const discoveryState = country.live_regulator_codes.length > 0
      ? "live-regactions-coverage"
      : country.pipeline_regulator_codes.length > 0
        ? "validated-regactions-pipeline"
        : candidates.length > 0
          ? "official-site-candidate-found"
          : reachable.length > 0
            ? "official-site-reachable-no-root-link"
            : obstructed.length > 0
              ? "official-site-access-obstructed"
              : "no-public-site-evidence";
    return {
      iso2: country.iso2,
      country: country.country,
      region: country.region,
      discovery_state: discoveryState,
      mapped_authorities: authorities.length,
      websites_reachable: reachable.length,
      websites_obstructed: obstructed.length,
      websites_without_public_url: authorities.filter((row) => row.access_state === "no-public-website").length,
      enforcement_candidate_authorities: new Set(candidates.map((candidate) => candidate.authority)).size,
      enforcement_candidate_links: candidates.length,
      candidate_urls: candidates.slice(0, 12).map((candidate) => candidate.url),
      interpretation: candidates.length > 0
        ? "Candidate official publication route; requires human validation of scope, archive depth and cadence."
        : "No root-page candidate is not evidence that enforcement is absent; deeper/manual research remains required.",
    };
  });
  const summary = {
    generatedAt: new Date().toISOString(),
    authoritiesInspected: results.length,
    accessStates: countBy(results, (row) => row.access_state),
    authoritiesWithCandidateLinks: results.filter((row) => row.candidates.length > 0).length,
    candidateLinks: results.reduce((sum, row) => sum + row.candidates.length, 0),
    countryDiscoveryStates: countBy(countryRows, (row) => row.discovery_state),
  };
  const flat = results.map((row) => ({
    iso2: row.iso2,
    country: row.country,
    authority: row.authority,
    roles: row.roles,
    website: row.website,
    access_state: row.access_state,
    http_status: row.http_status,
    final_url: row.final_url,
    title: row.title,
    candidate_link_count: row.candidates.length,
    candidate_urls: row.candidates.map((candidate) => candidate.url),
    error: row.error,
  }));
  await Promise.all([
    writeFile(path.join(ROOT, "authority-publication-discovery.json"), `${JSON.stringify({ ...summary, rows: results }, null, 2)}\n`),
    writeFile(path.join(ROOT, "authority-publication-discovery.csv"), toCsv(flat)),
    writeFile(path.join(ROOT, "country-publication-discovery.csv"), toCsv(countryRows)),
    writeFile(path.join(ROOT, "publication-discovery-summary.json"), `${JSON.stringify(summary, null, 2)}\n`),
  ]);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
