import { describe, expect, it } from "vitest";
import { pageCountries } from "./countryView.js";
import { buildCountryRiskPublicSurface } from "./countryRiskSurface.js";

const AS_OF = new Date("2026-08-06T12:00:00.000Z");

describe("public country-risk evidence surface", () => {
  it.each([
    ["IR", "countermeasures"],
    ["KP", "countermeasures"],
    ["MM", "enhanced-due-diligence"],
    ["CD", "increased-monitoring"],
    ["GB", "none"],
  ] as const)("normalises the FATF action for %s", (iso2, action) => {
    expect(buildCountryRiskPublicSurface(iso2, AS_OF).fatfAction.action).toBe(action);
  });

  it("separates Myanmar's base assessment date from its follow-up ratings date", () => {
    const item = buildCountryRiskPublicSurface("MM", AS_OF).freshness.find((row) => row.id === "fatf-assessment");
    expect(item?.assessmentDate).toBeTruthy();
    expect(item?.ratingsDate).toBeTruthy();
    expect(item?.assessmentDate).not.toBe(item?.ratingsDate);
  });

  it("labels source absence conservatively and never scores contextual signals", () => {
    const surface = buildCountryRiskPublicSurface("KP", AS_OF);
    expect(surface.contextualSignals.every((signal) => signal.scored === false)).toBe(true);
    expect(surface.contextualSignals.find((signal) => signal.id === "beneficial-ownership-register"))
      .toMatchObject({ state: "unavailable", value: "No live register identified in the source" });
  });

  it("builds the same complete schema for every public country", () => {
    for (const country of pageCountries()) {
      const surface = buildCountryRiskPublicSurface(country.iso2, AS_OF);
      expect(surface.contextualSignals, country.iso2).toHaveLength(5);
      expect(surface.freshness, country.iso2).toHaveLength(4);
      expect(surface.fatfAction.sourceUrl, country.iso2).toMatch(/^https:\/\//);
      expect(surface.freshness.every((item) => Boolean(item.sourceUrl)), country.iso2).toBe(true);
    }
  });
});
