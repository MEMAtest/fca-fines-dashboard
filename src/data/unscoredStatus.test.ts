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

  it("covers the unscored set without regressing", () => {
    // 15 of 214 countries cannot be scored. Five of them carry a legal status
    // that is worth stating; if that count moves, the data changed and the
    // presentation should be re-checked rather than silently drift.
    const unscored = COUNTRIES.filter(
      (c) => computeCountryRiskCurrent(c.iso2).score === null,
    );
    const withStatus = unscored.filter((c) => hasLegalStatus(c.iso2));
    expect(unscored.length).toBe(15);
    expect(withStatus.map((c) => c.iso2).sort()).toEqual(["IR", "KP", "SS", "SY", "YE"]);
  });
});

/**
 * The one-line verdict is the headline of the whole report, so it gets its own
 * cover: it must not lead with "not enough information" for a jurisdiction
 * under a FATF call for action.
 */
describe("unscored verdict headline", () => {
  it("leads with the legal status for Iran and North Korea", async () => {
    const { getCountryByIso2 } = await import("./countries.js");
    const { buildCountryView } = await import("./countryView.js");
    for (const iso2 of ["IR", "KP"]) {
      const view = buildCountryView(getCountryByIso2(iso2)!);
      expect(view.decision.verdictHeadline, iso2).toBe(
        "FATF call for action requiring countermeasures; no score published",
      );
      // The score itself is still withheld -- that part was always right.
      expect(computeCountryRiskCurrent(iso2).score).toBeNull();
    }
  });

  it("still says so plainly where there is genuinely nothing", async () => {
    const { getCountryByIso2 } = await import("./countries.js");
    const { buildCountryView } = await import("./countryView.js");
    expect(buildCountryView(getCountryByIso2("BI")!).decision.verdictHeadline).toBe(
      "Not enough information for a country risk score",
    );
  });
});
