import { describe, expect, it } from "vitest";
import {
  extractMentionedIso2,
  diffFatfStatus,
  formatFatfDiff,
} from "../../scripts/lib/fatfVerify.js";
import { FATF_STATUS, type FatfStatus } from "../../src/data/fatfStatus.js";

const curatedBlack = () =>
  FATF_STATUS.filter((s) => s.listing === "call-for-action").map((s) => s.iso2);
const curatedGrey = () =>
  FATF_STATUS.filter((s) => s.listing === "increased-monitoring").map((s) => s.iso2);

describe("extractMentionedIso2", () => {
  it("resolves country names in a text blob to ISO2 codes", () => {
    const text =
      "The FATF calls for action on Iran and Myanmar. Under increased monitoring: " +
      "Democratic Republic of the Congo, Bosnia and Herzegovina, Côte d'Ivoire and Yemen.";
    const found = extractMentionedIso2(text);
    for (const iso2 of ["IR", "MM", "CD", "BA", "CI", "YE"]) {
      expect(found.has(iso2), iso2).toBe(true);
    }
  });

  it("returns empty for text with no country names", () => {
    expect(extractMentionedIso2("no jurisdictions listed here").size).toBe(0);
  });
});

describe("diffFatfStatus", () => {
  it("reports in-sync when live sets match the curated data", () => {
    const diff = diffFatfStatus(new Set(curatedBlack()), new Set(curatedGrey()));
    expect(diff.inSync).toBe(true);
    expect(formatFatfDiff(diff)).toContain("in sync");
  });

  it("detects a grey-list addition and removal (simulated plenary)", () => {
    const grey = new Set(curatedGrey());
    grey.delete("IQ"); // Iraq de-listed
    grey.add("NG"); // Nigeria added
    const diff = diffFatfStatus(new Set(curatedBlack()), grey);
    expect(diff.inSync).toBe(false);
    expect(diff.addedToGrey).toContain("NG");
    expect(diff.removedFromGrey).toContain("IQ");
    expect(diff.addedToBlack).toEqual([]);
    expect(formatFatfDiff(diff)).toContain("drift detected");
  });

  it("detects a black-list change", () => {
    const black = new Set(curatedBlack());
    black.delete("MM"); // Myanmar de-listed (hypothetical)
    const diff = diffFatfStatus(black, new Set(curatedGrey()));
    expect(diff.removedFromBlack).toContain("MM");
    expect(diff.inSync).toBe(false);
  });

  it("accepts an explicit curated override", () => {
    const curated: FatfStatus[] = [
      { iso2: "IR", listing: "call-for-action", lastReviewed: "2026-06-19" },
      { iso2: "KE", listing: "increased-monitoring", lastReviewed: "2026-06-19" },
    ];
    const diff = diffFatfStatus(new Set(["IR"]), new Set(["KE"]), curated);
    expect(diff.inSync).toBe(true);
  });
});
