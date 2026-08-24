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
      label: "FATF listing status",
      appliedWeight: 0.65,
    });
    expect(buildCountryRiskV3PublicExplanation(computeCountryRiskV3("GB")).pillars.some((pillar) => pillar.key === "icrg")).toBe(false);
  });

  it("states the calculation under the pillar labels, never the internal keys", () => {
    const explanation = buildCountryRiskV3PublicExplanation(computeCountryRiskV3("IR", { asOf: new Date("2026-08-20T00:00:00Z") }));
    const calculation = explanation.calculation!;
    expect(calculation.rows.map((row) => row.label)).toEqual([
      "Governance and institutions",
      "FATF listing status",
    ]);
    // The bug this replaces: the rail printed "icrg 9.5 × 65%".
    expect(calculation.rows.some((row) => /^(icrg|governance|effectiveness|safeguards)$/.test(row.label))).toBe(false);
  });

  it("omits pillars it holds no evidence for rather than crediting them zero", () => {
    const result = computeCountryRiskV3("IR", { asOf: new Date("2026-08-20T00:00:00Z") });
    const calculation = buildCountryRiskV3PublicExplanation(result).calculation!;
    expect(calculation.rows.every((row) => row.weightPct > 0)).toBe(true);
    expect(calculation.rows.some((row) => row.key === "safeguards")).toBe(false);
    expect(result.pillars.safeguards.score).toBeNull();
    // The published weights still have to account for the whole score.
    expect(calculation.rows.reduce((sum, row) => sum + row.weightPct, 0)).toBeCloseTo(100, 1);
    expect(calculation.total).toBe(result.score);
  });

  it("publishes no calculation where no score is published", () => {
    const withheld = computeCountryRiskV3("IR", { asOf: new Date("2026-08-20T00:00:00Z") });
    expect(buildCountryRiskV3PublicExplanation({ ...withheld, score: null }).calculation).toBeNull();
  });
});
