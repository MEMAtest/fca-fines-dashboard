#!/usr/bin/env npx tsx
/**
 * Ingest Transparency International CPI → src/data/cpiData.ts snapshot.
 *
 * CPI (Corruption Perceptions Index) is a 0–100 score, HIGHER = cleaner. It is
 * DISPLAY-ONLY here (CC BY-ND — we show it unmodified, never derive/score from
 * it; the scored corruption signal comes from World Bank WGI). We take the
 * latest available score and rank without transforming either value.
 *
 * Data from Transparency International's official CPI workbook:
 *   npx tsx scripts/ingest-cpi.ts            # write the snapshot
 *   npx tsx scripts/ingest-cpi.ts --dry-run  # print summary, don't write
 *   npx tsx scripts/ingest-cpi.ts --file /path/to/CPI2025_Results.xlsx
 */
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import { getCountryByIso3 } from "../src/data/countries.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "data", "cpiData.ts");
const dryRun = process.argv.includes("--dry-run");

const REQUESTED_YEAR = process.argv.find((arg) => arg.startsWith("--year="))?.split("=")[1];

function fileArg(): string | undefined {
  const inline = process.argv.find((arg) => arg.startsWith("--file="));
  if (inline) return inline.slice("--file=".length);
  const index = process.argv.indexOf("--file");
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function loadWorkbook(year: string): Promise<XLSX.WorkBook> {
  const local = fileArg();
  if (local) return XLSX.readFile(local);

  const xlsxUrl = `https://files.transparencycdn.org/images/CPI${year}_Results.xlsx`;
  const response = await fetch(xlsxUrl, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`CPI fetch HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error("CPI endpoint returned HTML instead of the official workbook");
  }
  return XLSX.read(Buffer.from(await response.arrayBuffer()), { type: "buffer" });
}

async function main() {
  const candidates = REQUESTED_YEAR
    ? [REQUESTED_YEAR]
    : Array.from({ length: 3 }, (_, index) => String(new Date().getUTCFullYear() - 1 - index));
  let cpiYear: string | undefined;
  let workbook: XLSX.WorkBook | undefined;
  for (const candidate of candidates) {
    try {
      const loaded = await loadWorkbook(candidate);
      if (!loaded.Sheets[`CPI${candidate}`]) throw new Error(`workbook is missing CPI${candidate}`);
      cpiYear = candidate;
      workbook = loaded;
      break;
    } catch (error) {
      if (fileArg() || REQUESTED_YEAR) throw error;
      console.log(`CPI ${candidate} is not available: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (!workbook || !cpiYear) throw new Error("No current official CPI workbook found");
  const sheet = workbook.Sheets[`CPI${cpiYear}`];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  const headerIndex = rows.findIndex((row) => row.includes(`CPI ${cpiYear} score`));
  if (headerIndex < 0) throw new Error("Could not locate the CPI score header row");
  const header = rows[headerIndex].map((value) => String(value ?? ""));
  const codeIdx = header.indexOf("ISO3");
  const scoreIdx = header.indexOf(`CPI ${cpiYear} score`);
  const rankIdx = header.indexOf("Rank");
  if (codeIdx < 0 || scoreIdx < 0 || rankIdx < 0) {
    throw new Error(`Unexpected CPI columns: ${header.join(" | ")}`);
  }

  const current = rows.slice(headerIndex + 1).flatMap((row) => {
    const iso3 = String(row[codeIdx] ?? "").trim();
    const score = Number(row[scoreIdx]);
    const rank = Number(row[rankIdx]);
    return iso3.length === 3 && Number.isFinite(score) && Number.isFinite(rank)
      ? [{ iso3, score, rank }]
      : [];
  });
  if (current.length < 170) {
    throw new Error(`CPI workbook coverage too small: ${current.length}`);
  }
  const total = current.length;

  // Map ISO3 → our iso2, compute standard-competition rank (ties share a rank).
  interface Entry {
    iso2: string;
    name: string;
    score: number;
    rank: number;
  }
  const entries: Entry[] = [];
  for (const r of current) {
    const country = getCountryByIso3(r.iso3);
    if (!country) continue;
    entries.push({ iso2: country.iso2, name: country.name, score: r.score, rank: r.rank });
  }
  // Stable order for the generated file: by rank asc, then name.
  entries.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

  console.log(
    `CPI ${cpiYear}: ${current.length} scored countries, ${entries.length} mapped to our ISO set (total ranked = ${total}).`,
  );
  console.log(
    "  sample:",
    entries
      .filter((e) => ["DK", "NG", "IR", "SO", "GB", "US"].includes(e.iso2))
      .map((e) => `${e.iso2} ${e.score}/#${e.rank}`)
      .join(" · "),
  );

  if (dryRun) return;

  const body = entries
    .map((e) => `  ${e.iso2}: { score: ${e.score}, rank: ${e.rank} }, // ${e.name}`)
    .join("\n");

  const file = `/**
 * Transparency International — Corruption Perceptions Index (CPI) snapshot.
 *
 * Score 0–100 (HIGHER = cleaner / less corrupt) + rank (1 = cleanest) within the
 * ${cpiYear} table (${total} countries ranked; official published rank).
 *
 * DISPLAY-ONLY. CPI is licensed CC BY-ND: we show it unmodified and NEVER feed it
 * into the RegActions Country Risk Score (the scored corruption signal comes from
 * the World Bank WGI Control-of-Corruption dimension). Attribution required.
 *
 * GENERATED by scripts/ingest-cpi.ts. Do not edit by hand — re-run to refresh.
 */

export const CPI_YEAR = "${cpiYear}";
export const CPI_TOTAL = ${total};
export const CPI_SOURCE = "https://www.transparency.org/en/cpi/${cpiYear}";
export const CPI_LICENCE = "CC BY-ND 4.0 — Transparency International";

export interface CpiEntry {
  /** 0–100, higher = cleaner. */
  score: number;
  /** 1 = cleanest; out of CPI_TOTAL. */
  rank: number;
}

/** iso2 -> CPI score + rank (${cpiYear}). Display only, never scored. */
export const CPI_RANK: Record<string, CpiEntry> = {
${body}
};

export function getCpi(iso2: string): CpiEntry | undefined {
  return CPI_RANK[iso2];
}

export function hasCpi(iso2: string): boolean {
  return iso2 in CPI_RANK;
}
`;

  writeFileSync(OUT, file);
  console.log(`Wrote ${OUT} (${entries.length} countries, CPI ${cpiYear}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
