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

describe("country decision sanctions evidence", () => {
  for (const iso2 of ["GB", "BA", "IQ"]) {
    it(`${iso2} uses the complete promoted catalogue`, () => {
      const country = getCountryByIso2(iso2);
      expect(country).toBeDefined();
      const view = buildCountryView(country!);
      expect(view.sanctionsCoverageComplete).toBe(true);
      expect(view.decision.verdictParagraph).not.toContain("under independent review");
      if (view.sanctionsTier) {
        expect(view.decision.verdictParagraph).toContain(`has a ${view.sanctionsTier} sanctions programme`);
      } else {
        expect(view.decision.verdictParagraph).toContain("not subject to comprehensive country-wide sanctions");
      }
      expect(view.decision.whatChanged.find((item) => item.label === "Sanctions exposure")?.value)
        .not.toContain("absence not inferred");
    });
  }
});

describe("country decision missing-evidence handling", () => {
  for (const iso2 of ["VG", "CW", "GI", "GG", "IM", "MS", "SX", "TC", "VA"]) {
    it(`${iso2} publishes a non-Low provisional result`, () => {
      const country = getCountryByIso2(iso2);
      expect(country).toBeDefined();
      const view = buildCountryView(country!);
      expect(view.scoreStatus).toBe("provisional");
      expect(view.decision.verdictHeadline).not.toContain("Low country risk");
      expect(view.decision.verdictParagraph).toContain("will not be labelled Low risk");
    });
  }
});

describe("v3 score-driver explainability", () => {
  it("orders Venezuela's scored pillars by contribution and separates overlays", () => {
    const decision = decisionFor("VE");
    expect(decision.scoreDrivers[0]).toMatch(/^AML\/CFT effectiveness:/);
    expect(decision.scoreDrivers[0]).toContain("= 4.4 points");
    expect(decision.scoreDrivers.join(" ")).not.toMatch(/FATF|sanctions/i);
    expect(decision.treatmentOverlays.join(" ")).toMatch(/FATF treatment overlay/i);
    expect(decision.treatmentOverlays.join(" ")).toMatch(/sanctions treatment overlay/i);
    expect(decision.treatmentOverlays.every((item) => /not a score input/.test(item))).toBe(true);
    expect(decision.verdictParagraph).toContain("principal score driver is AML/CFT effectiveness");
    expect(decision.verdictParagraph).toContain("Venezuela has a sectoral sanctions programme");
    expect(decision.verdictParagraph).not.toContain("principal driver is weak corruption");
    expect(decision.whatChanged.find((item) => item.label === "Sanctions exposure")?.value).toBe("Sectoral programme in place");
  });

  it("keeps the historical riskDrivers alias free of treatment overlays", () => {
    const decision = decisionFor("VE");
    expect(decision.riskDrivers).toEqual(decision.scoreDrivers);
    expect(decision.riskDrivers.join(" ")).not.toMatch(/FATF|sanctions/i);
  });
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

  it("uses the promoted comprehensive tier for Cuba", () => {
    const cuba = decisionFor("CU").treatmentChecklist;
    expect(cuba.some((i) => /prohibition or licensing/i.test(i))).toBe(true);
  });

  it("FATF-listed country flags remediation/action-plan monitoring", () => {
    const iran = decisionFor("IR").treatmentChecklist; // FATF black list
    expect(iran.some((i) => /FATF/i.test(i))).toBe(true);
  });

  it("distinguishes Myanmar enhanced due diligence from Iran countermeasures", () => {
    const myanmar = decisionFor("MM");
    const iran = decisionFor("IR");
    expect(myanmar.treatment).toContain("does not call for countermeasures");
    expect(myanmar.treatment).not.toContain("prohibition");
    expect(myanmar.treatmentChecklist.some((item) => /humanitarian, NPO and remittance/i.test(item))).toBe(true);
    expect(iran.treatment).toContain("restriction or prohibition");
    expect(iran.treatmentChecklist.some((item) => /countermeasures/i.test(item))).toBe(true);
  });

  it("surfaces Russia as suspended FATF membership context without changing the v2 score", () => {
    const country = getCountryByIso2("RU")!;
    const view = buildCountryView(country);
    expect(view.riskV2.score).toBe(6);
    expect(view.publicSurface.fatfAction.action).toBe("none");
    expect(view.publicSurface.contextualSignals).toContainEqual(expect.objectContaining({
      id: "fatf-membership",
      state: "suspended",
    }));
  });

  it("low-risk country gets proportionate standard-DD items, not prohibition wording", () => {
    const unitedKingdom = decisionFor("GB").treatmentChecklist;
    expect(unitedKingdom.some((i) => /proportionate standard due diligence/i.test(i))).toBe(true);
    expect(unitedKingdom.some((i) => /prohibition/i.test(i))).toBe(false);
  });

  it("China's list reflects its weakest governance domain (voice & accountability)", () => {
    // China's lowest WGI percentile is Voice & Accountability, so an
    // adverse-media / transparency emphasis should appear.
    const china = decisionFor("CN").treatmentChecklist;
    expect(china.some((i) => /adverse-media|transparency/i.test(i))).toBe(true);
  });
});

