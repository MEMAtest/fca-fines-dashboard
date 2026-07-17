import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildGhanaSecRecords,
  categorizeGhanaSecStatus,
  parseGhanaSecDate,
  parseGhanaSecHtml,
} from "../scrapeGhanaSec.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const html = readFileSync(join(FIXTURE_DIR, "ghana-sec-sample.html"), "utf8");

describe("Ghana SEC scraper", () => {
  it("parses ordinal English dates ('8th November, 2019')", () => {
    expect(parseGhanaSecDate("8th November, 2019")).toBe("2019-11-08");
    expect(parseGhanaSecDate("1st June, 2020")).toBe("2020-06-01");
  });

  it("parses the licence-action tables, skipping header rows", () => {
    const rows = parseGhanaSecHtml(html);
    // 3 revoked + 2 suspended, no header rows.
    expect(rows).toHaveLength(5);
    expect(rows.some((row) => /^company$/i.test(row.company))).toBe(false);
    expect(rows[0]).toMatchObject({
      company: "All-Time Capital Partners Limited",
      status: "Revoked",
      dateIssued: "2019-11-08",
    });
  });

  it("categorises revocation/suspension/cessation statuses", () => {
    expect(categorizeGhanaSecStatus("Revoked")).toEqual(
      expect.arrayContaining(["LICENSING", "LICENCE_REVOCATION"]),
    );
    expect(categorizeGhanaSecStatus("Suspended")).toEqual(
      expect.arrayContaining(["LICENSING", "LICENCE_SUSPENSION"]),
    );
    expect(categorizeGhanaSecStatus("Ceased")).toEqual(
      expect.arrayContaining(["LICENSING", "LICENCE_CESSATION"]),
    );
  });

  it("builds null-amount, GHS licence records (idempotent, newest-first)", () => {
    const records = buildGhanaSecRecords(parseGhanaSecHtml(html));
    const hashes = new Set(records.map((record) => record.contentHash));

    expect(records).toHaveLength(5);
    expect(hashes.size).toBe(5);
    expect(records[0].dateIssued).toBe("2020-06-01");
    expect(records.every((record) => record.amount === null)).toBe(true);
    expect(records[0]).toMatchObject({
      regulator: "GHSEC",
      countryCode: "GH",
      currency: "GHS",
    });
  });
});
