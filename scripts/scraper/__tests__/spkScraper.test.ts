import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSpkRecord,
  buildSpkRecords,
  categorizeSpkRecord,
  parseSpkDate,
  type SpkFineRecord,
} from "../scrapeSpk.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const sample = JSON.parse(
  readFileSync(join(FIXTURE_DIR, "spk-sample.json"), "utf8"),
) as SpkFineRecord[];

describe("SPK scraper", () => {
  it("parses the ISO board-decision datetime to a plain date", () => {
    expect(parseSpkDate("2026-06-24T00:00:00")).toBe("2026-06-24");
    expect(parseSpkDate(null)).toBeNull();
    expect(parseSpkDate("not a date")).toBeNull();
  });

  it("builds a DB-ready record from a live SPK penalty payload", () => {
    const record = buildSpkRecord(sample[0]);

    expect(record).not.toBeNull();
    expect(record).toMatchObject({
      regulator: "SPK",
      countryCode: "TR",
      currency: "TRY",
      dateIssued: "2026-06-24",
      amount: 640442,
    });
    // Turkish source text is preserved verbatim in the firm name.
    expect(record?.firmIndividual).toBe(
      "GİRİŞİM ELEKTRİK SANAYİ TAAHHÜT VE TİCARET ANONİM ŞİRKETİ",
    );
    // TRY is convertible now that the rate table carries it.
    expect(record?.amountGbp).not.toBeNull();
    expect(record?.amountEur).not.toBeNull();
  });

  it("classifies a prospectus/disclosure breach from the Turkish rule text", () => {
    // "İzahname" (prospectus) → DISCLOSURE.
    expect(categorizeSpkRecord(sample[0])).toContain("DISCLOSURE");
  });

  it("gives every distinct penalty a unique content hash (idempotent)", () => {
    const records = buildSpkRecords(sample);
    const hashes = new Set(records.map((record) => record.contentHash));

    // The fixture contains 3 penalties, all distinct penalty ids → 3 hashes.
    expect(records).toHaveLength(3);
    expect(hashes.size).toBe(3);
  });

  it("sorts records newest-first", () => {
    const records = buildSpkRecords(sample);
    const dates = records.map((record) => record.dateIssued);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
  });
});
