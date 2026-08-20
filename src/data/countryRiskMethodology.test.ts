import { describe, expect, it } from "vitest";
import {
  computeCountryRiskByMethodology,
  computeCountryRiskCurrent,
  resolveCountryRiskMethodology,
  CURRENT_COUNTRY_RISK_METHODOLOGY_VERSION,
} from "./countryRiskMethodology.js";

describe("active country-risk methodology", () => {
  it("resolves current and explicit version selectors", () => {
    expect(resolveCountryRiskMethodology(undefined)).toBe("v3");
    expect(resolveCountryRiskMethodology("current")).toBe("v3");
    expect(resolveCountryRiskMethodology(CURRENT_COUNTRY_RISK_METHODOLOGY_VERSION)).toBe("v3");
    expect(resolveCountryRiskMethodology("2.0.0")).toBe("v2");
    expect(() => resolveCountryRiskMethodology("1.0.0")).toThrow("Unsupported");
  });

  it("uses v3 for the current resolver and retains explicit v2 history", () => {
    expect(computeCountryRiskCurrent("VE").methodologyVersion).toBe("3.0.0");
    expect(computeCountryRiskByMethodology("VE", "v2").methodologyVersion).toBe("2.0.0");
    expect(computeCountryRiskByMethodology("VE", "v3").methodologyVersion).toBe("3.0.0");
  });
});

