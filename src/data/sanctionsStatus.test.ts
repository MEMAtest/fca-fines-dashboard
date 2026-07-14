import { describe, expect, it } from "vitest";
import { getCountryByIso2 } from "./countries.js";
import {
  SANCTIONS_STATUS,
  getSanctions,
  isSanctioned,
  highestSanctionsTier,
  sanctionsImposers,
} from "./sanctionsStatus.js";

describe("sanctions status data", () => {
  it("every sanctioned ISO2 resolves to a real country", () => {
    for (const s of SANCTIONS_STATUS) {
      expect(getCountryByIso2(s.iso2), s.iso2).toBeDefined();
    }
  });

  it("has no duplicate country entries", () => {
    const codes = new Set(SANCTIONS_STATUS.map((s) => s.iso2));
    expect(codes.size).toBe(SANCTIONS_STATUS.length);
  });

  it("every programme has an imposer, tier, name and source", () => {
    for (const s of SANCTIONS_STATUS) {
      expect(s.programs.length).toBeGreaterThan(0);
      for (const prog of s.programs) {
        expect(["OFAC", "UK", "EU", "UN"]).toContain(prog.imposer);
        expect(["comprehensive", "sectoral", "targeted"]).toContain(prog.tier);
        expect(prog.program.length).toBeGreaterThan(0);
        expect(prog.sourceUrl).toMatch(/^https:\/\//);
      }
    }
  });

  it("classifies comprehensive embargoes (Cuba, Iran, North Korea, Syria)", () => {
    for (const iso2 of ["CU", "IR", "KP", "SY"]) {
      expect(highestSanctionsTier(iso2), iso2).toBe("comprehensive");
    }
  });

  it("classifies Russia as sectoral (not comprehensive)", () => {
    expect(highestSanctionsTier("RU")).toBe("sectoral");
  });

  it("reports no sanctions for un-listed countries", () => {
    expect(isSanctioned("GB")).toBe(false);
    expect(isSanctioned("NG")).toBe(false);
    expect(highestSanctionsTier("GB")).toBeUndefined();
  });

  it("lists distinct imposers per country", () => {
    const imposers = sanctionsImposers("KP");
    expect(imposers).toContain("OFAC");
    expect(imposers).toContain("UN");
    expect(new Set(imposers).size).toBe(imposers.length);
  });

  it("getSanctions returns undefined for unknown codes", () => {
    expect(getSanctions("ZZ")).toBeUndefined();
  });
});
