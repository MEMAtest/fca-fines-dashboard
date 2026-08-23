import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { computeCountryRiskV3 } from "../data/countryRiskV3.js";
import { CountryRiskV3Panel, countryRiskV3PanelPayload } from "./CountryRiskV3Panel.js";

describe("CountryRiskV3Panel presentation adapter", () => {
  it("keeps sanctions out of the headline pillars and exposes overlays", () => {
    const result = computeCountryRiskV3("VE", { asOf: new Date("2026-08-20T00:00:00Z") });
    const payload = countryRiskV3PanelPayload(result);
    expect(payload.pillars.map((pillar) => pillar.key)).toEqual(["effectiveness", "safeguards", "governance"]);
    expect(payload.overlays?.map((overlay) => overlay.key)).toEqual(["fatf", "sanctions"]);
    expect(payload.beneficialOwnership).toBeTruthy();
    expect(typeof payload.note === "undefined" || typeof payload.note === "string").toBe(true);
  });

  it("renders calculation detail without a second numeric headline", () => {
    const result = computeCountryRiskV3("VE", { asOf: new Date("2026-08-20T00:00:00Z") });
    const payload = countryRiskV3PanelPayload(result, {
      label: "Register status",
      value: "No live register identified in the source snapshot",
    });
    const html = renderToStaticMarkup(createElement(CountryRiskV3Panel, { payload, showHeadline: false }));
    expect(html).not.toContain("cx-v3__result");
    expect(html).toContain("cx-v3__pillars");
    expect(html).toContain("Beneficial-ownership transparency");
    expect(html).toContain("Register status");
  });

  it("shows Libya's governance pillar carrying the score on its own", () => {
    // Was: "without presenting it as a 100% score", asserting a withheld
    // headline. The model now publishes single-pillar jurisdictions rather than
    // saying nothing about Libya, Somalia and Sudan; the panel's job changed
    // from hiding the number to showing what little it rests on.
    const result = computeCountryRiskV3("LY", { asOf: new Date("2026-08-20T00:00:00Z") });
    const payload = countryRiskV3PanelPayload(result);
    const governance = payload.pillars.find((pillar) => pillar.key === "governance");
    expect(governance).toMatchObject({ score: 7.3, weight: 1, contribution: 7.3 });

    const html = renderToStaticMarkup(createElement(CountryRiskV3Panel, { payload }));
    expect(html).not.toContain("Headline score withheld");
    // The thinness of the evidence must still be on the page.
    expect(result.limitingReasons).toContain(
      "Only one line of evidence is available, so the score is indicative rather than a composite",
    );
  });
});
