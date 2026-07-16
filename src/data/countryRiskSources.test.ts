import { describe, expect, it } from "vitest";
import { CPI_YEAR } from "./cpiData.js";
import { COUNTRY_RISK_SOURCES, countryRiskSourcesAsOf } from "./countryRiskSources.js";

describe("country-risk source registry", () => {
  it("keeps Transparency International CPI outside the scored core", () => {
    const cpi = COUNTRY_RISK_SOURCES.find((source) => source.id === "transparency-cpi");
    expect(CPI_YEAR).toBe("2025");
    expect(cpi).toMatchObject({ scored: false, state: "current" });
  });

  it("does not claim readiness while official scored sources are incomplete or stale", () => {
    const scored = COUNTRY_RISK_SOURCES.filter((source) => source.scored);
    expect(scored.some((source) => source.state !== "current")).toBe(true);
  });

  it("automatically marks feeds stale when their operational cadence is missed", () => {
    const future = countryRiskSourcesAsOf(new Date("2028-01-01T00:00:00.000Z"));
    expect(future.find((source) => source.id === "fatf-lists")?.state).toBe("stale");
    expect(future.find((source) => source.id === "fatf-assessments")?.state).toBe("stale");
    expect(future.find((source) => source.id === "world-bank-wgi")?.state).toBe("stale");
  });
});
