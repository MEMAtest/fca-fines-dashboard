import { describe, expect, it } from "vitest";
import {
  buildCountryRiskContext,
  COUNTRY_RISK_CONTEXT_SCHEMA_VERSION,
  listCountryRiskContextFactors,
  listCountryRiskContexts,
} from "./countryRiskContext.js";

describe("country-risk contextual evidence", () => {
  it("covers every country and every requested factor without scoring them", () => {
    const contexts = listCountryRiskContexts();
    expect(contexts.length).toBeGreaterThanOrEqual(200);
    expect(new Set(contexts.map((entry) => entry.country.iso2)).size).toBe(contexts.length);
    for (const context of contexts) {
      expect(context.schemaVersion).toBe(COUNTRY_RISK_CONTEXT_SCHEMA_VERSION);
      expect(context.factors.map((factor) => factor.factor)).toEqual([...listCountryRiskContextFactors()]);
      expect(context.factors.every((factor) => factor.scored === false)).toBe(true);
    }
  });

  it("returns checked-in provenance for tax, stability and beneficial ownership", () => {
    const context = buildCountryRiskContext("GB")!;
    expect(context.factors.find((factor) => factor.factor === "tax-cooperation")).toMatchObject({
      availability: "available",
      source: { provider: "Council of the European Union" },
    });
    expect(context.factors.find((factor) => factor.factor === "political-stability-conflict")).toMatchObject({
      availability: "available",
      source: { provider: "World Bank Worldwide Governance Indicators" },
    });
    expect(context.factors.find((factor) => factor.factor === "beneficial-ownership")).toMatchObject({
      scored: false,
      source: { provider: "Open Ownership" },
    });
  });

  it("fails closed for threat families without a reviewed dataset", () => {
    const context = buildCountryRiskContext("GB")!;
    for (const factorId of ["organised-crime", "fraud-cybercrime", "terrorism-proliferation", "trafficking", "financial-secrecy-offshore"] as const) {
      const factor = context.factors.find((candidate) => candidate.factor === factorId)!;
      expect(factor.availability).toBe("unavailable");
      expect(factor.value).toBeNull();
      expect(factor.source).toBeNull();
      expect(factor.scored).toBe(false);
      expect(factor.sourceCandidates.length).toBeGreaterThan(0);
      expect(factor.sourceCandidates.every((candidate) => candidate.reviewStatus === "candidate-not-ingested")).toBe(true);
    }
  });

  it("returns null for unknown jurisdictions", () => {
    expect(buildCountryRiskContext("ZZ")).toBeNull();
  });
});
