import { describe, expect, it } from "vitest";
import { getCountryByIso2 } from "./countries.js";
import {
  EGMONT_MEMBERS,
  EGMONT_REVIEWED,
  EGMONT_SOURCE_URL,
  egmontMemberIso2,
  getEgmontMember,
  isEgmontMember,
} from "./egmontMembership.js";

describe("Egmont Group FIU membership", () => {
  it("holds around 180 member FIUs (official directory ~182)", () => {
    // The Egmont Group publishes 182 member FIUs; allow a small band for churn.
    expect(EGMONT_MEMBERS.length).toBeGreaterThan(160);
    expect(EGMONT_MEMBERS.length).toBeLessThan(200);
  });

  it("resolves every member ISO2 against countries.ts", () => {
    for (const member of EGMONT_MEMBERS) {
      const country = getCountryByIso2(member.iso2);
      expect(country, member.iso2).toBeTruthy();
    }
  });

  it("has no duplicate ISO2 entries", () => {
    const iso2s = egmontMemberIso2();
    expect(new Set(iso2s).size).toBe(iso2s.length);
  });

  it("spot-checks known members (UK, US, Germany and others)", () => {
    expect(isEgmontMember("GB")).toBe(true); // United Kingdom (UKFIU / NCA)
    expect(isEgmontMember("US")).toBe(true); // United States (FinCEN)
    expect(isEgmontMember("DE")).toBe(true); // Germany (FIU)
    expect(isEgmontMember("FR")).toBe(true); // France (TRACFIN)
    expect(isEgmontMember("AU")).toBe(true); // Australia (AUSTRAC)
    expect(isEgmontMember("PA")).toBe(true); // Panama (UAF)
  });

  it("carries FIU names for the major members where held", () => {
    expect(getEgmontMember("US")?.fiu).toBe("FinCEN");
    expect(getEgmontMember("GB")?.fiu).toContain("NCA");
    expect(getEgmontMember("FR")?.fiu).toBe("TRACFIN");
    expect(getEgmontMember("AU")?.fiu).toBe("AUSTRAC");
  });

  it("is case-insensitive on the ISO2 lookup", () => {
    expect(isEgmontMember("gb")).toBe(true);
    expect(isEgmontMember("us")).toBe(true);
  });

  it("carries a reviewed date and the Egmont source URL", () => {
    expect(EGMONT_REVIEWED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(EGMONT_SOURCE_URL).toMatch(/^https:\/\/egmontgroup\.org\//);
  });

  it("flags Russia's Rosfinmonitoring as suspended (Egmont, 18 Oct 2023)", () => {
    const ru = getEgmontMember("RU");
    expect(ru).toBeDefined();
    expect(ru?.suspended).toBe(true);
    // No other member is currently suspended.
    const others = egmontMemberIso2().filter((c) => c !== "RU");
    for (const c of others) {
      expect(getEgmontMember(c)?.suspended, c).not.toBe(true);
    }
  });
});