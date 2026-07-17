import { describe, expect, it } from "vitest";
import { getCountryByIso2 } from "./countries.js";
import {
  SANCTIONS_CANDIDATE_COUNTRY_COUNT,
  SANCTIONS_CANDIDATE_SCORING_READY,
  SANCTIONS_CATALOGUE_COVERAGE,
  SANCTIONS_REGIME_CANDIDATES,
  SANCTIONS_TIER_RULES,
  getSanctionsRegimeCandidates,
} from "./sanctionsRegimeCandidates.js";
import { SANCTIONS_APPROVED_SNAPSHOT } from "./sanctionsApprovedData.js";

describe("sanctions v2 candidate catalogue", () => {
  it("covers every country-specific programme in the four reviewed official catalogues", () => {
    expect(SANCTIONS_CATALOGUE_COVERAGE.map((item) => [item.imposer, item.countryRegimeCount])).toEqual([
      ["OFAC", 25],
      ["UK", 29],
      ["EU", 49],
      ["UN", 14],
    ]);
    expect(SANCTIONS_REGIME_CANDIDATES).toHaveLength(117);
    expect(SANCTIONS_CANDIDATE_COUNTRY_COUNT).toBe(38);
  });

  it("maps each official regime once to a canonical country and specific starting evidence", () => {
    const keys = new Set<string>();
    for (const candidate of SANCTIONS_REGIME_CANDIDATES) {
      expect(getCountryByIso2(candidate.iso2), `${candidate.imposer}:${candidate.iso2}`).toBeDefined();
      const key = `${candidate.imposer}:${candidate.iso2}:${candidate.regime}`;
      expect(keys.has(key), key).toBe(false);
      keys.add(key);
      expect(candidate.catalogueUrl).toMatch(/^https:\/\//);
      expect(candidate.measureEvidenceUrl).toMatch(/^https:\/\//);
      expect(candidate.measureEvidenceUrl).not.toBe(candidate.catalogueUrl);
      expect(candidate.rationale.length).toBeGreaterThan(15);
    }
  });

  it("keeps candidate classifications out of production scoring until independent approval", () => {
    expect(SANCTIONS_CANDIDATE_SCORING_READY).toBe(false);
    expect(SANCTIONS_REGIME_CANDIDATES.every((item) => item.reviewStatus === "pending-independent-review")).toBe(true);
    expect(SANCTIONS_APPROVED_SNAPSHOT.candidateCount).toBe(SANCTIONS_REGIME_CANDIDATES.length);
    expect(SANCTIONS_APPROVED_SNAPSHOT.coverageComplete).toBe(false);
  });

  it("captures material current-scope corrections and victim-country handling", () => {
    expect(getSanctionsRegimeCandidates("SY").find((item) => item.imposer === "OFAC")?.proposedTier).toBe("targeted");
    expect(getSanctionsRegimeCandidates("IR").find((item) => item.imposer === "UN")?.proposedTier).toBe("sectoral");
    expect(getSanctionsRegimeCandidates("UA").find((item) => item.imposer === "EU")?.relationship).toBe("situation-related");
    expect(getSanctionsRegimeCandidates("US").find((item) => item.imposer === "EU")?.relationship).toBe("situation-related");
    expect(getSanctionsRegimeCandidates("CN").some((item) => item.imposer === "EU" && item.proposedTier === "sectoral")).toBe(true);
  });

  it("publishes mutually exclusive deterministic tier definitions", () => {
    expect(Object.keys(SANCTIONS_TIER_RULES)).toEqual(["comprehensive", "sectoral", "targeted"]);
    expect(SANCTIONS_TIER_RULES.comprehensive).toContain("country-wide");
    expect(SANCTIONS_TIER_RULES.sectoral).toContain("non-designation");
    expect(SANCTIONS_TIER_RULES.targeted).toContain("designated");
  });
});
