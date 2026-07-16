import { describe, expect, it } from "vitest";
import { getCountryByIso2 } from "./countries.js";
import { buildCountryView } from "./countryView.js";

describe("country decision sanctions uncertainty", () => {
  for (const iso2 of ["GB", "BA", "IQ"]) {
    it(`${iso2} does not translate an incomplete catalogue into no sanctions`, () => {
      const country = getCountryByIso2(iso2);
      expect(country).toBeDefined();
      const view = buildCountryView(country!);
      expect(view.sanctionsCoverageComplete).toBe(false);
      expect(view.decision.verdictParagraph).toContain("under independent review");
      expect(view.decision.verdictParagraph).not.toContain("not subject to comprehensive country-wide sanctions");
      expect(view.decision.mitigatingFactors).not.toContain("No comprehensive country-wide sanctions programme.");
      expect(view.decision.whatChanged.find((item) => item.label === "Sanctions exposure")?.value)
        .toContain("absence not inferred");
    });
  }
});
