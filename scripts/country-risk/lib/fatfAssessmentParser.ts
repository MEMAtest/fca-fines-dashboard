import XLSX from "xlsx";
import { resolveCountry } from "../../../src/data/countries.js";
import type {
  FatfAssessmentMethodology,
  FatfAssessmentRecord,
  FatfEffectivenessRating,
  FatfTechnicalRating,
} from "../../../src/data/fatfAssessmentData.js";

const EFFECTIVENESS = new Set<FatfEffectivenessRating>(["HE", "SE", "ME", "LE"]);
const TECHNICAL = new Set<FatfTechnicalRating>(["C", "LC", "PC", "NC"]);

function normaliseHeader(value: unknown): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[._-]/g, "");
}

function effectivenessKey(value: unknown): `IO${number}` | undefined {
  const match = normaliseHeader(value).match(/^IO(\d{1,2})$/);
  if (!match) return undefined;
  const number = Number(match[1]);
  return number >= 1 && number <= 11 ? `IO${number}` : undefined;
}

function technicalKey(value: unknown): `R${number}` | undefined {
  const match = normaliseHeader(value).match(/^(?:R|REC|RECOMMENDATION)(\d{1,2})$/);
  if (!match) return undefined;
  const number = Number(match[1]);
  return number >= 1 && number <= 40 ? `R${number}` : undefined;
}

function rating(value: unknown): string {
  return String(value ?? "")
    .toUpperCase()
    .trim()
    .replace(/[^A-Z]/g, "");
}

function findHeader(rows: unknown[][]): number {
  return rows.findIndex((row) => {
    const ioCount = row.filter((cell) => effectivenessKey(cell)).length;
    const recommendationCount = row.filter((cell) => technicalKey(cell)).length;
    return ioCount >= 3 || recommendationCount >= 10;
  });
}

export interface ParsedFatfWorkbook {
  methodology: FatfAssessmentMethodology;
  records: FatfAssessmentRecord[];
  unresolvedCountries: string[];
}

export function parseFatfWorkbook(
  buffer: Buffer,
  methodology: FatfAssessmentMethodology,
): ParsedFatfWorkbook {
  if (buffer.subarray(0, 64).toString("utf8").toLowerCase().includes("<!doctype html")) {
    throw new Error("FATF source returned an HTML challenge instead of an XLSX workbook");
  }

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const byIso2 = new Map<string, FatfAssessmentRecord>();
  const unresolved = new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
    const headerIndex = findHeader(rows);
    if (headerIndex < 0) continue;

    const header = rows[headerIndex];
    const assessmentDateIndex = header.findIndex((cell) =>
      /(?:ASSESSMENT|REPORT|PUBLICATION).*(?:DATE|YEAR)|(?:DATE|YEAR).*(?:ASSESSMENT|REPORT|PUBLICATION)/i.test(
        String(cell ?? ""),
      ),
    );
    const ioColumns = header.flatMap((cell, index) => {
      const key = effectivenessKey(cell);
      return key ? [{ index, key }] : [];
    });
    const recommendationColumns = header.flatMap((cell, index) => {
      const key = technicalKey(cell);
      return key ? [{ index, key }] : [];
    });

    for (const row of rows.slice(headerIndex + 1)) {
      const name = String(row[0] ?? "").trim();
      if (!name) continue;
      const country = resolveCountry(name);
      if (!country) {
        if (ioColumns.some(({ index }) => EFFECTIVENESS.has(rating(row[index]) as FatfEffectivenessRating)) ||
            recommendationColumns.some(({ index }) => TECHNICAL.has(rating(row[index]) as FatfTechnicalRating))) {
          unresolved.add(name);
        }
        continue;
      }

      const effectiveness: FatfAssessmentRecord["effectiveness"] = {};
      for (const { index, key } of ioColumns) {
        const value = rating(row[index]) as FatfEffectivenessRating;
        if (EFFECTIVENESS.has(value)) effectiveness[key] = value;
      }
      const technicalCompliance: FatfAssessmentRecord["technicalCompliance"] = {};
      for (const { index, key } of recommendationColumns) {
        const value = rating(row[index]) as FatfTechnicalRating;
        if (TECHNICAL.has(value)) technicalCompliance[key] = value;
      }
      if (!Object.keys(effectiveness).length && !Object.keys(technicalCompliance).length) continue;

      byIso2.set(country.iso2, {
        iso2: country.iso2,
        country: country.name,
        methodology,
        assessmentDate:
          assessmentDateIndex >= 0 && row[assessmentDateIndex]
            ? String(row[assessmentDateIndex]).trim()
            : undefined,
        effectiveness,
        technicalCompliance,
      });
    }
  }

  if (!byIso2.size) {
    throw new Error("No FATF assessment records found; workbook schema may have changed");
  }
  return {
    methodology,
    records: [...byIso2.values()].sort((a, b) => a.country.localeCompare(b.country)),
    unresolvedCountries: [...unresolved].sort(),
  };
}
