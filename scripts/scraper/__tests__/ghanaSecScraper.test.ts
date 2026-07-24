import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildGhanaSecPenaltyRecord,
  buildGhanaSecRecords,
  categorizeGhanaSecStatus,
  parseGhanaSecDate,
  parseGhanaSecHtml,
  parseGhanaSecNewsletterPdfUrl,
  parseGhanaSecPenaltyText,
  parseLatestGhanaSecNewsletterUrl,
  quarterEndDateFromNewsletterUrl,
} from "../scrapeGhanaSec.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const html = readFileSync(join(FIXTURE_DIR, "ghana-sec-sample.html"), "utf8");
const newsHtml = readFileSync(
  join(FIXTURE_DIR, "ghana-sec-news-current-sample.html"),
  "utf8",
);
const newsletterHtml = readFileSync(
  join(FIXTURE_DIR, "ghana-sec-newsletter-current-sample.html"),
  "utf8",
);
const penaltyText = readFileSync(
  join(FIXTURE_DIR, "ghana-sec-penalties-q1-2026.txt"),
  "utf8",
);

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

  it("discovers the current official newsletter and its PDF", () => {
    const newsletterUrl = parseLatestGhanaSecNewsletterUrl(newsHtml);
    expect(newsletterUrl).toBe(
      "https://sec.gov.gh/sec-newsletter-2026-first-quarter-edition/",
    );
    expect(parseGhanaSecNewsletterPdfUrl(newsletterHtml, newsletterUrl!)).toBe(
      "https://sec.gov.gh/wp-content/uploads/SEC-Quarterly-Newsletters/First-Quarter-2026.pdf",
    );
    expect(
      quarterEndDateFromNewsletterUrl(
        "https://sec.gov.gh/wp-content/uploads/SEC-Quarterly-Newsletters/First-Quarter-2026.pdf",
      ),
    ).toBe("2026-03-31");
  });

  it("parses and hashes current quarterly penalties idempotently", () => {
    const newsletterUrl =
      "https://sec.gov.gh/sec-newsletter-2026-first-quarter-edition/";
    const pdfUrl =
      "https://sec.gov.gh/wp-content/uploads/SEC-Quarterly-Newsletters/First-Quarter-2026.pdf";
    const rows = parseGhanaSecPenaltyText(
      penaltyText,
      newsletterUrl,
      pdfUrl,
    );
    expect(rows).toEqual([
      expect.objectContaining({
        company: "First Atlantic Asset Management Co. Limited",
        infringement:
          "Late notification of resignation of a licensed representative.",
        amount: 3600,
        dateIssued: "2026-03-31",
      }),
      expect.objectContaining({
        company: "First Finance Company Ltd",
        amount: 3600,
      }),
      expect.objectContaining({
        company: "Orialles Capital Ltd",
        infringement: "Late submission of Q4 2025 Financial Statements",
        amount: 700,
      }),
    ]);

    const first = buildGhanaSecPenaltyRecord(rows[0]);
    const repeated = buildGhanaSecPenaltyRecord(rows[0]);
    expect(first.contentHash).toBe(repeated.contentHash);
    expect(first).toMatchObject({
      regulator: "GHSEC",
      amount: 3600,
      currency: "GHS",
      dateIssued: "2026-03-31",
    });
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
