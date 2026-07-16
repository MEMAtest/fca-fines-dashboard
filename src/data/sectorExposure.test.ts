import { describe, expect, it } from "vitest";
import {
  deriveSectorExposure,
  highestSectorLevel,
  type SectorExposureInput,
  type SectorLevel,
  type SectorRow,
} from "./sectorExposure.js";
import { getCountryByIso2 } from "./countries.js";
import { buildCountryView } from "./countryView.js";

const EM_DASH = /[—]/; // house style forbids em-dashes in user-facing prose

/** Build the sector-exposure rows a country resolves to through the full view. */
function sectorsFor(iso2: string): SectorRow[] {
  const country = getCountryByIso2(iso2);
  expect(country, iso2).toBeDefined();
  return buildCountryView(country!).sectorExposure;
}

function row(rows: SectorRow[], sector: string): SectorRow {
  const r = rows.find((x) => x.sector === sector);
  expect(r, sector).toBeDefined();
  return r!;
}

/** A deliberately clean, low-risk input (nothing fires). */
const CLEAN: SectorExposureInput = {
  sectoralPrograms: [],
  domains: {
    corruption: 1,
    ruleOfLaw: 1,
    politicalStability: 1,
    accountability: 1,
  },
  cpi: 80,
};

const LEVEL_RANK: Record<SectorLevel, number> = { Low: 0, Elevated: 1, High: 2 };

describe("deriveSectorExposure shape", () => {
  it("returns five sectors in a stable order", () => {
    const rows = deriveSectorExposure(CLEAN);
    expect(rows.map((r) => r.sector)).toEqual([
      "Banking & payments",
      "Trade & export controls",
      "Crypto & virtual assets",
      "Real estate & luxury assets",
      "State-linked & procurement",
    ]);
  });

  it("a clean input is Low across the board", () => {
    const rows = deriveSectorExposure(CLEAN);
    expect(rows.every((r) => r.level === "Low")).toBe(true);
    expect(highestSectorLevel(rows)).toBe("Low");
  });

  it("every rationale is short and free of em-dashes", () => {
    const inputs: SectorExposureInput[] = [
      CLEAN,
      { sectoralPrograms: ["X programme"], sanctionsTier: "sectoral", fatf: "grey", domains: { corruption: 8, ruleOfLaw: 8, politicalStability: 8, accountability: 8 }, cpi: 10 },
      { sectoralPrograms: [], sanctionsTier: "comprehensive", fatf: "black", domains: { corruption: null, ruleOfLaw: null, politicalStability: null, accountability: null } },
    ];
    for (const input of inputs) {
      for (const r of deriveSectorExposure(input)) {
        expect(r.rationale.length, r.rationale).toBeLessThanOrEqual(92);
        expect(EM_DASH.test(r.rationale), r.rationale).toBe(false);
      }
    }
  });
});

describe("comprehensive sanctions -> Trade High (Cuba, Iran)", () => {
  for (const iso2 of ["CU", "IR"]) {
    it(`${iso2} trade & export controls is High`, () => {
      const rows = sectorsFor(iso2);
      expect(row(rows, "Trade & export controls").level).toBe("High");
    });
  }

  it("Cuba trade rationale cites the comprehensive embargo", () => {
    const trade = row(sectorsFor("CU"), "Trade & export controls");
    expect(trade.rationale.toLowerCase()).toContain("comprehensive");
  });

  it("comprehensive sanctions also drive State-linked High", () => {
    expect(row(sectorsFor("CU"), "State-linked & procurement").level).toBe("High");
  });
});

describe("Russia sectoral programmes are named in the Trade rationale", () => {
  it("Trade is High and names the sanctions programme", () => {
    const trade = row(sectorsFor("RU"), "Trade & export controls");
    expect(trade.level).toBe("High");
    // Russia's sectoral programme names finance/energy/defence in sanctionsStatus.ts
    expect(trade.rationale.toLowerCase()).toContain("sectoral sanctions");
    expect(trade.rationale.toLowerCase()).toMatch(/finance|energy|defence/);
  });
});

describe("Nigeria real estate is Elevated via CPI", () => {
  it("real estate Elevated with the CPI figure in the rationale", () => {
    const re = row(sectorsFor("NG"), "Real estate & luxury assets");
    // Nigeria CPI is 26 (>=25, <40) -> Elevated, not High
    expect(re.level).toBe("Elevated");
    expect(re.rationale).toMatch(/CPI\s*26/);
  });
});

