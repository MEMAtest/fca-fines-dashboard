import { describe, expect, it } from "vitest";
import { getBoardPackCountryEvidence } from "./boardPackCountryEvidence.js";
import { countryRiskSourceStatus } from "./countryRiskSources.js";
import { SANCTIONS_APPROVED_SNAPSHOT } from "./sanctionsApprovedData.js";
import { FATF_SOURCE_URL } from "./fatfStatus.js";

describe("Board Pack country evidence", () => {
  it("follows snapshot freshness rather than the cross-check date", () => {
    const asOf = new Date("2026-11-27T12:00:00Z");
    const entries = getBoardPackCountryEvidence(asOf);
    for (const entry of entries) {
      expect(entry.state).toBe(countryRiskSourceStatus(entry.id, asOf).state);
      expect(entry.limitation).toBeTruthy();
    }
    if (SANCTIONS_APPROVED_SNAPSHOT.version === "sanctions-2026-11-15-a42d2c44079b") {
      expect(entries[1].statusLabel).toBe("Not current for reliance");
      expect(entries[1].check).toContain("27 Nov 2026");
      expect(entries[1].dates).toContain("15 Nov 2026");
    }
  });

  it("links to FATF and every source in the sanctions snapshot", () => {
    const [fatf, sanctions] = getBoardPackCountryEvidence();
    expect(fatf.sources.map(({ url }) => url)).toEqual([FATF_SOURCE_URL]);
    expect(sanctions.sources.map(({ url }) => url)).toEqual(SANCTIONS_APPROVED_SNAPSHOT.sources.map(({ url }) => url));
  });
});
