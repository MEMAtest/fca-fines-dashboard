import { describe, expect, it } from "vitest";
import { computeCountryRiskV3 } from "./countryRiskV3.js";
import {
  buildCountryRiskV3PublicExplanation,
  countryRiskV3OverlayLabel,
  countryRiskV3StatusLabel,
} from "./countryRiskV3Presentation.js";

describe("country-risk v3 public presentation", () => {
  it("uses plain-language status and overlay labels", () => {
    const result = computeCountryRiskV3("VE", { asOf: new Date("2026-08-20T00:00:00Z") });
    const explanation = buildCountryRiskV3PublicExplanation(result);
    expect(countryRiskV3StatusLabel(result.status)).toMatch(/information|available|score/);
    expect(countryRiskV3OverlayLabel("screening-and-transaction-review")).toBe("Screen transactions and counterparties");
    expect(explanation.pillars).toHaveLength(3);
    expect(explanation.overlayLabels.sanctions).toBeTruthy();
  });

  it("shows the ICRG substitute only when it actually drives the score", () => {
    const explanation = buildCountryRiskV3PublicExplanation(computeCountryRiskV3("IR", { asOf: new Date("2026-08-20T00:00:00Z") }));
    expect(explanation.pillars.find((pillar) => pillar.key === "icrg")).toMatchObject({
      label: "FATF public determination (ICRG substitute)",
      appliedWeight: 0.65,
    });
    expect(buildCountryRiskV3PublicExplanation(computeCountryRiskV3("GB")).pillars.some((pillar) => pillar.key === "icrg")).toBe(false);
  });
});
