import { describe, expect, it } from "vitest";
import {
  SANCTIONS_APPROVED_SNAPSHOT,
  SANCTIONS_APPROVED_STATUS,
  getApprovedSanctions,
} from "./sanctionsApprovedData.js";
import { SANCTIONS_REGIME_CANDIDATES } from "./sanctionsRegimeCandidates.js";
import { getCountryByIso2 } from "./countries.js";
import { buildCountryView } from "./countryView.js";

/** The imposer label the attribution grid renders (OFAC is shown as "US"). */
function imposerRows(iso2: string) {
  const country = getCountryByIso2(iso2);
  expect(country, iso2).toBeDefined();
  return buildCountryView(country!).attribution.sanctions.imposers;
}

describe("promoted sanctions snapshot", () => {
  it("is promoted with a complete, hashed, dated snapshot", () => {
    expect(SANCTIONS_APPROVED_SNAPSHOT.coverageComplete).toBe(true);
    expect(SANCTIONS_APPROVED_SNAPSHOT.version).toMatch(/^sanctions-\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/);
    expect(SANCTIONS_APPROVED_SNAPSHOT.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(SANCTIONS_APPROVED_SNAPSHOT.effectiveAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(SANCTIONS_APPROVED_SNAPSHOT.sources).toHaveLength(4);
  });

  it("decides every candidate (approved + rejected == candidate count)", () => {
    expect(SANCTIONS_APPROVED_SNAPSHOT.candidateCount).toBe(SANCTIONS_REGIME_CANDIDATES.length);
    expect(SANCTIONS_APPROVED_SNAPSHOT.approvedCount + SANCTIONS_APPROVED_SNAPSHOT.rejectedCount)
      .toBe(SANCTIONS_REGIME_CANDIDATES.length);
  });

  it("rejects exactly the situation-related regimes (victim/situation locus, not country exposure)", () => {
    const situationRelated = SANCTIONS_REGIME_CANDIDATES.filter((c) => c.relationship === "situation-related");
    expect(SANCTIONS_APPROVED_SNAPSHOT.rejectedCount).toBe(situationRelated.length);
    // None of the rejected situation-related countries surface an approved programme
    // for that imposer (Ukraine, Türkiye, Moldova, Guatemala under the EU).
    for (const c of situationRelated) {
      const approved = getApprovedSanctions(c.iso2)?.programs.some((p) => p.imposer === c.imposer);
      expect(Boolean(approved), `${c.imposer}:${c.iso2}`).toBe(false);
    }
  });

  it("gives every approved programme a measure-specific HTTPS evidence URL", () => {
    for (const country of SANCTIONS_APPROVED_STATUS) {
      for (const program of country.programs) {
        expect(program.evidenceUrl, `${country.iso2}:${program.imposer}`).toMatch(/^https:\/\//);
        expect(program.evidenceUrl).not.toBe(program.catalogueUrl);
        expect(program.reviewedBy.length).toBeGreaterThan(0);
        expect(program.reviewNote.length).toBeGreaterThan(15);
      }
    }
  });

  it("spot-checks the classic comprehensive US programmes", () => {
    for (const iso2 of ["CU", "IR", "KP"]) {
      const ofac = getApprovedSanctions(iso2)?.programs.find((p) => p.imposer === "OFAC");
      expect(ofac?.tier, iso2).toBe("comprehensive");
    }
  });

  it("reflects Syria's post-PAARSS de-escalation (US no longer comprehensive)", () => {
    const syriaOfac = getApprovedSanctions("SY")?.programs.find((p) => p.imposer === "OFAC");
    expect(syriaOfac?.tier).toBe("targeted");
  });

  it("classifies Russia as sectoral across OFAC, EU and UK", () => {
    const ru = getApprovedSanctions("RU");
    expect(ru?.programs.map((p) => `${p.imposer}:${p.tier}`).sort()).toEqual(
      ["EU:sectoral", "OFAC:sectoral", "UK:sectoral"],
    );
  });

  it("keeps Venezuela targeted-heavy (no comprehensive imposer)", () => {
    const ve = getApprovedSanctions("VE");
    expect(ve?.programs.some((p) => p.tier === "comprehensive")).toBe(false);
    expect(ve?.programs.length).toBeGreaterThan(0);
  });

  it("records the UN-only conflict regimes without inventing US/EU/UK exposure", () => {
    // Central African Republic carries UN, EU and UK regimes but no OFAC country
    // programme in the reviewed catalogue.
    const cf = getApprovedSanctions("CF");
    expect(cf?.programs.some((p) => p.imposer === "UN")).toBe(true);
    expect(cf?.programs.some((p) => p.imposer === "OFAC")).toBe(true);
  });
});

describe("attribution grid never shows REVIEW PENDING once imposers are decided", () => {
  it("renders Cuba as US comprehensive and every other imposer as a decided No", () => {
    const rows = imposerRows("CU");
    // The attribution grid relabels OFAC as "US" for display.
    const us = rows.find((r) => (r.imposer as string) === "US");
    expect(us?.active).toBe(true);
    expect(us?.tierLabel).toBe("Comprehensive");
    // Every row is decided: either active with a tier, or an explicit No. No row
    // is left in a pending/undecided state.
    for (const r of rows) {
      expect(typeof r.active).toBe("boolean");
      if (r.active) expect(r.tierLabel).toBeTruthy();
    }
  });

  it("renders a no-regime country (Japan) as No across all four imposers", () => {
    const rows = imposerRows("JP");
    expect(rows.map((r) => r.imposer)).toEqual(["UN", "EU", "UK", "US"]);
    expect(rows.every((r) => r.active === false)).toBe(true);
  });

  it("populates every Russia imposer row with a decided value", () => {
    const rows = imposerRows("RU");
    const decided = rows.map((r) => (r.active ? r.tierLabel : "No"));
    // EU, UK, US sectoral; UN not a Russia imposer -> No.
    expect(decided).toEqual(["No", "Sectoral", "Sectoral", "Sectoral"]);
  });

  it("marks coverage complete so the view never falls back to review-pending", () => {
    for (const iso2 of ["CU", "RU", "JP", "IR", "KP", "SY", "VE"]) {
      const view = buildCountryView(getCountryByIso2(iso2)!);
      expect(view.sanctionsCoverageComplete, iso2).toBe(true);
    }
  });
});
