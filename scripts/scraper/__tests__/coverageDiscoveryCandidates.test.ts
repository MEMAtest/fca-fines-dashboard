import { describe, expect, it, vi } from "vitest";
import type { DbReadyRecord } from "../lib/euFineHelpers.js";
import {
  buildDiscoveryCandidateRow,
  persistPreparedDiscoveryCandidates,
} from "../lib/coverageDiscoveryCandidates.js";

const record: DbReadyRecord = {
  contentHash: "initial-hash", regulator: "FCA", regulatorFullName: "Financial Conduct Authority", countryCode: "GB", countryName: "United Kingdom",
  firmIndividual: "Example Firm", firmCategory: null, amount: 100000, currency: "GBP", amountEur: 117000, amountGbp: 100000,
  dateIssued: "2026-08-13", yearIssued: 2026, monthIssued: 8, breachType: "Controls", breachCategories: ["Controls"], summary: "Official control failure.",
  finalNoticeUrl: "https://www.fca.org.uk/news/example", sourceUrl: "https://www.fca.org.uk/news/example?utm_source=test", rawPayload: "{}",
};

describe("prepared official-source discovery persistence", () => {
  it("uses a stable action fingerprint when evidence text or amount is corrected", () => {
    const initial = buildDiscoveryCandidateRow(record, 12);
    const corrected = buildDiscoveryCandidateRow({ ...record, contentHash: "new-hash", amount: 120000, summary: "Corrected official control failure." }, 13);
    expect(initial.fingerprint).toBe(corrected.fingerprint);
    expect(initial.sourceUrl).toBe("https://www.fca.org.uk/news/example");
  });

  it("fails closed when a prepared record is not on a configured official regulator domain", () => {
    expect(() => buildDiscoveryCandidateRow({ ...record, sourceUrl: "https://example.com/copied-story" }, 12)).toThrow(/outside configured official regulator domains/);
  });

  it("persists by fingerprint and never includes candidate status in the upsert", async () => {
    const unsafe = vi.fn().mockResolvedValue([]);
    const sql = { unsafe };
    await expect(persistPreparedDiscoveryCandidates(sql as never, [record], 12)).resolves.toBe(1);
    expect(unsafe).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT (fingerprint) DO UPDATE"), [expect.any(String)]);
    expect(unsafe.mock.calls[0][0]).not.toContain("status =");
    expect(unsafe.mock.calls[0][1][0]).toContain("initial-hash");
  });
});
