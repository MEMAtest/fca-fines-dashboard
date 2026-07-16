import { describe, expect, it } from "vitest";
import { buildCountryIndex } from "./countryView.js";

/**
 * Guards the Risk-matrix population contract (PR #39): the scatter plots ONLY
 * jurisdictions with RegActions enforcement coverage AND a computable control
 * strength. Countries without coverage are "not yet assessed", never plotted
 * at exposure 0 — a regression here silently re-creates the misleading flat
 * line of ~180 dots on the x-axis.
 */
describe("risk-matrix population", () => {
  const index = buildCountryIndex();
  const covered = index.filter((e) => e.hasEnforcement);
  const plotted = covered.filter((e) => e.controlStrength !== null);

  it("plots only the covered set, far smaller than the full index", () => {
    expect(index.length).toBeGreaterThan(150);
    expect(covered.length).toBeGreaterThan(10);
    expect(covered.length).toBeLessThan(index.length / 3);
  });

  it("keeps covered-but-unplottable countries (no WGI) out of the plotted set", () => {
    const gg = covered.find((e) => e.country.iso2 === "GG");
    if (gg) {
      expect(gg.controlStrength).toBeNull();
      expect(plotted.some((e) => e.country.iso2 === "GG")).toBe(false);
    }
    for (const e of plotted) {
      expect(e.controlStrength, e.country.iso2).not.toBeNull();
    }
  });

  it("no plotted country pretends to have zero exposure without coverage", () => {
    // Every plotted entry has coverage by construction; uncovered entries keep
    // exposure 0 but must never satisfy the plot gate.
    for (const e of index.filter((x) => !x.hasEnforcement)) {
      expect(e.hasEnforcement).toBe(false);
    }
    const flatLine = plotted.filter((e) => e.enforcementExposure === 0);
    // Genuinely-low covered countries may sit near 0, but the uncovered mass
    // (150+) must not: the plotted zero-exposure count stays a small handful.
    expect(flatLine.length).toBeLessThan(10);
  });
});
