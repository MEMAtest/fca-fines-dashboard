import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseFicSanctionText } from "../lib/ficSanctionText.js";
import {
  buildFicRecord,
  buildFicRow,
  buildFicSummary,
  classifySupervisoryDocument,
  collapseDuplicateNotices,
  extractFicEntityName,
  extractionFromSnapshot,
  extractionFromText,
  hasUsableTextLayer,
  isAmendedTitle,
  resolveFicDecisionDate,
  toFicDocument,
  type FicDocument,
  type FicExtraction,
} from "../scrapeFic.js";
import { FIC_SCANNED_EXTRACTIONS } from "../data/ficScannedExtractions.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const read = (name: string) => readFileSync(join(dir, name), "utf8");
const wp = JSON.parse(read("fic-wp-documents-sample.json"));

describe("FIC notice parsing", () => {
  it("reads a Directive 6 fine: the imposed fine, not the reduced early-compliance amount", () => {
    const parsed = parseFicSanctionText(read("fic-notice-directive6-text.txt"));
    expect(parsed.amount).toBe(50_000);
    expect(parsed.reducedAmount).toBe(10_000);
    expect(parsed.suspendedAmount).toBeNull();
    expect(parsed.actions).toContain("financial_penalty");
    expect(parsed.provisions.some((p) => p.includes("Directive 6 of 2023"))).toBe(true);
  });

  it("sums a multi-count penalty and derives the suspended portion that reconciles with the payable part", () => {
    const parsed = parseFicSanctionText(read("fic-notice-kia-text.txt"));
    // R357,383.00 (27 cash threshold counts) + R17,745.00 (1 count) = R375,128; ZAR scale in whole rand.
    expect(parsed.amount).toBe(375_128);
    expect(parsed.suspendedAmount).toBe(277_055);
    expect(parsed.actions).toEqual(expect.arrayContaining(["financial_penalty", "reprimand"]));
    expect(parsed.provisions.some((p) => p.includes("section 28 (cash threshold reporting)"))).toBe(true);
    expect(parsed.issues).toEqual([]);
  });

  it("reads OCR text with spaced thousands separators and a 'calculated as follows' breakdown", () => {
    const arthlene = parseFicSanctionText(read("fic-notice-arthlene-ocr.txt"));
    expect(arthlene.amount).toBe(68_659);
    expect(arthlene.suspendedAmount).toBe(34_329.5);
    const hydePark = parseFicSanctionText(read("fic-notice-hydepark-ocr.txt"));
    expect(hydePark.amount).toBe(5_244_758);
  });

  it("repairs OCR digit confusions inside rand amounts", () => {
    const parsed = parseFicSanctionText(
      "the Centre hereby imposes a financial penalty on Tom Campher Motors in the amount of R6O, 100.00 for failing to comply on 4 counts with section 28(b) of the FIC Act",
    );
    expect(parsed.amount).toBe(60_100);
  });

  it("keeps a caution/reprimand-only notice as non-monetary (amount null)", () => {
    const parsed = parseFicSanctionText(
      "1. In terms of section 45C(3)(a) of the Financial Intelligence Centre Act 38 of 2001 (FIC Act), the Centre hereby cautions TNKR Attorneys to not repeat the conduct that led to the non-compliance. 2. In terms of section 45C(3)(b) the Centre hereby reprimands TNKR Attorneys. Signed at Centurion on this the 26th day of August 2024.",
    );
    expect(parsed.amount).toBeNull();
    expect(parsed.actions).toEqual(expect.arrayContaining(["caution", "reprimand"]));
    expect(parsed.actions).not.toContain("financial_penalty");
    expect(parsed.signedDate).toBe("2024-08-26");
  });

  it("withholds the amount when the notice's own figures disagree", () => {
    const parsed = parseFicSanctionText(
      "the Centre hereby imposes a financial penalty on X in the amount of R100 000 for failing to comply. The total financial penalty of R150 000 was calculated across all counts.",
    );
    expect(parsed.amount).toBeNull();
    expect(parsed.issues.length).toBeGreaterThan(0);
  });

  it("uses the Annexure A signing date, with a month-only fallback when the day was left blank", () => {
    expect(parseFicSanctionText("Signed at Centurion on this the 26th day of August 2024.").signedDate).toBe("2024-08-26");
    const blank = parseFicSanctionText("Signed at Centurion on this the ______ day of October 2021.");
    expect(blank.signedDate).toBeNull();
    expect(blank.signedMonth).toBe("2021-10");
  });
});

