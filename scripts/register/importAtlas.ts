/**
 * Phase 0 — parse the Global AML Regulatory Atlas workbook and drop placeholder
 * cells. Writes a reconciliation-ready JSON extract (real cells only) plus a
 * report of what was dropped. The report is written OUTSIDE the repo
 * (scratch dir), never committed.
 *
 * Usage: npx tsx scripts/register/importAtlas.ts <path-to-xlsx> <out-dir>
 */
import * as XLSX from "xlsx";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import path from "path";

// Placeholder-cell patterns observed in the atlas audit (Part B context table).
// Any cell matching one of these is treated as "no data", not a fact.
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /requires? (sector-specific )?(national )?source check/i,
  /requires? primary-source completion/i,
  /requires? entity-specific verification/i,
  /requires? jurisdiction-specific source check/i,
  /requires? country-specific verification/i,
  /not listed in current/i,
  /not mapped in current source set/i,
  /review required/i,
  /country-specific rule requires source verification/i,
  /named-agency mapping requires/i,
  /none identified in this version/i,
  /^no$/i,
  /^not on fatf public/i,
  /^no fatf public-list flag$/i,
];

function isPlaceholder(v: unknown): boolean {
  if (v == null) return true;
  const s = String(v).trim();
  if (!s) return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(s));
}

function cleanCell(v: unknown): string | null {
  return isPlaceholder(v) ? null : String(v).trim();
}

function main() {
  const xlsxPath = process.argv[2];
  const outDir = process.argv[3];
  if (!xlsxPath || !outDir) {
    console.error("Usage: importAtlas.ts <xlsx> <outDir>");
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });

  const buf = readFileSync(xlsxPath);
  const wb = XLSX.read(buf, { type: "buffer" });

  const sheets = [
    "Country Index",
    "Legal Instruments",
    "FIU Directory",
    "Authorities",
    "FATF Network",
    "Verification Log",
    "Source Registry",
  ];

  const report: Record<string, { totalCells: number; placeholderCells: number; realCells: number }> = {};
  const extract: Record<string, Record<string, string | null>[]> = {};

  for (const sheetName of sheets) {
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      report[sheetName] = { totalCells: 0, placeholderCells: 0, realCells: 0 };
      extract[sheetName] = [];
      continue;
    }
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const header = (rows[0] ?? []).map((h) => (h == null ? "" : String(h)));
    let total = 0;
    let placeholder = 0;
    const cleanedRows: Record<string, string | null>[] = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const obj: Record<string, string | null> = {};
      header.forEach((h, idx) => {
        if (!h) return;
        total++;
        const cleaned = cleanCell(row[idx]);
        if (cleaned == null) placeholder++;
        obj[h] = cleaned;
      });
      if (Object.values(obj).some((v) => v != null)) cleanedRows.push(obj);
    }
    report[sheetName] = {
      totalCells: total,
      placeholderCells: placeholder,
      realCells: total - placeholder,
    };
    extract[sheetName] = cleanedRows;
  }

  writeFileSync(path.join(outDir, "atlas-extract.json"), JSON.stringify(extract, null, 2));
  writeFileSync(
    path.join(outDir, "atlas-reconciliation-report.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: xlsxPath,
        perSheet: report,
      },
      null,
      2,
    ),
  );
  console.log("Atlas import complete. Report:");
  console.table(report);
}

main();
