import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("keeps title fallbacks and remediation restores out of the live path", () => {
    const title = "Instruction issued to Euronext Amsterdam for breach of open";
    const record = transformRecord({
      firm: title, amount: null, currency: "EUR", date: "2026-08-20",
      breach: "Instruction", link: "https://www.afm.nl/en/news/example", summary: title,
    });
    expect(validatePreparedRecords([record], 1).invalid[0]?.issues.map((issue) => issue.code)).toContain("invalid_entity");

    const remediation = readFileSync(resolve(process.cwd(), "scripts/corrections/remediateAfmMalformedRows.ts"), "utf8");
    expect(remediation).toContain("INSERT INTO public.eu_fines (");
    expect(remediation).toContain("id, content_hash, regulator");
    expect(remediation).toContain("NULLIF(NULLIF(row_data->>'amount',''),'NaN')::numeric");
    expect(remediation).toContain("NULLIF(NULLIF(row_data->>'amount_eur',''),'NaN')::numeric");
    expect(remediation).toContain("NULLIF(NULLIF(row_data->>'amount_gbp',''),'NaN')::numeric");
    expect(remediation).not.toMatch(/async function main\(\)\s*\{\s*await sql`\s*CREATE TABLE/);
    const migration = readFileSync(resolve(process.cwd(), "migrations/20260825_ingestion_safety_v2.sql"), "utf8");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.afm_malformed_row_backup");
    expect(migration).toMatch(/eu_fines_amount_not_nan[\s\S]*CHECK \(amount IS NULL OR amount::text <> 'NaN'\) NOT VALID/);
    expect(migration).toContain("eu_fines_amount_eur_not_nan");
    expect(migration).toContain("eu_fines_amount_gbp_not_nan");
  });
});