describe("FIC titles and documents", () => {
  it("extracts the sanctioned entity, never the document title", () => {
    expect(extractFicEntityName("Notice of sanction &#8211; JJ SMIT ATTORNEYS")).toBe("Jj Smit Attorneys");
    expect(extractFicEntityName("Administrative sanction &#8211; Randwell Trading and Investment (Pty) Ltd")).toBe("Randwell Trading and Investment (Pty) Ltd");
    expect(extractFicEntityName("Amended administrative sanction &#8211; La Nouvelle trading as Afrokwazi")).toBe("La Nouvelle trading as Afrokwazi");
    expect(extractFicEntityName("FIC &#8211; Admininstrative Sanction- Langlaagte Truck and Car")).toBe("Langlaagte Truck and Car");
    expect(extractFicEntityName("Administrative sanction &#8211; Ramnanan &#038; Van Breda")).toBe("Ramnanan & Van Breda");
    expect(isAmendedTitle("Amended administrative sanction &#8211; Tracy Harris Properties CC")).toBe(true);
    expect(isAmendedTitle("Administrative sanction &#8211; Furnfin")).toBe(false);
  });

  it("maps WordPress REST entries to documents with the publication date kept separate", () => {
    const doc = toFicDocument(wp[0])!;
    expect(doc).toMatchObject({ id: 17830, publishedDate: "2026-08-28" });
    expect(doc.downloadUrl).toMatch(/\.pdf$/);
    expect(toFicDocument({ ...wp[0], download_url: undefined })).toBeNull();
  });

  it("detects scanned PDFs (stamp-only text layer) so they use the reviewed snapshot", () => {
    expect(hasUsableTextLayer(" Original signed and accepted by the institution's representative on 8 December 2025.")).toBe(false);
    expect(hasUsableTextLayer(read("fic-notice-directive6-text.txt"))).toBe(true);
  });

  it("ships a reviewed snapshot keyed by document URL, with no fabricated amounts", () => {
    const entries = Object.entries(FIC_SCANNED_EXTRACTIONS);
    expect(entries.length).toBeGreaterThan(150);
    expect(entries.every(([url]) => url.startsWith("https://www.fic.gov.za/wp-content/uploads/"))).toBe(true);
    expect(entries.every(([, e]) => e.amount === null || e.amount >= 1_000)).toBe(true);
    expect(extractionFromSnapshot("https://example.com/none.pdf")).toBeNull();
  });
});

const doc = (id: number, title: string, publishedDate: string): FicDocument => ({
  id, title, publishedDate, pageUrl: `https://www.fic.gov.za/document/${id}/`, downloadUrl: `https://www.fic.gov.za/wp-content/uploads/${id}.pdf`,
});
const extraction = (over: Partial<FicExtraction> = {}): FicExtraction => ({
  source: "pdf_text", confidence: "text_layer", signedDate: null, signedMonth: null, amount: 50_000, suspendedAmount: null,
  reducedAmount: null, actions: ["financial_penalty", "directive"], provisions: [], warnings: [], ...over,
});

