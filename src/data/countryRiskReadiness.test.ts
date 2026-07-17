import { describe, expect, it } from "vitest";
import { assessCountryRiskReadiness } from "./countryRiskReadiness.js";
import type { CountryRiskV2Result } from "./countryRiskV2.js";
import type { CountryRiskSourceStatus } from "./countryRiskSources.js";

const result = (status: CountryRiskV2Result["status"], score: number | null): CountryRiskV2Result => ({
  methodologyVersion: "2.0.0",
  iso2: "GB",
  asOf: "2026-07-17T00:00:00.000Z",
  score,
  preFloorScore: score,
  band: score === null ? null : "moderate",
  bandAdjustment: null,
  status,
  confidence: status === "complete" ? "high" : "low",
  pillars: {} as CountryRiskV2Result["pillars"],
  floors: [],
  regulatoryFlags: [],
  limitingReasons: [],
  arithmetic: "fixture",
});

const source = (state: CountryRiskSourceStatus["state"]): CountryRiskSourceStatus => ({
  id: "fatf-lists",
  name: "FATF",
  sourceUrl: "https://example.test",
  scored: true,
  cadence: "weekly",
  state,
  effectiveAt: "2026-06-01",
  retrievedAt: "2026-07-17T00:00:00.000Z",
  sha256: "a".repeat(64),
  note: "fixture",
});

describe("country-risk default readiness", () => {
  it("allows explicit provisional results", () => {
    expect(assessCountryRiskReadiness([result("complete", 4), result("provisional", 5)], [source("current")]))
      .toMatchObject({ readyForDefault: true, coverage: { provisional: 1, insufficientData: 0 } });
  });

  it("fails closed on insufficient data, stale sources or a zero headline", () => {
    expect(assessCountryRiskReadiness([result("insufficient-data", null)], [source("current")]).readyForDefault).toBe(false);
    expect(assessCountryRiskReadiness([result("complete", 4)], [source("stale")]).readyForDefault).toBe(false);
    expect(assessCountryRiskReadiness([result("complete", 0)], [source("current")]).readyForDefault).toBe(false);
  });
});
