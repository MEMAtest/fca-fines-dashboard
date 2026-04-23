import { describe, expect, it } from "vitest";
import { buildUKEnforcementRecords } from "../scrapeUkEnforcement.js";

describe("UK enforcement loader", () => {
  it("builds deterministic db-ready records", () => {
    const records = buildUKEnforcementRecords([
      {
        regulator: "PRA",
        regulatorFullName: "Prudential Regulation Authority",
        sourceDomain: "prudential",
        firmIndividual: "Example Bank Limited",
        firmCategory: "Bank",
        amount: 1000,
        currency: "GBP",
        dateIssued: "2026-01-02",
        breachType: "Example breach",
        breachCategories: ["REPORTING"],
        summary: "Example summary",
        noticeUrl: "https://www.bankofengland.co.uk/example",
        sourceUrl: "https://www.bankofengland.co.uk/example",
        sourceWindowNote: "Test note",
      },
    ]);

    expect(records[0]).toMatchObject({
      regulator: "PRA",
      amountGbp: 1000,
      amountEur: 1180,
      yearIssued: 2026,
      monthIssued: 1,
    });
    expect(records[0].id).toMatch(/^PRA-2026-01-02-example-bank-limited-/);
  });
});

