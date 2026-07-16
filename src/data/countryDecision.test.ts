import { describe, expect, it } from "vitest";
import { getCountryByIso2 } from "./countries.js";
import { buildCountryView } from "./countryView.js";

/** Build a country's decision object via the shared view model. */
function decisionFor(iso2: string) {
  const country = getCountryByIso2(iso2);
  expect(country, iso2).toBeDefined();
  return buildCountryView(country!).decision;
}

const EM_DASH = /[—]/; // em dash — house style forbids it in user-facing prose

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

describe("country decision missing-evidence handling", () => {
  for (const iso2 of ["VG", "CW", "GI", "GG", "IM", "MS", "SX", "TC", "VA"]) {
    it(`${iso2} never presents missing governance as low risk`, () => {
      const country = getCountryByIso2(iso2);
      expect(country).toBeDefined();
      const view = buildCountryView(country!);
      expect(view.scoreStatus).toBe("insufficient-data");
      expect(view.decision.verdictHeadline).toContain("Insufficient evidence");
      expect(view.decision.verdictHeadline).not.toContain("Low country risk");
      expect(view.decision.mitigatingFactors).toContain(
        "No low-risk conclusion is drawn until the evidence gap is resolved.",
      );
    });
  }
});

describe("treatmentChecklist derivation", () => {
  it("produces 4-5 non-empty items for every profiled band", () => {
    for (const iso2 of ["CU", "JP", "CN", "NG", "IR", "RU"]) {
      const { treatmentChecklist } = decisionFor(iso2);
      expect(treatmentChecklist.length, iso2).toBeGreaterThanOrEqual(4);
      expect(treatmentChecklist.length, iso2).toBeLessThanOrEqual(5);
      for (const item of treatmentChecklist) {
        expect(item.trim().length, `${iso2}: "${item}"`).toBeGreaterThan(0);
      }
    }
  });

  it("contains no em-dashes (house style)", () => {
    for (const iso2 of ["CU", "JP", "CN", "NG", "IR", "RU"]) {
      const { treatmentChecklist } = decisionFor(iso2);
      for (const item of treatmentChecklist) {
        expect(EM_DASH.test(item), `${iso2}: "${item}"`).toBe(false);
      }
    }
  });

  it("is deterministic (same country yields the same list)", () => {
    const a = decisionFor("CU").treatmentChecklist;
    const b = decisionFor("CU").treatmentChecklist;
    expect(a).toEqual(b);
  });

  it("a candidate-sanctions country and a low-risk country produce different lists", () => {
    const cuba = decisionFor("CU").treatmentChecklist;
    const japan = decisionFor("JP").treatmentChecklist; // low-risk, no listing/sanctions
    expect(cuba).not.toEqual(japan);
  });

  it("does not promote a candidate comprehensive tier before sanctions approval", () => {
    const cuba = decisionFor("CU").treatmentChecklist;
    expect(cuba.some((i) => /prohibition or licensing/i.test(i))).toBe(false);
  });

  it("FATF-listed country flags remediation/action-plan monitoring", () => {
    const iran = decisionFor("IR").treatmentChecklist; // FATF black list
    expect(iran.some((i) => /FATF/i.test(i))).toBe(true);
  });

  it("low-risk country gets proportionate standard-DD items, not prohibition wording", () => {
    const japan = decisionFor("JP").treatmentChecklist;
    expect(japan.some((i) => /proportionate standard due diligence/i.test(i))).toBe(true);
    expect(japan.some((i) => /prohibition/i.test(i))).toBe(false);
  });

  it("China's list reflects its weakest governance domain (voice & accountability)", () => {
    // China's lowest WGI percentile is Voice & Accountability, so an
    // adverse-media / transparency emphasis should appear.
    const china = decisionFor("CN").treatmentChecklist;
    expect(china.some((i) => /adverse-media|transparency/i.test(i))).toBe(true);
  });
});
