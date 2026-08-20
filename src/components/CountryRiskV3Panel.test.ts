import { describe, expect, it } from "vitest";
import { computeCountryRiskV3 } from "../data/countryRiskV3.js";
import { countryRiskV3PanelPayload } from "./CountryRiskV3Panel.js";

describe("CountryRiskV3Panel presentation adapter", () => {
  it("keeps sanctions out of the headline pillars and exposes overlays", () => {
    const result = computeCountryRiskV3("VE", { asOf: new Date("2026-08-20T00:00:00Z") });
    const payload = countryRiskV3PanelPayload(result);
    expect(payload.pillars.map((pillar) => pillar.key)).toEqual(["effectiveness", "safeguards", "governance"]);
    expect(payload.overlays?.map((overlay) => overlay.key)).toEqual(["fatf", "sanctions"]);
    expect(payload.beneficialOwnership).toBeTruthy();
    expect(typeof payload.note === "undefined" || typeof payload.note === "string").toBe(true);
  });
});
