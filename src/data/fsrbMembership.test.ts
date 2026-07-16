import { describe, expect, it } from "vitest";
import { getCountryByIso2 } from "./countries.js";
import { pageCountries } from "./countryView.js";
import {
  FSRBS,
  FATF_MEMBERS,
  FATF_SUSPENDED,
  FSRB_MEMBERSHIP,
  FSRB_REVIEWED,
  getFatfNetwork,
  inFatfNetwork,
  type FsrbCode,
} from "./fsrbMembership.js";

describe("FSRB / FATF network membership", () => {
  it("resolves getFatfNetwork() for every page country without throwing", () => {
    for (const c of pageCountries()) {
      expect(() => getFatfNetwork(c.iso2), c.iso2).not.toThrow();
      const net = getFatfNetwork(c.iso2);
      expect(Array.isArray(net.fsrbs), c.iso2).toBe(true);
      expect(typeof net.fatfMember, c.iso2).toBe("boolean");
    }
  });

  it("references only FSRB codes that exist in the definitions", () => {
    const known = new Set(Object.keys(FSRBS));
    for (const [iso2, codes] of Object.entries(FSRB_MEMBERSHIP)) {
      for (const code of codes) {
        expect(known.has(code), `${iso2} -> ${code}`).toBe(true);
      }
    }
  });

  it("keeps FSRB definition keys and code fields consistent", () => {
    for (const [key, body] of Object.entries(FSRBS)) {
      expect(body.code).toBe(key);
      expect(body.fullName.length).toBeGreaterThan(0);
      expect(body.url).toMatch(/^https:\/\//);
    }
  });

  it("maps every FSRB membership ISO2 to a real country", () => {
    for (const iso2 of Object.keys(FSRB_MEMBERSHIP)) {
      expect(getCountryByIso2(iso2), iso2).toBeDefined();
    }
  });

  it("has the major direct FATF members", () => {
    for (const iso2 of ["GB", "US", "DE", "FR", "JP", "CN", "IN", "BR", "ZA"]) {
      expect(FATF_MEMBERS.includes(iso2), iso2).toBe(true);
      expect(getFatfNetwork(iso2).fatfMember, iso2).toBe(true);
    }
  });

  it("has 38 direct FATF member jurisdictions (37 active + Russia suspended)", () => {
    expect(FATF_MEMBERS.length).toBe(38);
    // no duplicates
    expect(new Set(FATF_MEMBERS).size).toBe(FATF_MEMBERS.length);
    // Indonesia is the 40th (joined 2023)
    expect(FATF_MEMBERS.includes("ID")).toBe(true);
  });

  it("flags Russia as a suspended FATF member and maps it to EAG only", () => {
    expect(FATF_SUSPENDED).toContain("RU");
    const ru = getFatfNetwork("RU");
    expect(ru.fatfMember).toBe(true);
    expect(ru.suspended).toBe(true);
    const codes = ru.fsrbs.map((f) => f.code);
    expect(codes).toContain("EAG");
    // Russia was excluded from MONEYVAL / the Council of Europe in 2022.
    expect(codes).not.toContain("MONEYVAL");
  });

  it("does not flag ordinary FATF members as suspended", () => {
    expect(getFatfNetwork("GB").suspended).toBeUndefined();
    expect(getFatfNetwork("US").suspended).toBeUndefined();
  });

  it("spot-checks regional FSRB memberships against official sources", () => {
    const has = (iso2: string, code: FsrbCode) =>
      getFatfNetwork(iso2).fsrbs.some((f) => f.code === code);
    expect(has("NG", "GIABA")).toBe(true); // Nigeria
    expect(has("KE", "ESAAMLG")).toBe(true); // Kenya
    expect(has("QA", "MENAFATF")).toBe(true); // Qatar
    expect(has("AL", "MONEYVAL")).toBe(true); // Albania
    expect(has("KZ", "EAG")).toBe(true); // Kazakhstan
    expect(has("MY", "APG")).toBe(true); // Malaysia
    expect(has("TT", "CFATF")).toBe(true); // Trinidad and Tobago
    expect(has("CM", "GABAC")).toBe(true); // Cameroon
  });

  it("maps Argentina to both GAFILAT and direct FATF membership", () => {
    const ar = getFatfNetwork("AR");
    expect(ar.fatfMember).toBe(true);
    expect(ar.fsrbs.some((f) => f.code === "GAFILAT")).toBe(true);
  });

  it("supports multi-body membership (China: FATF + APG + EAG; India: APG + EAG)", () => {
    const cn = getFatfNetwork("CN");
    expect(cn.fatfMember).toBe(true);
    const cnCodes = cn.fsrbs.map((f) => f.code);
    expect(cnCodes).toEqual(expect.arrayContaining(["APG", "EAG"]));

    const inNet = getFatfNetwork("IN");
    const inCodes = inNet.fsrbs.map((f) => f.code);
    expect(inCodes).toEqual(expect.arrayContaining(["APG", "EAG"]));
  });

  it("individually evaluates the UK Crown Dependencies under MONEYVAL", () => {
    expect(getFatfNetwork("JE").fsrbs.some((f) => f.code === "MONEYVAL")).toBe(true);
    expect(getFatfNetwork("GG").fsrbs.some((f) => f.code === "MONEYVAL")).toBe(true);
    expect(getFatfNetwork("IM").fsrbs.some((f) => f.code === "MONEYVAL")).toBe(true);
  });

  it("covers the official Pacific, Caribbean and additional MONEYVAL members", () => {
    const expectMembers = (codes: string[], fsrb: FsrbCode) => {
      for (const iso2 of codes) {
        expect(
          getFatfNetwork(iso2).fsrbs.some((body) => body.code === fsrb),
          `${iso2} -> ${fsrb}`,
        ).toBe(true);
      }
    };

    expectMembers(["CK", "MH", "NR", "NU", "PW", "SB", "TO"], "APG");
    expectMembers(
      ["AI", "AW", "BZ", "CW", "DM", "GD", "MS", "KN", "LC", "SX", "VC", "TC"],
      "CFATF",
    );
    expectMembers(["AM", "AZ", "GE", "GI", "IM", "VA"], "MONEYVAL");
  });

  it("places DR Congo in GABAC (its FSRB, associate member)", () => {
    expect(getFatfNetwork("CD").fsrbs.some((f) => f.code === "GABAC")).toBe(true);
  });

  it("honestly reports isolated jurisdictions with no FSRB", () => {
    for (const iso2 of ["IR", "KP", "XK"]) {
      const net = getFatfNetwork(iso2);
      expect(net.fsrbs.length, iso2).toBe(0);
      expect(net.fatfMember, iso2).toBe(false);
      expect(inFatfNetwork(iso2), iso2).toBe(false);
    }
  });

  it("places the large majority of page countries in the FATF network", () => {
    const covered = pageCountries().filter((c) => inFatfNetwork(c.iso2));
    // Only a handful (Iran, North Korea, Kosovo) sit outside the network.
    expect(covered.length).toBeGreaterThan(pageCountries().length - 6);
  });

  it("records the review date", () => {
    expect(FSRB_REVIEWED).toMatch(/^\d{4}-\d{2}$/);
  });
});
