import { describe, expect, it } from "vitest";
import {
  COUNTRIES,
  getCountryByIso2,
  resolveCountry,
  countrySlug,
  flagEmoji,
} from "./countries";
import {
  FATF_STATUS,
  FATF_RECENT_CHANGES,
  getFatfStatus,
  isFatfListed,
  fatfListedIso2,
} from "./fatfStatus";

describe("countries reference", () => {
  it("has unique ISO2 and ISO3 codes", () => {
    const iso2 = new Set(COUNTRIES.map((c) => c.iso2));
    const iso3 = new Set(COUNTRIES.map((c) => c.iso3));
    expect(iso2.size).toBe(COUNTRIES.length);
    expect(iso3.size).toBe(COUNTRIES.length);
  });

  it("uses valid ISO2 (2 letters) and ISO3 (3 letters)", () => {
    for (const c of COUNTRIES) {
      expect(c.iso2).toMatch(/^[A-Z]{2}$/);
      expect(c.iso3).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("every parent reference resolves to a known country", () => {
    for (const c of COUNTRIES) {
      if (c.parent) expect(getCountryByIso2(c.parent)).toBeDefined();
    }
  });

  it("resolves cross-source name variants to the right country", () => {
    const cases: Array<[string, string]> = [
      ["Korea, Dem. People's Rep.", "KP"],
      ["Democratic People's Republic of Korea", "KP"],
      ["Iran, Islamic Rep.", "IR"],
      ["Burma", "MM"],
      ["Turkey", "TR"],
      ["Cote d'Ivoire", "CI"],
      ["GBR", "GB"],
      ["de", "DE"],
      ["West Bank and Gaza", "PS"],
      ["Congo, Dem. Rep.", "CD"],
    ];
    for (const [token, iso2] of cases) {
      expect(resolveCountry(token)?.iso2, token).toBe(iso2);
    }
  });

  it("returns undefined for the EU pseudo-code and junk", () => {
    expect(resolveCountry("EU")).toBeUndefined();
    expect(resolveCountry("")).toBeUndefined();
    expect(resolveCountry("Narnia")).toBeUndefined();
  });

  it("produces clean ASCII slugs (strips diacritics)", () => {
    expect(countrySlug(resolveCountry("CI")!)).toBe("cote-d-ivoire");
    expect(countrySlug(resolveCountry("TR")!)).toBe("turkiye");
    expect(countrySlug(getCountryByIso2("NG")!)).toBe("nigeria");
  });

  it("computes flag emoji from ISO2", () => {
    expect(flagEmoji("NG")).toBe("🇳🇬");
    expect(flagEmoji("GB")).toBe("🇬🇧");
  });
});

describe("FATF status data", () => {
  it("has 3 black-list and 22 grey-list jurisdictions (Jun 2026 plenary)", () => {
    const black = FATF_STATUS.filter((s) => s.listing === "call-for-action");
    const grey = FATF_STATUS.filter((s) => s.listing === "increased-monitoring");
    expect(black.length).toBe(3);
    expect(grey.length).toBe(22);
  });

  it("black list is exactly Iran, North Korea, Myanmar", () => {
    const black = FATF_STATUS.filter((s) => s.listing === "call-for-action")
      .map((s) => s.iso2)
      .sort();
    expect(black).toEqual(["IR", "KP", "MM"]);
  });

  it("every FATF-listed ISO2 resolves to a real country", () => {
    for (const s of FATF_STATUS) {
      expect(getCountryByIso2(s.iso2), s.iso2).toBeDefined();
    }
  });

  it("has no duplicate FATF entries", () => {
    const codes = new Set(FATF_STATUS.map((s) => s.iso2));
    expect(codes.size).toBe(FATF_STATUS.length);
  });

  it("recent changes reference valid countries", () => {
    for (const ch of FATF_RECENT_CHANGES) {
      expect(getCountryByIso2(ch.iso2), ch.iso2).toBeDefined();
    }
  });

  it("removed countries (Algeria, Namibia) are NOT in the current listed set", () => {
    expect(isFatfListed("DZ")).toBe(false);
    expect(isFatfListed("NA")).toBe(false);
  });

  it("newly-added countries (Iraq, Bosnia) are currently grey-listed with a since date", () => {
    for (const iso2 of ["IQ", "BA"]) {
      const s = getFatfStatus(iso2);
      expect(s?.listing).toBe("increased-monitoring");
      expect(s?.since).toBe("2026-06-19");
    }
  });

  it("fatfListedIso2 returns all 25 codes", () => {
    expect(fatfListedIso2().length).toBe(25);
  });
});
