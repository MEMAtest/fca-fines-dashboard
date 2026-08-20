import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";

interface Candidate { label: string; url: string }
interface DiscoveryRow {
  iso2: string;
  country: string;
  authority: string;
  roles: string[];
  access_state: string;
  candidates: Candidate[];
}

const ROOT = path.resolve("docs/research/regulatory-signal");
const AS_OF = new Date("2026-08-20T00:00:00.000Z");
const STRONG = /enforcement|sanction|penalt|disciplin|sancion|sanção|sanções|sanzion|sanktion|bußgeld|bussgeld|handhaving|yaptırım|yaptirim|sanksi|处罚|處罰|制裁|제재|処分|санкц|عقوبات|غرامة/i;
const CHALLENGE = /just a moment|checking your browser|verify you are human|access denied|captcha|cloudflare|incapsula/i;
const MONTHS: Record<string, number> = {
  january: 1, janvier: 1, enero: 1, janeiro: 1, januar: 1, gennaio: 1,
  february: 2, fevrier: 2, febrero: 2, fevereiro: 2, februar: 2, febbraio: 2,
  march: 3, mars: 3, marzo: 3, marco: 3, marz: 3, märz: 3,
  april: 4, avril: 4, abril: 4, aprile: 4,
  may: 5, mai: 5, mayo: 5, maio: 5, maggio: 5,
  june: 6, juin: 6, junio: 6, junho: 6, juni: 6, giugno: 6,
  july: 7, juillet: 7, julio: 7, julho: 7, juli: 7, luglio: 7,
  august: 8, aout: 8, août: 8, agosto: 8,
  september: 9, septembre: 9, septiembre: 9, setembro: 9, settembre: 9,
  october: 10, octobre: 10, octubre: 10, outubro: 10, oktober: 10, ottobre: 10,
  november: 11, novembre: 11, noviembre: 11, novembro: 11,
  december: 12, decembre: 12, décembre: 12, diciembre: 12, dezembro: 12, dezember: 12, dicembre: 12,
};

