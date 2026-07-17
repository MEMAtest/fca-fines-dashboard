import { describe, expect, it } from "vitest";
import { classifySanctionsFacts } from "./sanctionsEvidence.js";

const base = {
  legalStatus: "active" as const,
  relationship: "direct-country-exposure" as const,
  measures: ["asset-freeze" as const],
  broadTradeProhibition: false,
  broadFinancialProhibition: false,
  materialNonDesignationRestriction: false,
};

describe("deterministic sanctions classification", () => {
  it("classifies broad trade and financial restrictions as comprehensive", () => {
    expect(classifySanctionsFacts({
      ...base,
      broadTradeProhibition: true,
      broadFinancialProhibition: true,
    })).toMatchObject({ eligible: true, tier: "comprehensive", coverageState: "active-direct" });
  });

  it("classifies material non-designation restrictions as sectoral", () => {
    expect(classifySanctionsFacts({
      ...base,
      measures: ["arms-embargo"],
      materialNonDesignationRestriction: true,
    })).toMatchObject({ eligible: true, tier: "sectoral" });
  });

  it("classifies designation-led direct regimes as targeted", () => {
    expect(classifySanctionsFacts(base)).toMatchObject({ eligible: true, tier: "targeted" });
  });

  it("excludes situation-related and inactive regimes", () => {
    expect(classifySanctionsFacts({ ...base, relationship: "situation-related" }))
      .toMatchObject({ eligible: false, tier: null, coverageState: "active-situation-related" });
    expect(classifySanctionsFacts({ ...base, legalStatus: "terminated" }))
      .toMatchObject({ eligible: false, tier: null, coverageState: "inactive" });
  });

  it("keeps unknown legal status fail-closed", () => {
    expect(classifySanctionsFacts({ ...base, legalStatus: "unknown" }))
      .toMatchObject({ eligible: false, tier: null, coverageState: "unknown" });
  });
});