describe("FIC records", () => {
  it("dates records by signing date, not publication date, and records the basis", () => {
    expect(resolveFicDecisionDate({ signedDate: "2024-08-26", signedMonth: null }, "2024-09-30")).toEqual({ date: "2024-08-26", basis: "signed_date" });
    expect(resolveFicDecisionDate({ signedDate: null, signedMonth: "2021-10" }, "2021-11-02")).toEqual({ date: "2021-10-01", basis: "signed_month" });
    expect(resolveFicDecisionDate({ signedDate: null, signedMonth: null }, "2021-11-02")).toEqual({ date: "2021-11-02", basis: "published_date" });
    // An implausible signing date (after publication) is ignored.
    expect(resolveFicDecisionDate({ signedDate: "2030-01-01", signedMonth: null }, "2021-11-02").basis).toBe("published_date");
  });

  it("builds an English summary from structured fields and a ZAR record with GBP/EUR", () => {
    const row = buildFicRow(doc(1, "Notice of sanction &#8211; Acme Attorneys", "2026-01-08"), extraction({ signedDate: "2025-12-11", suspendedAmount: 15_000, amount: 25_000, reducedAmount: 10_000 }));
    const record = buildFicRecord(row);
    expect(record).toMatchObject({ regulator: "FIC", countryCode: "ZA", currency: "ZAR", amount: 25_000, dateIssued: "2025-12-11", firmIndividual: "Acme Attorneys" });
    expect(record.amountGbp).toBeCloseTo(25_000 * 0.043, 0);
    expect(record.summary).toContain("financial penalty of R25 000 (R15 000 suspended on conditions)");
    expect(record.finalNoticeUrl).toBe("https://www.fic.gov.za/wp-content/uploads/1.pdf");
    expect(JSON.parse(record.rawPayload).dateBasis).toBe("signed_date");
  });

  it("states plainly when a penalty amount could not be read, never showing zero", () => {
    const row = buildFicRow(doc(2, "FIC &#8211; Scanned Motors", "2019-03-01"), extraction({ amount: null }));
    const record = buildFicRecord(row);
    expect(record.amount).toBeNull();
    expect(record.summary).toContain("could not be reliably read");
    expect(buildFicSummary("X", extraction({ amount: null, actions: ["caution"] }), false)).toContain("a caution not to repeat the conduct");
  });

  it("collapses a notice uploaded twice but never two different penalties", () => {
    const a = buildFicRow(doc(10, "FIC &#8211; Autocare car sales", "2018-11-23"), extraction({ amount: 113_440, signedDate: "2018-11-20" }));
    const b = buildFicRow(doc(11, "FIC &#8211; AUTOCARE CAR SALES", "2018-11-23"), extraction({ amount: 113_440, signedDate: "2018-11-20" }));
    const other = buildFicRow(doc(12, "FIC &#8211; Autocare car sales", "2019-05-02"), extraction({ amount: 113_440, signedDate: "2019-04-30" }));
    const different = buildFicRow(doc(13, "FIC &#8211; Autocare car sales", "2018-11-23"), extraction({ amount: 90_000, signedDate: "2018-11-20" }));
    const { rows, collapsed } = collapseDuplicateNotices([a, b, other, different]);
    expect(collapsed).toBe(1);
    expect(rows.map((r) => r.doc.id).sort()).toEqual([10, 12, 13]);
    expect(rows.find((r) => r.doc.id === 10)?.duplicateDocIds).toEqual([11]);
  });

  it("keys each record on its document so same name, date and amount stay distinct", () => {
    const one = buildFicRecord(buildFicRow(doc(20, "Administrative sanction &#8211; Twin Co", "2025-05-05"), extraction({ signedDate: "2025-05-01", actions: ["financial_penalty"] })));
    const two = buildFicRecord(buildFicRow(doc(21, "Administrative sanction &#8211; Twin Co", "2025-05-05"), extraction({ signedDate: "2025-05-01", actions: ["financial_penalty", "caution"] })));
    expect(one.contentHash).not.toBe(two.contentHash);
    // ...and a corrected amount on the same document updates the same row.
    const corrected = buildFicRecord(buildFicRow(doc(20, "Administrative sanction &#8211; Twin Co", "2025-05-05"), extraction({ signedDate: "2025-05-01", actions: ["financial_penalty"], amount: 60_000 })));
    expect(corrected.contentHash).toBe(one.contentHash);
  });

  it("reads the real text-layer fixture end to end", () => {
    const parsed = extractionFromText(read("fic-notice-kia-text.txt"));
    expect(parsed.source).toBe("pdf_text");
    expect(parsed.amount).toBe(375_128);
  });
});

describe("FIC supervisory-body documents are left to their issuing regulators", () => {
  it("classifies re-published sanctions by the issuing body named in the title", () => {
    expect(classifySupervisoryDocument("Prudential Authority &#8211; Administrative sanctions on HBZ Bank Limited")).toEqual({ issuer: "PA", subject: "HBZ Bank Limited" });
    expect(classifySupervisoryDocument("FSCA &#8211; Administrative sanction Sasfin")).toEqual({ issuer: "FSCA", subject: "Sasfin" });
    expect(classifySupervisoryDocument("SARB &#8211; Administrative sanctions on banks").issuer).toBe("SARB_OTHER");
    expect(classifySupervisoryDocument("Something else").issuer).toBe("UNKNOWN");
  });
});
