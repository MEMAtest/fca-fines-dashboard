import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import XLSX from "xlsx";
import { buildFscaRecords, buildFscaRecord, parseFscaArchiveHtml, parseFscaArchivePageCount, parseFscaDate, parseFscaOperativeAmount, parseFscaWorkbook } from "../scrapeFsca.js";

const fixture = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/fsca-sample.html"), "utf8");

describe("FSCA official archive parser", () => {
  it("parses South African archive dates and pagination metadata", () => {
    expect(parseFscaDate("12/19/2025 12:00:00 AM")).toBe("2025-12-19");
    expect(parseFscaDate("1/1/0001 12:00:00 AM")).toBeNull();
    expect(parseFscaArchivePageCount(fixture)).toBe(1);
  });

  it("parses the official full-workbook export and retains case-document URLs", () => {
    const sheet = XLSX.utils.json_to_sheet([
      { Date: "9/3/2026 12:00:00 AM", Contravention: "Section 80", "Respondents/Defendants": "Example One", Outcome: "Penalty R 1 000", "Copy of Order": "https://www.fsca.co.za/_api/action-one/$value", "Press Release": "" },
      { Date: "8/2/2026 12:00:00 AM", Contravention: "Section 153", "Respondents/Defendants": "Example Two", Outcome: "Debarment", "Copy of Order": "https://www.fsca.co.za/_api/action-two/$value", "Press Release": "https://www.fsca.co.za/news/example-two" },
      { Date: "1/1/0001 12:00:00 AM", Contravention: "Unknown", "Respondents/Defendants": "Undated", Outcome: "Debarment", "Copy of Order": "", "Press Release": "" },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Enforcement Actions");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const rows = parseFscaWorkbook(buffer);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.respondent)).toEqual(["Example One", "Example Two", "Undated"]);
    expect(rows[0].orderUrl).toContain("/_api/action-one/$value");
    expect(rows[1].pressReleaseUrl).toBe("https://www.fsca.co.za/news/example-two");
    expect(rows[2].dateIssued).toBe("0001-01-01");
  });

  it("deduplicates repeated SSR rows while retaining official case evidence", () => {
    const rows = parseFscaArchiveHtml(fixture);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ respondent: "Ms Chrizelda Pillay", outcome: "Debarment", archiveUrl: "https://prod-entitysearchwebapplication.azurewebsites.net/enforcement-actions" });
    const records = buildFscaRecords(rows);
    expect(records).toHaveLength(2);
    expect(records.every((record) => record.regulator === "FSCA" && record.countryCode === "ZA")).toBe(true);
    expect(records.every((record) => record.sourceUrl.startsWith("https://"))).toBe(true);
    expect(new Set(records.map((record) => record.contentHash)).size).toBe(2);
  });

  it("uses explicit whole-record remitted penalty amounts without losing the gross source outcome", () => {
    const base = {
      dateIssued: "2019-09-11",
      contravention: "Section 81 of the Financial Markets Act",
      respondent: "Steinhoff International Holdings NV",
      outcome: "Administrative Penalty: R1.5 billion remitted to R53 million",
      orderUrl: "https://www.fsca.co.za/Enforcement-Matters/Documents/Order%20%28Signed_Steinhoff_2019_09-12.pdf",
      pressReleaseUrl: null,
      archiveUrl: "https://prod-entitysearchwebapplication.azurewebsites.net/enforcement-actions",
    };

    const record = buildFscaRecord(base);
    expect(parseFscaOperativeAmount(base.outcome)).toBe(53_000_000);
    expect(record.amount).toBe(53_000_000);
    expect(record.amountGbp).toBe(2_279_000);
    expect(record.amountEur).toBe(2_703_000);
    expect(record.summary).toContain("R1.5 billion remitted to R53 million");
    expect(JSON.parse(record.rawPayload)).toMatchObject({ outcome: base.outcome });
  });

  it("recognizes a second explicit remittance but does not collapse per-respondent outcomes", () => {
    expect(parseFscaOperativeAmount("R118 340 000 imposed. Upon an application for remission, the penalty and interest is remitted to R20 million."))
      .toBe(20_000_000);
    expect(parseFscaOperativeAmount("Administrative penalty reduced to R20 million on appeal."))
      .toBeNull();
    expect(parseFscaOperativeAmount("Administrative penalties of R2 million per respondent. Administrative penalty for first respondent reduced to R1 million on appeal."))
      .toBeNull();
    expect(parseFscaOperativeAmount("Administrative penalty of R2 million."))
      .toBeNull();
    expect(parseFscaOperativeAmount("Administrative penalty of R2 million was suspended pending appeal."))
      .toBeNull();
  });
});
