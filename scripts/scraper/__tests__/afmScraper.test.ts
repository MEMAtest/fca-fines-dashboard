import { describe, expect, it } from "vitest";
import { transformRecord } from "../scrapeAfm.js";
import { validatePreparedRecords } from "../lib/runScraper.js";

describe("AFM ingestion safety regression", () => {
  it("converts NaN amounts to undisclosed instead of persisting a database NaN", () => {
    const record = transformRecord({
      firm: "consumenten Digitalisering Duurzaamheid Marktmisbru",
      amount: Number.NaN,
      currency: "EUR",
      date: "2026-08-20",
      breach: "Regulatory enforcement",
      link: "https://www.afm.nl/en/news/example",
      summary: "Vodafone Financial Services krijgt boete voor onverantwoorde kredietverstrekking",
    });
    expect(record.amount).toBeNull();
    expect(validatePreparedRecords([record], 1).invalid[0]?.issues.map((issue) => issue.code)).toContain("invalid_entity");
  });

  it("uses an official detail URL as the source evidence for a clean AFM record", () => {
    const record = transformRecord({
      firm: "Example Bank N.V.", amount: 1000, currency: "EUR", date: "2026-08-20",
      breach: "AML controls", link: "https://www.afm.nl/en/news/example", summary: "Official AFM enforcement notice.",
    });
    expect(record.sourceUrl).toBe("https://www.afm.nl/en/news/example");
    expect(validatePreparedRecords([record], 1).valid).toHaveLength(1);
  });
});
