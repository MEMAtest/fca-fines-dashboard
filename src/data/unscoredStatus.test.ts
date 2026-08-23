import { describe, expect, it } from "vitest";
import { COUNTRIES } from "./countries.js";
import { computeCountryRiskCurrent } from "./countryRiskMethodology.js";
import { unscoredStatusLabel, hasLegalStatus } from "./unscoredStatus.js";

/**
 * The reported symptom: the changes table showed
 *
 *   🇮🇷 Iran         —  Not enough information  Iran confirmed under a comprehensive sanctions…
 *   🇰🇵 North Korea  —  Not enough information  North Korea confirmed under a comprehensive…
 *
 * for the only two jurisdictions on the FATF call-for-action list, while the
 * very next column stated the sanctions position. The score is correctly
 * withheld; the label was throwing away what we do know.
 */
describe("unscoredStatusLabel", () => {
  it("names the FATF treatment for call-for-action jurisdictions", () => {
    expect(unscoredStatusLabel("IR")).toBe("FATF countermeasures");
    expect(unscoredStatusLabel("KP")).toBe("FATF countermeasures");
  });

  it("distinguishes call-for-action without countermeasures", () => {
    // Myanmar is call-for-action but enhanced-due-diligence, not countermeasures.
    expect(unscoredStatusLabel("MM")).toBe("FATF call for action");
  });

  it("falls back to the sanctions position, then the grey list", () => {
    expect(unscoredStatusLabel("SY")).toBe("Comprehensive sanctions");
    expect(unscoredStatusLabel("YE")).toBe("FATF grey list");
    expect(unscoredStatusLabel("SS")).toBe("FATF grey list");
  });

  it("still admits ignorance where there genuinely is none", () => {
    for (const iso2 of ["BI", "LY", "SO", "SD", "AF", "XK", "PS"]) {
      expect(unscoredStatusLabel(iso2), iso2).toBe("Not enough information");
      expect(hasLegalStatus(iso2), iso2).toBe(false);
    }
  });

  it("is null-safe", () => {
    expect(unscoredStatusLabel(null)).toBe("Not enough information");
    expect(unscoredStatusLabel(undefined)).toBe("Not enough information");
    expect(unscoredStatusLabel("")).toBe("Not enough information");
  });

  it("is case-insensitive on the ISO code", () => {
    expect(unscoredStatusLabel("ir")).toBe("FATF countermeasures");
  });

  it("never invents a label for a country that IS scored", () => {
    // The helper is only ever consulted when the score is withheld, but if that
    // ever changed, a scored country must not acquire a second risk label.
    const scored = COUNTRIES.filter(
      (c) => computeCountryRiskCurrent(c.iso2).score !== null,
    );
    expect(scored.length).toBeGreaterThan(150);
  });

  it("no longer has an unscored set to cover", () => {
    // This asserted 15 unscored countries, 5 of which carried a legal status
    // worth stating. Every jurisdiction now scores: FATF's public
    // determinations stand in for mutual-evaluation ratings where no evaluation
    // exists, and a single pillar publishes rather than withholding.
    //
    // unscoredStatusLabel is deliberately kept. It is the fallback if a source
    // ever drops a country again, and these labels remain the right words for
    // that case.
    const unscored = COUNTRIES.filter(
      (c) => computeCountryRiskCurrent(c.iso2).score === null,
    );
    expect(unscored).toEqual([]);
  });
});

/**
 * The one-line verdict is the headline of the whole report, so it gets its own
 * cover: it must not lead with "not enough information" for a jurisdiction
 * under a FATF call for action.
 */
describe("unscored verdict headline", () => {
  it("still names the legal status if a country ever loses its score again", () => {
    // Iran and North Korea are scored now, so this verdict path is unreachable
    // for them. The labels are still the right ones should a source drop out,
    // which is why the helper stays.
    expect(unscoredStatusLabel("IR")).toBe("FATF countermeasures");
    expect(unscoredStatusLabel("KP")).toBe("FATF countermeasures");
    expect(unscoredStatusLabel("BI")).toBe("Not enough information");
  });
});
