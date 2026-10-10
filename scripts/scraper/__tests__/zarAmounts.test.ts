import { describe, expect, it } from "vitest";
import { normalizeZarSpacing, parseZarAmounts, parseZarWordsAmount, wordsToNumber } from "../lib/zarAmounts.js";

const first = (text: string) => parseZarAmounts(text)[0]?.amount ?? null;

describe("ZAR amount scale", () => {
  it("reads space-grouped thousands as whole rand", () => {
    expect(first("A financial penalty of R500 000")).toBe(500_000);
    expect(first("penalty of R9 689 390, R4 844 695 is payable")).toBe(9_689_390);
    expect(first("Penalty of R1 387 719.15 (One million ...)")).toBe(1_387_719.15);
    expect(first("R 117 500")).toBe(117_500);
  });

  it("reads comma-grouped thousands as whole rand, not decimals", () => {
    expect(first("administrative penalty of R300,000")).toBe(300_000);
    expect(first("A total administrative penalty of R 924,311")).toBe(924_311);
    expect(first("an amount of R357, 383.00 for failing")).toBe(357_383);
  });

  it("reads decimal-million shorthand at million scale (R5.250 million is 5,250,000, not 5,250)", () => {
    expect(first("A financial penalty of R5.250 million")).toBe(5_250_000);
    expect(first("A financial penalty of R 10.730 million, three cautions")).toBe(10_730_000);
    expect(first("A financial penalty of R 56.25 million")).toBe(56_250_000);
    expect(first("A financial penalty of R2.5 million and a directive")).toBe(2_500_000);
    expect(first("R1,5 million")).toBe(1_500_000);
    expect(first("a financial penalty of R10 million")).toBe(10_000_000);
  });

  it("returns every amount in reading order", () => {
    const amounts = parseZarAmounts("R7.5 million of the R30 million financial penalty is suspended").map((m) => m.amount);
    expect(amounts).toEqual([7_500_000, 30_000_000]);
  });

  it("repairs OCR-style spacing after thousands commas", () => {
    expect(normalizeZarSpacing("R1, 035, 654.00")).toBe("R1,035,654.00");
    expect(first("R1, 035, 654.00")).toBe(1_035_654);
  });

  it("parses amounts written in words", () => {
    expect(wordsToNumber("seven hundred and twenty-six thousand")).toBe(726_000);
    expect(wordsToNumber("one million, four hundred and twenty-six thousand, five hundred and twenty-four")).toBe(1_426_524);
    expect(wordsToNumber("nine hundred and fifty-two thousand, four hundred and thirty-two")).toBe(952_432);
    expect(parseZarWordsAmount("Penalty of two million, five hundred and ninety-eight thousand, eight hundred rand payable")).toBe(2_598_800);
    expect(parseZarWordsAmount("Penalty of one million and twenty-two thousand and twenty-two rands payable")).toBe(1_022_022);
  });

  it("refuses a half-understood phrase rather than guessing", () => {
    expect(wordsToNumber("two million banana")).toBeNull();
  });
});

describe("ZAR amounts never absorb neighbouring numbers", () => {
  it("does not join a following year or number onto the amount", () => {
    expect(first("R100 000 2019")).toBe(100_000);
    expect(first("penalty of R100 000 2019 was imposed")).toBe(100_000);
    expect(first("R7 772 000 (seven million, seven hundred and seventy-two thousand rand)")).toBe(7_772_000);
    expect(first("R9 689 390, R4 844 695")).toBe(9_689_390);
  });

  it("refuses an ambiguous run of groups instead of inventing a 500-billion amount", () => {
    expect(parseZarAmounts("R 500 000 150 000")).toEqual([]);
  });
});
