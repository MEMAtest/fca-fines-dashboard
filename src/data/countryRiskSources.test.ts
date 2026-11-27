import { describe, expect, it } from "vitest";
import { CPI_YEAR } from "./cpiData.js";
import { COUNTRY_RISK_SOURCES, countryRiskSourcesAsOf, countryRiskSourcesForMethodology } from "./countryRiskSources.js";

describe("country-risk source registry", () => {
  it("keeps Transparency International CPI outside the scored core", () => {
    const cpi = COUNTRY_RISK_SOURCES.find((source) => source.id === "transparency-cpi");
    expect(CPI_YEAR).toBe("2025");
    expect(cpi).toMatchObject({ scored: false, state: "current" });
  });

  it("recognises deterministic sanctions evidence at its snapshot date", () => {
    const snapshot = COUNTRY_RISK_SOURCES.find((source) => source.id === "sanctions-regimes")!;
    const scored = countryRiskSourcesAsOf(new Date(snapshot.retrievedAt!)).filter((source) => source.scored);
    expect(scored.find((source) => source.id === "sanctions-regimes")?.state).toBe("current");
    expect(scored.find((source) => source.id === "sanctions-regimes")?.note)
      .toContain("not-independently-validated");
  });

  it("automatically marks feeds stale when their operational cadence is missed", () => {
    const future = countryRiskSourcesAsOf(new Date("2028-01-01T00:00:00.000Z"));
    expect(future.find((source) => source.id === "fatf-lists")?.state).toBe("stale");
    expect(future.find((source) => source.id === "fatf-assessments")?.state).toBe("stale");
    expect(future.find((source) => source.id === "world-bank-wgi")?.state).toBe("stale");
    expect(future.find((source) => source.id === "sanctions-regimes")?.state).toBe("stale");
  });

  it("marks FATF listing and sanctions as overlays only in v3 metadata", () => {
    const current = countryRiskSourcesForMethodology("v3", new Date("2026-08-20T00:00:00.000Z"));
    expect(current.find((source) => source.id === "fatf-lists")).toMatchObject({ scored: false });
    expect(current.find((source) => source.id === "sanctions-regimes")).toMatchObject({ scored: false });
    expect(current.find((source) => source.id === "fatf-assessments")).toMatchObject({ scored: true });
    expect(current.find((source) => source.id === "world-bank-wgi")).toMatchObject({ scored: true });
    const historical = countryRiskSourcesForMethodology("v2", new Date("2026-08-20T00:00:00.000Z"));
    expect(historical.find((source) => source.id === "fatf-lists")).toMatchObject({ scored: true });
    expect(historical.find((source) => source.id === "sanctions-regimes")).toMatchObject({ scored: true });
  });
});