describe("business impact varies by activity", () => {
  it("only a sanctions programme can restrict an activity", () => {
    const iran = decisionFor("IR");
    const restricted = iran.businessImpact.filter((row) => row.level === "Restricted");
    expect(restricted.length).toBeGreaterThan(0);
    for (const row of restricted) {
      expect(row.driver.toLowerCase()).toMatch(/sanctions|programme/);
    }
    // A score alone must never produce "Restricted": Nigeria is very-high risk
    // with no country-level programme.
    const nigeria = decisionFor("NG");
    expect(nigeria.businessImpact.some((row) => row.level === "Restricted")).toBe(false);
  });

  it("states a driver for every activity, and never one that argues against its level", () => {
    for (const iso2 of ["IR", "NG", "SG", "GB", "KP"]) {
      for (const row of decisionFor(iso2).businessImpact) {
        expect(row.driver, `${iso2} ${row.activity}`).not.toBe("");
        // The old rows read "Enhanced / no measures identified", which states a
        // level and then gives a reason against it. A driver that opens by
        // reporting an absence has to go on to say what did set the level.
        if (/^No /.test(row.driver)) {
          expect(row.driver, `${iso2} ${row.activity}`).toMatch(/band applies|under review/);
        }
      }
    }
  });

  it("reads a low-risk jurisdiction as standard rather than enhanced", () => {
    const levels = decisionFor("GB").businessImpact.map((row) => row.level);
    expect(levels.every((level) => level === "Standard")).toBe(true);
  });

  it("does not describe low corruption as raising risk", () => {
    const singapore = decisionFor("SG").businessImpact.find((row) => row.activity === "Corporate clients")!;
    expect(singapore.driver).not.toMatch(/raises the chance/);
    const iran = decisionFor("IR");
    expect(iran.businessImpact.length).toBe(5);
  });
});

describe("what firms should consider", () => {
  it("gives every country the same four factors with country-specific evidence", () => {
    const iran = decisionFor("IR").considerations;
    const uk = decisionFor("GB").considerations;
    expect(iran.map((row) => row.key)).toEqual(["sanctions", "fatf", "governance", "beneficial-ownership"]);
    expect(uk.map((row) => row.key)).toEqual(iran.map((row) => row.key));
    for (const [index, row] of iran.entries()) {
      expect(row.why, row.key).not.toBe(uk[index].why);
      expect(row.mitigants.length).toBeGreaterThan(0);
    }
  });

  it("never reads missing sanctions evidence as an absence of sanctions", () => {
    for (const iso2 of ["IR", "NG", "SG", "GB"]) {
      const sanctions = decisionFor(iso2).considerations.find((row) => row.key === "sanctions")!;
      expect(sanctions.why, iso2).not.toMatch(/no sanctions apply|is not sanctioned/i);
    }
  });

  it("holds to house style", () => {
    for (const iso2 of ["IR", "NG", "SG", "GB", "KP"]) {
      const decision = decisionFor(iso2);
      for (const row of decision.considerations) {
        expect(row.why, `${iso2} ${row.key}`).not.toMatch(EM_DASH);
        for (const item of row.mitigants) expect(item, `${iso2} ${row.key}`).not.toMatch(EM_DASH);
      }
      for (const row of decision.businessImpact) {
        expect(row.driver, `${iso2} ${row.activity}`).not.toMatch(EM_DASH);
      }
    }
  });
});

describe("treatment headline agrees with the activities beneath it", () => {
  it("does not put a standard heading over restricted activities", () => {
    // Cuba sits in the moderate band under a comprehensive embargo. Deriving
    // the heading from the band alone read "Standard + Enhanced Checks" above
    // five restricted activities.
    for (const iso2 of ["CU", "IR", "KP", "SG", "GB", "NG"]) {
      const decision = decisionFor(iso2);
      const restricted = decision.businessImpact.some((row) => row.level === "Restricted");
      if (restricted) {
        expect(decision.treatmentHeadline, iso2).toMatch(/Restrictions/);
      } else {
        expect(decision.treatmentHeadline, iso2).not.toMatch(/Restrictions/);
      }
    }
  });

  it("never repeats the headline as the sentence beneath it", () => {
    for (const iso2 of ["CU", "IR", "KP", "SG", "GB", "NG"]) {
      const decision = decisionFor(iso2);
      const normalise = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");
      expect(normalise(decision.treatment), iso2).not.toBe(normalise(decision.treatmentHeadline));
    }
  });
});

describe("pillar names in running prose", () => {
  it("never lower-cases the AML/CFT acronym", () => {
    // `label.toLowerCase()` rendered the verdict as "aml/cft effectiveness".
    for (const iso2 of ["VE", "IR", "NG", "GB", "SG", "CU"]) {
      const decision = decisionFor(iso2);
      const prose = [decision.verdictParagraph, decision.verdictHeadline, ...decision.mitigatingFactors].join(" ");
      expect(prose, iso2).not.toMatch(/aml\/cft/);
      expect(prose, iso2).not.toMatch(/AML\/cft|aml\/CFT/);
    }
  });

  it("uses the FATF and World Bank terms, not the retired coinages", () => {
    for (const iso2 of ["VE", "IR", "GB"]) {
      const decision = decisionFor(iso2);
      const prose = [decision.verdictParagraph, ...decision.scoreDrivers, ...decision.mitigatingFactors].join(" ");
      expect(prose, iso2).not.toMatch(/legal and supervisory safeguards/i);
      expect(prose, iso2).not.toMatch(/financial-crime effectiveness/i);
      expect(prose, iso2).not.toMatch(/institutional integrity/i);
    }
  });
});
