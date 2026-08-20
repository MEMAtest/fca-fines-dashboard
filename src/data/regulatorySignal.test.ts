import { describe, expect, it } from "vitest";
import {
  getRegulatorySignalCountry,
  listRegulatorySignalCountries,
} from "./regulatorySignal.js";
import {
  buildRegulatorySignalEvidence,
  regulatorySignalEvidenceCsv,
} from "./regulatorySignalExport.js";

describe("regulatory signal evidence manifest", () => {
  it("covers all 213 country-page jurisdictions with an explicit disposition", () => {
    const countries = listRegulatorySignalCountries();
    expect(countries).toHaveLength(213);
    expect(new Set(countries.map((country) => country.iso2)).size).toBe(213);
    expect(countries.every((country) => country.authorityEvidenceState.length > 0)).toBe(true);
  });

  it("keeps the public index null during research-only operation", () => {
    const evidence = buildRegulatorySignalEvidence("VE");
    expect(evidence).toMatchObject({
      status: "research-only",
      transparencyIndex: null,
      country: { iso2: "VE", name: "Venezuela" },
    });
    expect(evidence?.ecosystem.authorities.length).toBeGreaterThan(0);
    expect(evidence?.limitations.join(" ")).toContain("intentionally null");
  });

  it("preserves unobservable and structural states instead of treating them as zero", () => {
    expect(buildRegulatorySignalEvidence("KP")?.evidenceDisposition.state).toBe("external-risk-evidence-only");
    expect(buildRegulatorySignalEvidence("PW")?.ecosystem.authorityCount).toBeGreaterThan(0);
    expect(getRegulatorySignalCountry("ZZ")).toBeNull();
  });

  it("exports evidence rows with source-access state and no score", () => {
    const evidence = buildRegulatorySignalEvidence("GB")!;
    const csv = regulatorySignalEvidenceCsv(evidence);
    expect(csv).toContain("accessState");
    expect(csv).not.toContain("Transparency Index");
    expect(csv).not.toMatch(/,[0-9]+\.[0-9]+,/);
  });
});
