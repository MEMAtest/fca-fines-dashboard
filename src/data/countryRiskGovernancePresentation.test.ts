import { describe, expect, it } from "vitest";
import { buildCountryRiskGovernanceEvidenceRows } from "./countryRiskGovernancePresentation.js";
import { GOVERNANCE_RETRIEVED_AT, GOVERNANCE_VINTAGE } from "./governanceData.js";

describe("country-risk governance evidence presentation", () => {
  it("exposes Venezuela corruption risk with dated World Bank provenance", () => {
    const rows = buildCountryRiskGovernanceEvidenceRows("VE");
    expect(rows).toHaveLength(6);
    expect(rows).toContainEqual(expect.objectContaining({
      key: "cc",
      label: "Corruption and integrity",
      risk: 8.4,
      // Vintage and retrieval date come from the source module rather than
      // being written out here. Hardcoding the retrieval date meant the
      // monthly WGI ingest broke this test by definition every time it ran,
      // whether or not any governance figure had actually moved. The point of
      // the assertion is that provenance is present and matches the data, so
      // it is checked against the data.
      vintage: GOVERNANCE_VINTAGE,
      checkedAt: GOVERNANCE_RETRIEVED_AT.slice(0, 10),
      source: "https://www.worldbank.org/en/publication/worldwide-governance-indicators",
    }));
  });

  it("does not invent rows when WGI evidence is unavailable", () => {
    expect(buildCountryRiskGovernanceEvidenceRows("VA")).toEqual([]);
  });
});
