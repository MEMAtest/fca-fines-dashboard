import { describe, expect, it } from "vitest";
import XLSX from "xlsx";
import { parseFatfWorkbook } from "../../country-risk/lib/fatfAssessmentParser.js";

function workbookBuffer(rows: unknown[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Ratings");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

describe("FATF assessment parser", () => {
  it("parses effectiveness and technical-compliance ratings", () => {
    const buffer = workbookBuffer([
      ["Consolidated FATF ratings"],
      ["Country", "Report Type", "Report Date", "IO.1", "IO.2", "IO.3", "R.1", "R.2", "R.3", "R.4", "R.5", "R.6", "R.7", "R.8", "R.9", "R.10"],
      ["United Kingdom", "MER", "2024-01", "SE", "ME", "HE", "C", "LC", "PC", "NC", "C", "LC", "PC", "C", "LC", "C"],
    ]);
    const parsed = parseFatfWorkbook(buffer, "2013");
    expect(parsed.unresolvedCountries).toEqual([]);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]).toMatchObject({
      iso2: "GB",
      methodology: "2013",
      assessmentDate: "2024-01",
      ratingsDate: "2024-01",
      effectiveness: { IO1: "SE", IO2: "ME", IO3: "HE" },
      technicalCompliance: { R1: "C", R2: "LC", R3: "PC", R4: "NC" },
    });
  });

  it("keeps current summary ratings while retaining the original MER date", () => {
    const buffer = workbookBuffer([
      ["Country", "Report Type", "Report Date", "IO.1", "IO.2", "IO.3", "R.1", "R.2", "R.3", "R.4", "R.5", "R.6", "R.7", "R.8", "R.9", "R.10"],
      ["United Kingdom", "MER+FUR(s)", "2025-06", "SE", "SE", "SE", "C", "C", "C", "C", "C", "C", "C", "C", "C", "C"],
      ["United Kingdom", "MER", "2018-12", "ME", "ME", "ME", "PC", "PC", "PC", "PC", "PC", "PC", "PC", "PC", "PC", "PC"],
      ["United Kingdom", "FUR", "2025-06", "ME", "ME", "ME", "LC", "LC", "LC", "LC", "LC", "LC", "LC", "LC", "LC", "LC"],
    ]);
    const record = parseFatfWorkbook(buffer, "2013").records[0];
    expect(record).toMatchObject({ assessmentDate: "2018-12", ratingsDate: "2025-06" });
    expect(record.effectiveness.IO1).toBe("SE");
    expect(record.technicalCompliance.R1).toBe("C");
  });

  it("retains official not-applicable recommendations as evidence without scoring them as zero", () => {
    const buffer = workbookBuffer([
      ["Country", "Report Type", "Report Date", "IO.1", "IO.2", "IO.3", "R.1", "R.2", "R.3", "R.4", "R.5", "R.6", "R.7", "R.8", "R.9", "R.10"],
      ["United Kingdom", "MER", "2024-01", "SE", "ME", "HE", "C", "N/A", "PC", "NC", "C", "LC", "PC", "C", "LC", "C"],
    ]);
    const record = parseFatfWorkbook(buffer, "2013").records[0];
    expect(record.technicalCompliance.R2).toBeUndefined();
    expect(record.technicalNotApplicable).toEqual(["R2"]);
  });

  it("extracts the official workbook update date", () => {
    const buffer = workbookBuffer([
      ["Updated 10 July 2026"],
      ["Country", "Report Type", "Report Date", "IO.1", "IO.2", "IO.3", "R.1", "R.2", "R.3", "R.4", "R.5", "R.6", "R.7", "R.8", "R.9", "R.10"],
      ["United Kingdom", "MER", "2024-01", "SE", "ME", "HE", "C", "LC", "PC", "NC", "C", "LC", "PC", "C", "LC", "C"],
    ]);
    expect(parseFatfWorkbook(buffer, "2013").sourceUpdatedAt).toBe("2026-07-10");
  });

  it("fails closed on an HTML challenge", () => {
    expect(() => parseFatfWorkbook(Buffer.from("<!doctype html><title>Just a moment</title>"), "2013"))
      .toThrow(/HTML challenge/);
  });

  it("fails closed when the workbook schema has no rating table", () => {
    expect(() => parseFatfWorkbook(workbookBuffer([["Country", "Value"], ["UK", 1]]), "2022"))
      .toThrow(/No FATF assessment records/);
  });
});
