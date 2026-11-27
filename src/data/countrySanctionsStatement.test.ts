import { describe, it, expect } from "vitest";
import { getCountryByIso2 } from "./countries.js";
import { buildCountryView } from "./countryView.js";
import { buildCountryFaqs } from "./countryFaq.js";
import { buildSanctionsStatement, sanctionsCheckedDate, SCREENING_LINE } from "./countrySanctionsStatement.js";
import {
  DOMESTIC_SANCTIONS_REGIMES,
  domesticSanctionsCountries,
  getDomesticSanctionsRegime,
} from "./domesticSanctionsRegimes.js";
import { SANCTIONS_APPROVED_SNAPSHOT } from "./sanctionsApprovedData.js";

function stmt(iso2: string) {
  const view = buildCountryView(getCountryByIso2(iso2)!);
  return buildSanctionsStatement({
    name: view.country.name,
    iso2,
    sanctions: view.sanctions,
    coverageComplete: view.sanctionsCoverageComplete,
    checkedDate: sanctionsCheckedDate(),
  });
}

const BANNED = /legal treatment overlay|direct country-level|No direct programme|None identified|\bmay\b|stale/i;

describe("domestic sanctions regimes data", () => {
  it("has official https sources, list names and a review date for every entry", () => {
    for (const regime of DOMESTIC_SANCTIONS_REGIMES) {
      expect(regime.iso2.length).toBeGreaterThan(0);
      expect(regime.laws.length).toBeGreaterThan(0);
      expect(regime.listName.length).toBeGreaterThan(3);
      expect(regime.sourceUrl).toMatch(/^https:\/\//);
      expect(regime.listUrl).toMatch(/^https:\/\//);
      expect(regime.reviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
  it("covers Canada, the UK, the US and EU members, and nothing for unlisted countries", () => {
    expect(getDomesticSanctionsRegime("CA")?.laws.join(" ")).toContain("Special Economic Measures Act");
    expect(getDomesticSanctionsRegime("CA")?.laws.join(" ")).toContain("Magnitsky");
    expect(getDomesticSanctionsRegime("CA")?.laws.join(" ")).toContain("United Nations Act");
    expect(getDomesticSanctionsRegime("GB")).toBeDefined();
    expect(getDomesticSanctionsRegime("US")).toBeDefined();
    expect(getDomesticSanctionsRegime("FR")?.supranational).toBe("EU");
    expect(getDomesticSanctionsRegime("NG")).toBeUndefined();
    expect(domesticSanctionsCountries()).toContain("DE");
  });
});

describe("sanctions statement wording", () => {
  it("uses the promoted snapshot date as the single check date", () => {
    expect(sanctionsCheckedDate()).toBe(SANCTIONS_APPROVED_SNAPSHOT.effectiveAt);
  });

  it("(a) Canada: not under country sanctions, plus its own regime", () => {
    const s = stmt("CA");
    expect(s.headline).toBe("Canada is not under UN, UK, EU or US country sanctions (checked 15 Nov 2026).");
    expect(s.domestic).toBe(
      "Canada's own sanctions: Special Economic Measures Act, Justice for Victims of Corrupt Foreign Officials Act (Sergei Magnitsky Law), United Nations Act. Official list: Consolidated Canadian Autonomous Sanctions List.",
    );
    expect(s.screening).toBe(SCREENING_LINE);
    for (const text of [s.headline, s.domestic!, s.screening]) expect(text).not.toMatch(BANNED);
  });

  it("(b) Iran and North Korea: comprehensive sanctions, named imposers", () => {
    for (const iso2 of ["IR", "KP"]) {
      const s = stmt(iso2);
      expect(s.state).toBe("comprehensive");
      expect(s.headline).toMatch(/is under comprehensive sanctions from the US/);
      expect(s.headline).not.toMatch(BANNED);
    }
  });

  it("(c) targeted or sectoral: states who imposes what", () => {
    const ve = stmt("VE");
    expect(ve.headline).toBe("Venezuela is under sectoral sanctions from the US, UK and EU (checked 15 Nov 2026).");
    const ru = stmt("RU");
    expect(ru.state).not.toBe("none");
    expect(ru.headline).not.toMatch(BANNED);
  });

  it("(d) no sanctions and no domestic entry: says nothing about a domestic regime", () => {
    const s = stmt("NG");
    expect(s.headline).toBe("Nigeria is not under UN, UK, EU or US country sanctions (checked 15 Nov 2026).");
    expect(s.domestic).toBeNull();
    expect(s.domesticRegime).toBeUndefined();
  });

  it("FAQ answer carries all three parts for Canada, in one place", () => {
    const view = buildCountryView(getCountryByIso2("CA")!);
    const answer = buildCountryFaqs(view).find((f) => f.question.includes("subject to sanctions"))!.answer;
    expect(answer).toContain("No. Canada is not under UN, UK, EU or US country sanctions");
    expect(answer).toContain("Consolidated Canadian Autonomous Sanctions List");
    expect(answer.split(SCREENING_LINE).length).toBe(2);
  });
});
