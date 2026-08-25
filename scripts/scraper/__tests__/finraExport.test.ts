import { describe, expect, it } from "vitest";
import XLSX from "xlsx";
import {
  FINRA_EXPORT_HEADERS,
  FINRA_EXPORT_URL,
  buildFinraRecords,
  parseFinraExportWorkbook,
} from "../scrapeFinra.js";
import { assertPreparedBatch } from "../lib/runScraper.js";
import type { CliFlags } from "../lib/euFineHelpers.js";

const liveFlags: CliFlags = {
  dryRun: false,
  useTestData: false,
  strictLive: true,
  limit: null,
};

function workbookFixture(rows: unknown[][], sheetName = "Export") {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([[...FINRA_EXPORT_HEADERS], ...rows]);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("FINRA official XLSX export", () => {
  it("parses respondent-level rows and builds exact deduplicated records", () => {
    const rows = [
      [
        "2023078630201",
        "2023078630201 Raymond James AWC.pdf",
        "08/18/2026",
        "AWCs (Letters of Acceptance, Waiver, and Consent)",
        "",
        "",
        "Raymond James & Associates; Inc.",
        "705",
        "No",
        "https://data-portal.finra.org/fda_documents/raymond-james.pdf",
        "The firm was fined $35,000 for supervisory failures.",
      ],
      [
        "2023078630202",
        "Individual AWC.pdf",
        new Date("2026-08-19T00:00:00.000Z"),
        "AWCs",
        "Jane Doe",
        "12345",
        "",
        "",
        "No",
        "https://data-portal.finra.org/fda_documents/jane-doe.pdf",
        "",
      ],
      [
        "2023078630203",
        "Firm and individual AWC.pdf",
        "2026-08-20",
        "AWCs",
        "Jane Doe",
        "12345",
        "Example Securities LLC",
        "9876",
        "Yes",
        "https://data-portal.finra.org/fda_documents/firm-and-individual.pdf",
        "Both respondents were sanctioned.",
      ],
    ];

    const entries = parseFinraExportWorkbook(workbookFixture(rows));
    expect(entries).toEqual([
      expect.objectContaining({
        caseNumber: "2023078630201",
        respondent: "Raymond James & Associates; Inc.",
        dateIssued: "2026-08-18",
        documentType: "AWCs (Letters of Acceptance, Waiver, and Consent)",
        actionUrl: "https://data-portal.finra.org/fda_documents/raymond-james.pdf",
      }),
      expect.objectContaining({
        caseNumber: "2023078630202",
        respondent: "Jane Doe",
        dateIssued: "2026-08-19",
        summary: "Individual AWC.pdf",
      }),
      expect.objectContaining({
        caseNumber: "2023078630203",
        respondent: "Jane Doe",
        dateIssued: "2026-08-20",
      }),
      expect.objectContaining({
        caseNumber: "2023078630203",
        respondent: "Example Securities LLC",
        dateIssued: "2026-08-20",
      }),
    ]);

    const records = buildFinraRecords([...entries, entries[0]!]);
    expect(records).toHaveLength(4);
    expect(records[0]).toMatchObject({
      regulator: "FINRA",
      firmIndividual: "Raymond James & Associates; Inc.",
      dateIssued: "2026-08-18",
      amount: 35000,
      sourceUrl: FINRA_EXPORT_URL,
      finalNoticeUrl: "https://data-portal.finra.org/fda_documents/raymond-james.pdf",
    });
  });

  it("rejects a missing worksheet or any header drift", () => {
    expect(() => parseFinraExportWorkbook(workbookFixture([], "Other"))).toThrow(
      /missing the required Export worksheet/,
    );

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([[...FINRA_EXPORT_HEADERS].reverse()]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Export");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    expect(() => parseFinraExportWorkbook(buffer)).toThrow(/headers changed/);
  });

  it("drops incomplete rows and leaves the shared runner to hold a zero-record batch", () => {
    const entries = parseFinraExportWorkbook(
      workbookFixture([
        ["case", "title", "not-a-date", "AWC", "", "", "", "", "", "not-a-url", "summary"],
      ]),
    );
    expect(entries).toEqual([]);
    expect(() =>
      assertPreparedBatch(
        { name: "FINRA Disciplinary Actions Scraper", regulatorCode: "FINRA", liveLoader: async () => [] },
        [],
        liveFlags,
      ),
    ).toThrow(/returned zero records/);
  });

  it("uses the official export host", () => {
    expect(FINRA_EXPORT_URL).toBe("https://data-portal.finra.org/exports/fda_export_all.xlsx");
  });
});
