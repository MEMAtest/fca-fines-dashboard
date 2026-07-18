import { describe, expect, it } from "vitest";
import { assertPreparedBatch, extractRegulatorCode } from "../lib/runScraper.js";
import type { CliFlags, DbReadyRecord } from "../lib/euFineHelpers.js";

const liveFlags: CliFlags = { dryRun: false, useTestData: false, strictLive: true, limit: null };
const record: DbReadyRecord = {
  contentHash: "hash",
  regulator: "FCA",
  regulatorFullName: "Financial Conduct Authority",
  countryCode: "GB",
  countryName: "United Kingdom",
  firmIndividual: "Example Firm",
  firmCategory: "Banking",
  amount: 100,
  currency: "GBP",
  amountEur: 117,
  amountGbp: 100,
  dateIssued: "2026-01-01",
  yearIssued: 2026,
  monthIssued: 1,
  breachType: "Controls",
  breachCategories: ["Controls"],
  summary: "Official enforcement action",
  finalNoticeUrl: "https://www.fca.org.uk/example",
  sourceUrl: "https://www.fca.org.uk/example",
  rawPayload: "{}",
};

describe("runScraper regulator attribution", () => {
  it("extracts canonical codes from ordinary acronym-led scraper names", () => {
    expect(extractRegulatorCode("🇺🇸 SEC Press Release Enforcement Scraper")).toBe(
      "SEC",
    );
    expect(extractRegulatorCode("🇩🇪 BaFin Enforcement Actions Scraper")).toBe(
      "BaFin",
    );
  });

  it("maps long regulator display names to canonical codes", () => {
    expect(extractRegulatorCode("🇮🇹 Banca d'Italia Sanctions Scraper")).toBe(
      "BDI",
    );
    expect(
      extractRegulatorCode("🇨🇿 Czech National Bank Final Decisions Scraper"),
    ).toBe("CNBCZ");
    expect(
      extractRegulatorCode("🇸🇪 Finansinspektionen Sanctions Scraper"),
    ).toBe("FISE");
  });
});

describe("runScraper promotion gate", () => {
  it("quarantines an unexpected zero-record batch", () => {
    expect(() => assertPreparedBatch({ name: "FCA Scraper", regulatorCode: "FCA", liveLoader: async () => [] }, [], liveFlags)).toThrow(/returned zero records/);
  });

  it("allows an explicitly sparse source to return no rows", () => {
    expect(() => assertPreparedBatch({ name: "Sparse Scraper", regulatorCode: "FCA", liveLoader: async () => [], qualityContract: { allowZeroRecords: true } }, [], liveFlags)).not.toThrow();
  });

  it("quarantines malformed source evidence before any database write", () => {
    expect(() => assertPreparedBatch({ name: "FCA Scraper", regulatorCode: "FCA", liveLoader: async () => [] }, [{ ...record, sourceUrl: "not-a-url" }], liveFlags)).toThrow(/source URL validation/);
  });

  it("quarantines batches below the regulator minimum", () => {
    expect(() => assertPreparedBatch({ name: "FCA Scraper", regulatorCode: "FCA", liveLoader: async () => [] }, [record], liveFlags)).toThrow(/configured minimum/);
  });

  it("quarantines cross-regulator contamination", () => {
    expect(() => assertPreparedBatch({ name: "SEC Scraper", regulatorCode: "SEC", liveLoader: async () => [] }, [{ ...record, regulator: "FCA" }], liveFlags)).toThrow(/outside the SEC source contract/);
  });
});
