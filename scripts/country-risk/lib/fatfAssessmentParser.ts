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
  sourceUpdatedAt?: string;
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
  const candidates = new Map<string, { record: FatfAssessmentRecord; summary: boolean }>();
  const assessmentDates = new Map<string, string>();
  const unresolved = new Set<string>();
  let sourceUpdatedAt: string | undefined;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
    if (!sourceUpdatedAt) {
      const updatedLabel = rows.flat().find((cell) => /^updated\s+\d{1,2}\s+\p{L}+\s+\d{4}$/iu.test(String(cell ?? "").trim()));
      if (updatedLabel) {
        const parsed = new Date(`${String(updatedLabel).trim().replace(/^updated\s+/i, "")} UTC`);
        if (!Number.isNaN(parsed.getTime())) sourceUpdatedAt = parsed.toISOString().slice(0, 10);
      }
    }
    const headerIndex = findHeader(rows);
    if (headerIndex < 0) continue;

    const header = rows[headerIndex];
    const headerLabel = (cell: unknown) => String(cell ?? "").replace(/\s+/g, " ").trim();
    const reportDateIndex = header.findIndex((cell) =>
      /(?:ASSESSMENT|REPORT|PUBLICATION).*(?:DATE|YEAR)|(?:DATE|YEAR).*(?:ASSESSMENT|REPORT|PUBLICATION)/i.test(
        headerLabel(cell),
      ),
    );
    const reportTypeIndex = header.findIndex((cell) => /REPORT.*TYPE/i.test(headerLabel(cell)));
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
      const technicalNotApplicable: Array<`R${number}`> = [];
      for (const { index, key } of recommendationColumns) {
        const value = rating(row[index]) as FatfTechnicalRating;
        if (TECHNICAL.has(value)) technicalCompliance[key] = value;
        else if (rating(row[index]) === "NA") technicalNotApplicable.push(key);
      }
      if (!Object.keys(effectiveness).length && !Object.keys(technicalCompliance).length) continue;
      const reportType = reportTypeIndex >= 0 ? String(row[reportTypeIndex] ?? "").trim().toUpperCase() : "";
      const reportDate = reportDateIndex >= 0 && row[reportDateIndex]
        ? String(row[reportDateIndex]).trim()
        : undefined;
      if (reportType === "MER" && reportDate) {
        const existing = assessmentDates.get(country.iso2);
        if (!existing || reportDate > existing) assessmentDates.set(country.iso2, reportDate);
      }
      const record: FatfAssessmentRecord = {
        iso2: country.iso2,
        country: country.name,
        methodology,
        ratingsDate: reportDate,
        effectiveness,
        technicalCompliance,
        technicalNotApplicable: technicalNotApplicable.length ? technicalNotApplicable : undefined,
      };
      const summary = reportType.includes("MER+FUR");
      const existing = candidates.get(country.iso2);
      if (!existing || (summary && !existing.summary) || (summary === existing.summary && (reportDate ?? "") > (existing.record.ratingsDate ?? ""))) {
        candidates.set(country.iso2, { record, summary });
      }
    }
  }

  if (!candidates.size) {
    throw new Error("No FATF assessment records found; workbook schema may have changed");
  }
  const records = [...candidates.values()].map(({ record }) => ({
    ...record,
    assessmentDate: assessmentDates.get(record.iso2) ?? record.ratingsDate,
  }));
  return {
    methodology,
    sourceUpdatedAt,
    records: records.sort((a, b) => a.country.localeCompare(b.country)),
    unresolvedCountries: [...unresolved].sort(),
  };
}