function normalise(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function observedMonths(html: string): string[] {
  const $ = load(html);
  const evidence = [
    ...$("time[datetime]").toArray().map((element) => $(element).attr("datetime") ?? ""),
    ...$("article, li, tr, .date, .news, .publication, .result, .item").toArray().slice(0, 800).map((element) => $(element).text()),
  ].join(" ").replace(/\s+/g, " ");
  const months = new Set<string>();
  for (const match of evidence.matchAll(/\b(20(?:2[4-6]))[-/.](0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b/g)) {
    months.add(`${match[1]}-${String(Number(match[2])).padStart(2, "0")}`);
  }
  const words = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
  const wordPattern = new RegExp(`(?:\\b(?:[0-3]?\\d)\\s+)?(${words})\\s*,?\\s+(20(?:2[4-6]))\\b|\\b(${words})\\s+(?:[0-3]?\\d,?\\s+)?(20(?:2[4-6]))\\b`, "gi");
  for (const match of evidence.matchAll(wordPattern)) {
    const monthWord = normalise(match[1] ?? match[3] ?? "");
    const month = MONTHS[monthWord];
    const year = match[2] ?? match[4];
    if (month && year) months.add(`${year}-${String(month).padStart(2, "0")}`);
  }
  return [...months].filter((value) => new Date(`${value}-01T00:00:00Z`) <= AS_OF).sort();
}

function signal(months: string[]): string {
  const recent = months.filter((month) => new Date(`${month}-01T00:00:00Z`) >= new Date("2024-09-01T00:00:00Z")).length;
  if (recent >= 18) return "frequent-first-page-signal";
  if (recent >= 9) return "active-first-page-signal";
  if (recent >= 3) return "periodic-first-page-signal";
  if (recent >= 1) return "low-frequency-first-page-signal";
  return "no-dated-first-page-signal";
}

function chooseCandidate(candidates: Candidate[]): Candidate | null {
  return [...candidates].sort((a, b) => Number(STRONG.test(`${b.label} ${b.url}`)) - Number(STRONG.test(`${a.label} ${a.url}`)) || a.url.length - b.url.length)[0] ?? null;
}

async function inspect(row: DiscoveryRow) {
  const candidate = chooseCandidate(row.candidates);
  if (!candidate) return null;
  try {
    const response = await fetch(candidate.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; RegActions publication research/1.0; +https://regactions.com)", accept: "text/html,application/xhtml+xml" },
    });
    const html = (await response.text()).slice(0, 4_000_000);
    const $ = load(html);
    const title = $("title").first().text().replace(/\s+/g, " ").trim() || null;
    const visibleSample = $("body").text().replace(/\s+/g, " ").slice(0, 500_000);
    const months = observedMonths(html);
    const accessState = CHALLENGE.test(html.slice(0, 20_000)) ? "challenge-protected" : response.ok ? "reachable" : `http-${response.status}`;
    const strongLabel = STRONG.test(`${candidate.label} ${candidate.url}`);
    const strongContent = STRONG.test(`${title ?? ""} ${visibleSample}`);
    const relevance = accessState !== "reachable"
      ? "not-observable"
      : strongLabel && strongContent
        ? "strong-official-publication-candidate"
        : strongContent
          ? "plausible-official-publication-candidate"
          : "generic-or-ambiguous-link";
    return {
      iso2: row.iso2,
      country: row.country,
      authority: row.authority,
      roles: row.roles,
      candidate_label: candidate.label,
      candidate_url: candidate.url,
      final_url: response.url,
      access_state: accessState,
      http_status: response.status,
      title,
      publication_relevance: relevance,
      observed_months_2024_2026: months,
      observed_month_count: months.length,
      latest_observed_month: months.length ? months[months.length - 1] : null,
      provisional_cadence_signal: accessState === "reachable" ? signal(months) : "not-observable",
      interpretation: "Automated first-page signal only. Human validation, pagination and archive-depth research are required before any published metric.",
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      iso2: row.iso2,
      country: row.country,
      authority: row.authority,
      roles: row.roles,
      candidate_label: candidate.label,
      candidate_url: candidate.url,
      final_url: candidate.url,
      access_state: /timeout|aborted/i.test(message) ? "timeout" : "network-error",
      http_status: null,
      title: null,
      publication_relevance: "not-observable",
      observed_months_2024_2026: [] as string[],
      observed_month_count: 0,
      latest_observed_month: null,
      provisional_cadence_signal: "not-observable",
      interpretation: "Automated first-page signal only. Human validation, pagination and archive-depth research are required before any published metric.",
      error: message,
    };
  }
}

async function mapLimit<T, R>(values: T[], limit: number, fn: (value: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      out[index] = await fn(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return out;
}

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

async function main() {
  const payload = JSON.parse(await readFile(path.join(ROOT, "authority-publication-discovery.json"), "utf8")) as { rows: DiscoveryRow[] };
  const candidates = payload.rows.filter((row) => row.candidates.length > 0);
  const rows = (await mapLimit(candidates, 20, inspect)).filter((row): row is NonNullable<typeof row> => Boolean(row));
  const summary = {
    generatedAt: new Date().toISOString(),
    candidateAuthoritiesInspected: rows.length,
    accessStates: countBy(rows, (row) => row.access_state),
    provisionalCadenceSignals: countBy(rows, (row) => row.provisional_cadence_signal),
    publicationRelevance: countBy(rows, (row) => row.publication_relevance),
    countriesWithReachableDatedSignal: new Set(rows.filter((row) => row.access_state === "reachable" && row.observed_month_count > 0).map((row) => row.iso2)).size,
    limitation: "Discovery and first-page date signals are research leads, not validated publication-frequency metrics.",
  };
  await Promise.all([
    writeFile(path.join(ROOT, "authority-publication-cadence-observations.json"), `${JSON.stringify({ ...summary, rows }, null, 2)}\n`),
    writeFile(path.join(ROOT, "authority-publication-cadence-observations.csv"), toCsv(rows)),
    writeFile(path.join(ROOT, "publication-cadence-summary.json"), `${JSON.stringify(summary, null, 2)}\n`),
  ]);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
