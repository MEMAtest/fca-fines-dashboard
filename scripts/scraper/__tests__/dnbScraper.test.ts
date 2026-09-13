import { describe, expect, it } from "vitest";
import { extractFineAmount, extractFirmName, transformRecord } from "../scrapeDnb.js";

describe("DNB scraper", () => {
  it("extracts current sitemap-page entities and decoded euro amounts", () => {
    const html = `
      <main id="rs-content">
        <p>DNB imposed an administrative fine of &#x20AC;8.5 million on the firm.</p>
      </main>
    `;
    expect(extractFirmName(
      "Fine for ABN AMRO Bank N.V. for inadequate customer due diligence",
    )).toBe("ABN AMRO Bank N.V.");
    expect(extractFirmName(
      "DNB issued an instruction to trust office BK in 2019",
    )).toBe("trust office BK");
    expect(extractFineAmount("", html)).toBe(8_500_000);
  });

  it("builds a contract-valid record with detail-page evidence", () => {
    const record = transformRecord({
      firm: "ABN AMRO Bank N.V.",
      amount: 480000000,
      currency: "EUR",
      date: "2024-04-19",
      breach: "Serious shortcomings in compliance with anti-money laundering obligations",
      link: "https://www.dnb.nl/en/news/news-2024/dnb-imposes-fine-on-abn-amro/",
      summary: "Major AML compliance failures",
    });

    expect(record.regulator).toBe("DNB");
    expect(record.dateIssued).toBe("2024-04-19");
    expect(record.amountEur).toBe(480000000);
    expect(record.sourceUrl).toContain("dnb.nl/en/news/");
    expect(record.finalNoticeUrl).toBe(record.sourceUrl);
    expect(record.summary).toContain("ABN AMRO Bank N.V.");
  });

  it("keeps notice identity stable when DNB corrects parsed fields", () => {
    const source = {
      firm: "Example Bank N.V.",
      amount: 1_000_000,
      currency: "EUR",
      date: "2026-01-01",
      breach: "Capital requirements",
      link: "https://www.dnb.nl/en/general-news/enforcement-measures-2026/example-notice/",
      summary: "Initial publication",
    };

    const original = transformRecord(source);
    const corrected = transformRecord({
      ...source,
      firm: "Example Bank Nederland N.V.",
      amount: 1_250_000,
      summary: "Corrected publication",
    });

    expect(corrected.contentHash).toBe(original.contentHash);
    expect(corrected.amountEur).toBe(1_250_000);
    expect(corrected.firmIndividual).toBe("Example Bank Nederland N.V.");
  });
});
