import { describe, expect, it, vi } from "vitest";
import { quarantineDroppedRecords } from "../lib/coverageDiscoveryCandidates.js";
import { assessPreparedBatchContinuity, assessPreparedBatchValidation, assertPreparedBatch, describePreparedRecordFailure, extractRegulatorCode } from "../lib/runScraper.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("persists prepared discovery evidence before an enforcement upsert", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/scraper/lib/runScraper.ts"), "utf8");
    expect(source.indexOf("persistPreparedDiscoveryCandidates")).toBeGreaterThan(-1);
    expect(source.indexOf("persistPreparedDiscoveryCandidates(sql, records, scraperRunId)")).toBeLessThan(source.indexOf("upsertEuFines(sql, records)"));
  });

  it("holds only when quarantined rows exceed both absolute and proportional tolerances", () => {
    expect(assessPreparedBatchValidation(100, 1, { maximumInvalidRecordCount: 5, maximumInvalidRecordFraction: 0.01 }).hold).toBe(false);
    expect(assessPreparedBatchValidation(100, 2, { maximumInvalidRecordCount: 5, maximumInvalidRecordFraction: 0.01 }).hold).toBe(false);
    expect(assessPreparedBatchValidation(100, 6, { maximumInvalidRecordCount: 5, maximumInvalidRecordFraction: 0.01 }).hold).toBe(true);
    expect(assessPreparedBatchValidation(4, 6, { maximumInvalidRecordCount: 5, maximumInvalidRecordFraction: 0.01 }).hold).toBe(true);
  });

  it("renews the database lease during long loaders and cleans the timer", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/scraper/lib/runScraper.ts"), "utf8");
    expect(source).toContain("setInterval(() =>");
    expect(source).toContain("heartbeatScraperRun");
    expect(source).toContain("clearInterval(heartbeatTimer)");
    expect(source).toContain("running_timeout_minutes");
  });

  it("keeps continuity checks fail-closed for a regressed latest date", () => {
    expect(assessPreparedBatchContinuity(100, 100, "2026-09-12", "2026-09-11", 0.35)).toMatchObject({
      dateRegressed: true,
      countDropped: false,
    });
    expect(assessPreparedBatchContinuity(100, 64, "2026-09-12", "2026-09-12", 0.35)).toMatchObject({
      dateRegressed: false,
      countDropped: true,
      floor: 65,
    });
  });
});

describe("assertPreparedBatch invalid-record handling", () => {
  const opts = { name: "FCA Scraper", regulatorCode: "FCA", liveLoader: async () => [] };
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...record, contentHash: `h${i}`, firmIndividual: `Firm ${i}` }));

  it("accepts a real firm name containing the word Navigation", () => {
    expect(describePreparedRecordFailure({ ...record, firmIndividual: "Sincere Navigation Corporation" })).toBeNull();
    expect(describePreparedRecordFailure({ ...record, firmIndividual: "Navigation" })).toMatch(/firmIndividual/);
  });

  it("names the failing field", () => {
    expect(describePreparedRecordFailure({ ...record, sourceUrl: "ftp://x" })).toMatch(/sourceUrl/);
    expect(describePreparedRecordFailure({ ...record, dateIssued: "07/04/2015" })).toMatch(/dateIssued/);
  });

  it("skips a lone malformed record in a batch instead of quarantining everything", () => {
    const batch = [...many(200), { ...record, contentHash: "bad", firmIndividual: "<b>Nav</b>" }];
    const kept = assertPreparedBatch(opts, batch, liveFlags);
    expect(kept).toHaveLength(200);
  });

  it("still quarantines when both the count and fraction caps are breached", () => {
    const bad = Array.from({ length: 8 }, (_, i) => ({ ...record, contentHash: `b${i}`, firmIndividual: "<i>x</i>" }));
    expect(() => assertPreparedBatch(opts, [...many(100), ...bad], liveFlags)).toThrow(/quarantined: 8 of 108/);
  });
});

describe("batch hold policy", () => {
  const caps = { maximumInvalidRecordCount: 5, maximumInvalidRecordFraction: 0.01 };
  const opts = { name: "FCA Scraper", regulatorCode: "FCA", liveLoader: async () => [] };
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...record, contentHash: `h${i}`, firmIndividual: `Firm ${i}` }));
  const bad = (n: number) => Array.from({ length: n }, (_, i) => ({ ...record, contentHash: `b${i}`, firmIndividual: "<i>x</i>" }));

  it("holds 5 bad out of 6 (invalid >= valid) even though 5 is not above the count cap", () => {
    expect(assessPreparedBatchValidation(6, 5, caps).hold).toBe(true);
    expect(() => assertPreparedBatch(opts, [...many(1), ...bad(5)], liveFlags)).toThrow(/quarantined/);
  });

  it("writes the good rows when 1 of 40 is bad and queues the bad one for review", async () => {
    expect(assessPreparedBatchValidation(40, 1, caps).hold).toBe(false);
    expect(assertPreparedBatch(opts, [...many(39), ...bad(1)], liveFlags)).toHaveLength(39);
    const sql = { unsafe: vi.fn().mockResolvedValue([]) };
    await expect(quarantineDroppedRecords(sql as never, [{ record: bad(1)[0], reason: "firmIndividual contains markup or page chrome" }], 7)).resolves.toBe(1);
    expect(sql.unsafe).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(sql.unsafe.mock.calls[0][1])).toContain("prepared_batch_validation");
  });

  it("holds a small batch with more than one bad record but tolerates a single one", () => {
    expect(assessPreparedBatchValidation(10, 1, caps).hold).toBe(false);
    expect(assessPreparedBatchValidation(10, 2, caps).hold).toBe(true);
  });

  it("does not let the two validation passes stack beyond the cap", () => {
    // 3 dropped by row validation + 3 by the field pass is 6 in total, over both caps.
    expect(assessPreparedBatchValidation(100, 3, caps).hold).toBe(false);
    expect(assessPreparedBatchValidation(100, 3 + 3, caps).hold).toBe(true);
  });
});
