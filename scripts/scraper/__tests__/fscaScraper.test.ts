import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFscaRecords, parseFscaArchiveHtml, parseFscaArchivePageCount, parseFscaDate } from "../scrapeFsca.js";

const fixture = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/fsca-sample.html"), "utf8");

describe("FSCA official archive parser", () => {
  it("parses South African archive dates and pagination metadata", () => {
    expect(parseFscaDate("12/19/2025 12:00:00 AM")).toBe("2025-12-19");
    expect(parseFscaArchivePageCount(fixture)).toBe(1);
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
});
