import { describe, expect, it } from "vitest";
import { buildCountryRiskGovernanceEvidenceRows } from "./countryRiskGovernancePresentation.js";

describe("country-risk governance evidence presentation", () => {
  it("exposes Venezuela corruption risk with dated World Bank provenance", () => {
    const rows = buildCountryRiskGovernanceEvidenceRows("VE");
    expect(rows).toHaveLength(6);
    expect(rows).toContainEqual(expect.objectContaining({
      key: "cc",
      label: "Corruption and integrity",
      risk: 8.4,
      vintage: "2024",
      checkedAt: "2026-08-13",
      source: "https://www.worldbank.org/en/publication/worldwide-governance-indicators",
    }));
  });

  it("does not invent rows when WGI evidence is unavailable", () => {
    expect(buildCountryRiskGovernanceEvidenceRows("VA")).toEqual([]);
  });
});