describe("low-risk countries read mostly Low", () => {
  it("Japan is Low across every sector", () => {
    const rows = sectorsFor("JP");
    expect(rows.every((r) => r.level === "Low"), JSON.stringify(rows)).toBe(true);
  });

  it("Denmark is Low across every sector", () => {
    const rows = sectorsFor("DK");
    expect(rows.every((r) => r.level === "Low")).toBe(true);
  });
});

describe("FATF grey list elevates banking and crypto", () => {
  it("a pure grey-list input elevates banking and crypto", () => {
    const rows = deriveSectorExposure({ ...CLEAN, fatf: "grey" });
    expect(row(rows, "Banking & payments").level).toBe("Elevated");
    expect(row(rows, "Crypto & virtual assets").level).toBe("Elevated");
  });

  it("a black-list input takes banking, crypto and trade to High", () => {
    const rows = deriveSectorExposure({ ...CLEAN, fatf: "black" });
    expect(row(rows, "Banking & payments").level).toBe("High");
    expect(row(rows, "Crypto & virtual assets").level).toBe("High");
    expect(row(rows, "Trade & export controls").level).toBe("High");
  });
});

describe("determinism", () => {
  it("the same input yields identical output every time", () => {
    const input: SectorExposureInput = {
      sanctionsTier: "sectoral",
      sectoralPrograms: ["Some sectoral programme"],
      fatf: "grey",
      domains: { corruption: 7, ruleOfLaw: 6.5, politicalStability: 5, accountability: 6.8 },
      cpi: 22,
    };
    const a = JSON.stringify(deriveSectorExposure(input));
    const b = JSON.stringify(deriveSectorExposure(input));
    const c = JSON.stringify(deriveSectorExposure({ ...input }));
    expect(a).toEqual(b);
    expect(a).toEqual(c);
  });

  it("real country views are stable across repeated builds", () => {
    for (const iso2 of ["CU", "RU", "NG", "JP"]) {
      expect(JSON.stringify(sectorsFor(iso2))).toEqual(JSON.stringify(sectorsFor(iso2)));
    }
  });
});

describe("monotonicity: worse inputs never lower a sector level", () => {
  const worsen = (a: SectorRow[], b: SectorRow[]) => {
    for (let i = 0; i < a.length; i += 1) {
      expect(LEVEL_RANK[b[i].level], `${b[i].sector} regressed`).toBeGreaterThanOrEqual(
        LEVEL_RANK[a[i].level],
      );
    }
  };

  it("adding a FATF grey listing never lowers any sector", () => {
    worsen(deriveSectorExposure(CLEAN), deriveSectorExposure({ ...CLEAN, fatf: "grey" }));
  });

  it("escalating grey to black never lowers any sector", () => {
    worsen(
      deriveSectorExposure({ ...CLEAN, fatf: "grey" }),
      deriveSectorExposure({ ...CLEAN, fatf: "black" }),
    );
  });

  it("escalating sanctions targeted -> sectoral -> comprehensive never lowers any sector", () => {
    const base = { ...CLEAN, sectoralPrograms: ["P"] };
    const targeted = deriveSectorExposure({ ...base, sanctionsTier: "targeted" });
    const sectoral = deriveSectorExposure({ ...base, sanctionsTier: "sectoral" });
    const comprehensive = deriveSectorExposure({ ...base, sanctionsTier: "comprehensive" });
    worsen(targeted, sectoral);
    worsen(sectoral, comprehensive);
  });

  it("worsening every governance domain never lowers any sector", () => {
    const better = deriveSectorExposure({
      ...CLEAN,
      domains: { corruption: 3, ruleOfLaw: 3, politicalStability: 3, accountability: 3 },
    });
    const worse = deriveSectorExposure({
      ...CLEAN,
      domains: { corruption: 8, ruleOfLaw: 8, politicalStability: 8, accountability: 8 },
    });
    worsen(better, worse);
  });

  it("lowering CPI never lowers the real-estate sector", () => {
    const cleanRe = row(deriveSectorExposure({ ...CLEAN, cpi: 80 }), "Real estate & luxury assets");
    const midRe = row(deriveSectorExposure({ ...CLEAN, cpi: 30 }), "Real estate & luxury assets");
    const lowRe = row(deriveSectorExposure({ ...CLEAN, cpi: 20 }), "Real estate & luxury assets");
    expect(LEVEL_RANK[midRe.level]).toBeGreaterThanOrEqual(LEVEL_RANK[cleanRe.level]);
    expect(LEVEL_RANK[lowRe.level]).toBeGreaterThanOrEqual(LEVEL_RANK[midRe.level]);
  });
});
