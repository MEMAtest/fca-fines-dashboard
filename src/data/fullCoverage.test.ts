import { describe, expect, it } from "vitest";
import { COUNTRIES } from "./countries.js";
import { buildCountryIndex } from "./countryView.js";
import { computeCountryRiskV3, icrgFrameworkRisk } from "./countryRiskV3.js";
import { getFatfAssessment } from "./fatfAssessmentData.js";
import { getFatfStatus } from "./fatfStatus.js";

/**
 * Every jurisdiction now carries a score.
 *
 * Fifteen used to publish "Not enough information", including Iran and North
 * Korea. Two changes closed that: FATF's public determinations stand in for
 * mutual-evaluation ratings where no evaluation has ever been made, and a
 * single line of evidence publishes with a disclosure rather than being
 * withheld.
 */
describe("full country coverage", () => {
  it("scores every country and every published jurisdiction", () => {
    const unscored = COUNTRIES.filter((c) => computeCountryRiskV3(c.iso2).score === null);
    expect(unscored.map((c) => c.iso2)).toEqual([]);
    expect(buildCountryIndex().filter((e) => e.score === null)).toEqual([]);
  });

  it("never turns absent evidence into a zero score", () => {
    // The invariant that survives all of this: a missing pillar contributes
    // nothing and is never read as no risk.
    for (const country of COUNTRIES) {
      const result = computeCountryRiskV3(country.iso2);
      expect(result.score, country.iso2).not.toBe(0);
      for (const pillar of Object.values(result.pillars)) {
        if (pillar.score === null) expect(pillar.contribution, country.iso2).toBeNull();
      }
    }
  });

  it("puts the two countermeasures jurisdictions at the top", () => {
    // The reason this work happened: Iran scored 6.7 and North Korea 6.8 from
    // governance alone, ranking below roughly fifty countries with functioning
    // AML regimes, while being the only two subject to FATF countermeasures.
    const scores = COUNTRIES.map((c) => computeCountryRiskV3(c.iso2).score as number).sort((a, b) => b - a);
    for (const iso2 of ["IR", "KP"]) {
      const score = computeCountryRiskV3(iso2).score as number;
      expect(score, iso2).toBeGreaterThan(8);
      expect(scores.indexOf(score), iso2).toBeLessThan(5);
    }
  });

  it("only substitutes the FATF determination where no evaluation exists", () => {
    // The substitution must never touch an assessed country, or the listing
    // would be counted twice: once in the ratings and again on top.
    let substituted = 0;
    for (const country of COUNTRIES) {
      const assessed = Boolean(getFatfAssessment(country.iso2));
      const icrg = icrgFrameworkRisk(getFatfStatus(country.iso2), assessed);
      if (assessed) expect(icrg.score, country.iso2).toBeNull();
      if (icrg.score !== null) substituted += 1;
    }
    // Iran, North Korea, Syria, Yemen, South Sudan.
    expect(substituted).toBe(5);
  });

  it("marks the thin cases as provisional and low confidence", () => {
    for (const iso2 of ["IR", "KP", "SO", "LY", "SD", "AF", "XK", "VI"]) {
      const result = computeCountryRiskV3(iso2);
      expect(result.status, iso2).toBe("provisional");
      expect(result.confidence, iso2).toBe("low");
    }
  });

  it("states in the report why the score is thin", () => {
    expect(computeCountryRiskV3("IR").limitingReasons).toContain(
      "No FATF mutual evaluation exists for this jurisdiction; FATF's public determination is used in place of assessment ratings",
    );
    expect(computeCountryRiskV3("SO").limitingReasons).toContain(
      "Only one line of evidence is available, so the score is indicative rather than a composite",
    );
  });
});

/**
 * The page must not contradict itself. Iran's report said "FATF treatment
 * overlay: call for action requiring countermeasures (not a score input)"
 * while that same determination was what produced its 8.5.
 */
describe("overlay wording where the determination is scored", () => {
  it("says the determination is scored for Iran and North Korea", async () => {
    const { getCountryByIso2 } = await import("./countries.js");
    const { buildCountryView } = await import("./countryView.js");
    for (const iso2 of ["IR", "KP"]) {
      const overlays = buildCountryView(getCountryByIso2(iso2)!).decision.treatmentOverlays;
      const line = overlays.find((o: string) => o.startsWith("FATF"));
      expect(line, iso2).toContain("scored in place of mutual-evaluation ratings");
      expect(line, iso2).not.toContain("not a score input");
    }
  });

  it("still calls it an overlay for an assessed listed country", async () => {
    const { getCountryByIso2 } = await import("./countries.js");
    const { buildCountryView } = await import("./countryView.js");
    // Assessed and grey-listed, so the listing genuinely is an overlay there.
    const overlays = buildCountryView(getCountryByIso2("VN")!).decision.treatmentOverlays;
    const line = overlays.find((o: string) => o.startsWith("FATF"));
    if (line) expect(line).toContain("not a score input");
  });
});
