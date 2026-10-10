import { describe, expect, it } from "vitest";
import { extractAmountFromText, parseNumberToken } from "../lib/amountText.js";
import { parseLargestAmountFromText, parseLargestAmountWithReview } from "../lib/euFineHelpers.js";

const NOK = { currency: "NOK", keywords: ["overtredelsesgebyr", "violation penalty", "penalty"] };
const DKK = { currency: "DKK", keywords: ["bøde", "bode", "fine"] };
const ZAR = { currency: "ZAR", symbols: ["R", "ZAR"], keywords: ["penalty", "fine", "administrative penalty", "amount"] };

describe("parseLargestAmountFromText (strict)", () => {
  it("reads a space-grouped krone amount instead of gluing it to other digits (FTNO Atlas)", () => {
    const text = "Finanstilsynet har ilagt Atlas Special Opportunities, LLC, et overtredelsesgebyr på 125 000 kroner for brudd på flaggeplikten. Selskapet meldte for sent en passering av 15 prosentgrensen i Circio Holding ASA";
    expect(parseLargestAmountFromText(text, NOK)).toBe(125000);
  });

  it("does not turn dates into amounts (FTNO Arriba, RH Industri, Borea, Høse)", () => {
    expect(parseLargestAmountFromText("Brev datert 24. april 2023. Vedtak om overtredelsesgebyr 24.04.2023 (pdf)", NOK)).toBeNull();
    expect(parseLargestAmountFromText("Brev datert 7. april 2022. Vedtak om overtredelsesgebyr 07.04.2022 (pdf)", NOK)).toBeNull();
    expect(parseLargestAmountFromText("Vedtak om overtredelsesgebyr 3. oktober 2023 (pdf)", NOK)).toBeNull();
    expect(parseLargestAmountFromText("Vedtak datert 29. september 2025. Vedtak om overtredelsesgebyr - Borea Asset Management AS (pdf)", NOK)).toBeNull();
    expect(parseLargestAmountFromText("Decision regarding violation penalty June 23 2023 (pdf)", NOK)).toBeNull();
    expect(parseLargestAmountFromText("Decision regarding violation penalty June 19 2023 (pdf)", NOK)).toBeNull();
  });

  it("ignores prison days and case numbers (FTDK, CMVM)", () => {
    expect(parseLargestAmountFromText("Personen er blevet idømt 40 dages fængsel. Bøde 60 dage", DKK)).toBeNull();
    expect(parseLargestAmountFromText("Sagen blev afgjort i juni 2023. Bøde 30", DKK)).toBeNull();
    expect(parseLargestAmountFromText("Processo de Contra-ordenação n.º 39/2000 coima 43", { currency: "EUR", symbols: ["€"], keywords: ["coima"] })).toBeNull();
  });

  it("supports locale formats", () => {
    expect(parseLargestAmountFromText("bøde på 1.234.567,89 kr", DKK)).toBe(1234567.89);
    expect(parseLargestAmountFromText("fine of EUR 1,234,567.89", { currency: "EUR", symbols: ["€"] })).toBe(1234567.89);
    expect(parseLargestAmountFromText("et overtredelsesgebyr på kr 2,5 millioner", NOK)).toBe(2500000);
    expect(parseLargestAmountFromText("Administrative penalty of R1.2 million", ZAR)).toBe(1200000);
    expect(parseLargestAmountFromText("Administrative penalty R50 000 (inclusive of costs)", ZAR)).toBe(50000);
    expect(parseLargestAmountFromText("a fine of 6.175 million euros", { currency: "EUR", symbols: ["€"] })).toBe(6175000);
    expect(parseLargestAmountFromText("Administrative penalty of R2 billion rand", ZAR)).toBe(2e9);
  });

  it("rejects statutory maxima and ceilings", () => {
    expect(parseLargestAmountFromText("Overtredelsesgebyr kan være inntil 25 000 000 kroner", NOK)).toBeNull();
    expect(parseLargestAmountFromText("Diese beträgt maximal EUR 2,5 Millionen", { currency: "EUR", symbols: ["€"], keywords: ["geldbuße"] })).toBeNull();
    expect(parseLargestAmountFromText("fine of up to £5 million", { currency: "GBP", symbols: ["£"] })).toBeNull();
    expect(parseLargestAmountFromText("bøde op til 5.000.000 kr", DKK)).toBeNull();
    expect(parseLargestAmountFromText("bis zu 10 Mio. Euro Geldbuße", { currency: "EUR", symbols: ["€"], keywords: ["geldbuße"] })).toBeNull();
    expect(parseLargestAmountFromText("maks 3 000 000 kroner. Overtredelsesgebyr på 200 000 kroner", NOK)).toBe(200000);
  });

  it("refuses a grouped digit run followed by a magnitude word as ambiguous (FSCA)", () => {
    for (const text of [
      "My Wealth Method (Pty) Ltd: Administrative penalty R58 793 075 million (inclusive of costs).",
      "Mr Nicolaas Van Dyk: R4 080 000 million administrative penalty.",
      "Mr Nicolaas Van Dyk: R1 777 500 million administrative penalty.",
    ]) {
      const result = extractAmountFromText(text, ZAR);
      expect(result.amount).toBeNull();
      expect(result.ambiguous).toBe(true);
      expect(parseLargestAmountFromText(text, ZAR)).toBeNull();
    }
    expect(parseLargestAmountWithReview("Administrative penalty R58 793 075 million", ZAR).reviewReason).toMatch(/ambiguous/);
    expect(parseLargestAmountWithReview("Administrative penalty R50 000", ZAR).reviewReason).toBeNull();
  });

  it("does not take section numbers as amounts", () => {
    expect(parseLargestAmountFromText("Moselane Mahlangu: Debarment Order. In terms of section 153(1)(a) of the Financial Sector Regulation Act No. 9 of 2017", ZAR)).toBeNull();
  });

  it("parses number tokens", () => {
    expect(parseNumberToken("105.934", false).value).toBe(105934);
    expect(parseNumberToken("1 234,5", false).value).toBe(1234.5);
  });
});

