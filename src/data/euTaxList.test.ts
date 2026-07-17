import { describe, expect, it } from "vitest";
import { getCountryByIso2 } from "./countries.js";
import {
  EU_TAX_LIST,
  EU_TAX_LIST_REVIEWED,
  EU_TAX_LIST_SOURCE_URL,
  euTaxListedIso2,
  isEuTaxListed,
} from "./euTaxList.js";

describe("EU list of non-cooperative jurisdictions (Annex I)", () => {
  it("holds the 10 jurisdictions from the 17 Feb 2026 Council update", () => {
    // Council wording (17 Feb 2026): American Samoa, Anguilla, Guam, Palau,
    // Panama, the Russian Federation, Turks and Caicos, US Virgin Islands,
    // Vanuatu and Viet Nam.
    expect(EU_TAX_LIST.length).toBe(10);
  });

  it("resolves every listed ISO2 against countries.ts", () => {
    for (const entry of EU_TAX_LIST) {
      const country = getCountryByIso2(entry.iso2);
      expect(country, entry.iso2).toBeTruthy();
    }
  });

  it("spot-checks known listed jurisdictions (verified against the Council list)", () => {
    // Panama and Russia ARE on the tax blacklist per the 17 Feb 2026 update.
    expect(isEuTaxListed("PA")).toBe(true); // Panama
    expect(isEuTaxListed("RU")).toBe(true); // Russia
    expect(isEuTaxListed("VN")).toBe(true); // Vietnam (added Feb 2026)
    expect(isEuTaxListed("TC")).toBe(true); // Turks and Caicos (added Feb 2026)
    expect(isEuTaxListed("VU")).toBe(true); // Vanuatu
  });

  it("spot-checks jurisdictions NOT on the list", () => {
    // Removed at the Feb 2026 update:
    expect(isEuTaxListed("FJ")).toBe(false); // Fiji (removed)
    expect(isEuTaxListed("WS")).toBe(false); // Samoa (removed)
    expect(isEuTaxListed("TT")).toBe(false); // Trinidad and Tobago (removed)
    // Never listed:
    expect(isEuTaxListed("GB")).toBe(false);
    expect(isEuTaxListed("US")).toBe(false);
    expect(isEuTaxListed("DE")).toBe(false);
  });

  it("is case-insensitive on the ISO2 lookup", () => {
    expect(isEuTaxListed("pa")).toBe(true);
    expect(isEuTaxListed("ru")).toBe(true);
  });

  it("exposes a de-duplicated ISO2 list matching the entries", () => {
    const iso2s = euTaxListedIso2();
    expect(iso2s.length).toBe(EU_TAX_LIST.length);
    expect(new Set(iso2s).size).toBe(iso2s.length);
  });

  it("carries a reviewed date and a Council source URL", () => {
    expect(EU_TAX_LIST_REVIEWED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(EU_TAX_LIST_SOURCE_URL).toMatch(/^https:\/\/www\.consilium\.europa\.eu\//);
  });
});