describe("Indian grouping", () => {
  it("reads lakh-style grouping", () => {
    expect(parseLargestAmountFromText("a penalty of INR 5,00,000 was imposed", { currency: "INR", symbols: ["Rs.", "₹"] })).toBe(500000);
  });
});

describe("adjacent amounts", () => {
  it("does not read the currency symbol of the next number as a post-marker", () => {
    const text = "Section 76 of the Securities Services Act, 34 of 2004 R4 080 000 million administrative penalty.";
    expect(parseLargestAmountFromText(text, ZAR)).toBeNull();
    expect(parseLargestAmountFromText("Securities Services Act, 34 of 2004 R750 000 administrative penalty", ZAR)).toBe(750000);
  });

  it("ignores Norwegian 'opptil' ceilings (FTNO Titan Venture)", () => {
    const text = "kan ilegge foretak overtredelsesgebyr på opptil 43 millioner kroner, eller opptil 10 prosent. Finanstilsynet ilegger Titan Venture AS et overtredelsesgebyr på NOK 1 000 000 for overtredelse";
    expect(parseLargestAmountFromText(text, NOK)).toBe(1000000);
  });

  it("excludes confiscation figures (FTDK)", () => {
    const opts = { ...DKK, excludeContext: ["konfisker"] };
    expect(parseLargestAmountFromText("Personen blev idømt 60 dages ubetinget fængsel og fik konfiskeret ca. 7.300 kr.", opts)).toBeNull();
    expect(parseLargestAmountFromText("selskabet blev idømt en bøde på 70.000 kr. Den fysiske person blev idømt 30 dages fængsel", opts)).toBe(70000);
  });
});
