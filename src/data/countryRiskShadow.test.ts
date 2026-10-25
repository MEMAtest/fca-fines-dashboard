import { describe, expect, it } from "vitest";
import { pageCountries } from "./countryView.js";
import { computeCountryRiskV3, type CountryRiskV3Result } from "./countryRiskV3.js";
import {
  buildCountryRiskShadowReport,
  parseAsOfDate,
  parseShadowBenchmarkJson,
  shadowBeneficialOwnership,
  validateShadowBenchmark,
  SHADOW_BENCHMARK_MAX_BYTES,
  type ShadowBenchmark,
} from "./countryRiskShadow.js";

const asOf = parseAsOfDate("2026-10-25");

function withRegister(result: CountryRiskV3Result, tier: "none-identified" | "unrecorded" | "cdd-accessible", risk: number | null): CountryRiskV3Result {
  return {
    ...result,
    beneficialOwnership: {
      ...result.beneficialOwnership,
      register: { ...result.beneficialOwnership.register, tier, risk },
    },
  };
}

describe("offline country-risk shadow", () => {
  it("accepts only deterministic calendar-date as-of values", () => {
    expect(parseAsOfDate("2026-10-25").toISOString()).toBe("2026-10-25T00:00:00.000Z");
    expect(() => parseAsOfDate("2026-02-30")).toThrow(/calendar date/);
    expect(() => parseAsOfDate("2026-10")).toThrow(/YYYY-MM-DD/);
  });

  it("withholds unknown register-access risk while retaining fully-rated FATF-only BO", () => {
    const gb = computeCountryRiskV3("GB", { asOf });
    expect(gb.beneficialOwnership.evidenceCount).toBe(3);
    const result = shadowBeneficialOwnership(withRegister(gb, "none-identified", 9));
    const expectedFatfOnly = Math.round((gb.beneficialOwnership.effectiveness! * 0.6 + gb.beneficialOwnership.companies! * 0.2 + gb.beneficialOwnership.trustsAndArrangements! * 0.2) * 10) / 10;
    expect(result).toMatchObject({ status: "FATF-only", riskUsed: null, score: expectedFatfOnly, availability: "available" });
    expect(result.formula).toContain("register-access risk withheld as unknown");
  });

  it("returns unavailable rather than nine when there are no FATF BO ratings and register access is unknown", () => {
    const noFatf = computeCountryRiskV3("LY", { asOf });
    const unknown = withRegister(noFatf, "unrecorded", null);
    const result = shadowBeneficialOwnership(unknown);
    expect(unknown.beneficialOwnership.evidenceCount).toBe(0);
    expect(result).toMatchObject({ score: null, availability: "unavailable", status: "unavailable", riskUsed: null });
  });

  it("keeps scores unchanged for known register tiers", () => {
    const gb = computeCountryRiskV3("GB", { asOf });
    const result = shadowBeneficialOwnership(gb);
    expect(result).toMatchObject({ score: gb.beneficialOwnership.score, availability: gb.beneficialOwnership.availability, status: "unchanged-known-register", riskUsed: gb.beneficialOwnership.register.risk });
  });

  it("reuses the v3.1 sensitivity and holds all 214 headline inputs constant", () => {
    const countries = pageCountries().map((country) => ({
      iso2: country.iso2,
      country: country.name,
      result: computeCountryRiskV3(country.iso2, { asOf }),
    }));
    const report = buildCountryRiskShadowReport({ asOf, countries });
    expect(report.summary.countries).toBe(214);
    expect(report.summary).toMatchObject({ complete: 190, provisional: 14, governanceProxies: 10, headlineChanges: 0 });
    expect(report.methodology).toMatchObject({ baseline: "Country Risk v3.1.0", headlineWeightsChanged: false, headlineScoresChanged: false, sensitivitySource: "existing v3.1 sensitivity metadata; not recomputed" });
    expect(report.rows.every((row) => row.headline === countries.find((item) => item.iso2 === row.iso2)?.result.score)).toBe(true);
    expect(report.rows.every((row) => JSON.stringify(row.headlineWeights) === JSON.stringify({
      effectiveness: countries.find((item) => item.iso2 === row.iso2)?.result.pillars.effectiveness.appliedWeight,
      safeguards: countries.find((item) => item.iso2 === row.iso2)?.result.pillars.safeguards.appliedWeight,
      governance: countries.find((item) => item.iso2 === row.iso2)?.result.pillars.governance.appliedWeight,
    }))).toBe(true);
    expect(report.rows.every((row) => row.sensitivity.nearThreshold === countries.find((item) => item.iso2 === row.iso2)?.result.sensitivity.nearThreshold)).toBe(true);
    expect(report.summary.nearThreshold).toBe(41);
    expect(report.summary.unknownRegister).toBe(126);
    expect(report.summary.boBecameUnavailable).toBe(17);
    expect(report.summary.boContextChanged).toBe(83);
  });

  it("requires explicit licence and rights metadata for bounded manual benchmark input", () => {
    const fixture = {
      metadata: { sourceName: "User-supplied comparison", licence: "CC BY 4.0", rightsConfirmed: true, vintage: "2026" },
      observations: [
        { iso2: "GB", region: "Europe", score: 4.2, vintage: "2026" },
        { iso2: "FR", region: "Europe", score: 3.8, vintage: "2026" },
        { iso2: "US", region: "North America", score: 4.8, vintage: "2025" },
      ],
    };
    expect(() => validateShadowBenchmark({ ...fixture, metadata: { ...fixture.metadata, rightsConfirmed: false } })).toThrow(/rightsConfirmed/);
    expect(() => validateShadowBenchmark({ ...fixture, metadata: { ...fixture.metadata, licence: "" } })).toThrow(/licence/);
    expect(() => validateShadowBenchmark({ ...fixture, metadata: { ...fixture.metadata, vintage: "2026-02-30" } })).toThrow(/calendar date/);
    expect(() => validateShadowBenchmark({ ...fixture, observations: [{ ...fixture.observations[0], vintage: "2026-02-30" }] })).toThrow(/calendar date/);
    expect(() => parseShadowBenchmarkJson("x".repeat(SHADOW_BENCHMARK_MAX_BYTES + 1))).toThrow(/exceeds/);
    expect(() => parseShadowBenchmarkJson("not json")).toThrow(/valid JSON/);
    expect(validateShadowBenchmark(fixture).metadata.rightsConfirmed).toBe(true);
  });

  it("limits manual benchmark comparisons to matched-vintage regional observations", () => {
    const benchmark: ShadowBenchmark = validateShadowBenchmark({
      metadata: { sourceName: "Licensed fixture", licence: "CC BY 4.0", rightsConfirmed: true, vintage: "2026" },
      observations: [
        { iso2: "GB", region: "Europe", score: 4.2, vintage: "2026" },
        { iso2: "FR", region: "Europe", score: 3.8, vintage: "2026" },
        { iso2: "US", region: "Europe", score: 4.8, vintage: "2025" },
      ],
    });
    const gb = computeCountryRiskV3("GB", { asOf });
    const report = buildCountryRiskShadowReport({ asOf, benchmark, countries: [{ iso2: "GB", country: "United Kingdom", result: gb }] });
    expect(report.rows[0].benchmark).toMatchObject({ vintage: "2026", sameRegionBenchmarkRows: 1, comparability: "descriptive matched-vintage peers only; not a validated ranking" });
    expect(report.summary.benchmarkComparableCountryRows).toBe(1);
    expect(report.summary.benchmarkRegionalPeerLinks).toBe(1);
    expect(report.benchmark).toMatchObject({ suppliedRows: 3, matchedVintageRows: 2, unmatchedVintageRows: 1, rightsConfirmed: true });
    expect(report.limitations.some((item) => item.includes("No additional Basel or WGI data was scraped"))).toBe(true);
  });

  it("accepts at most 250 validated country results and rejects duplicate identities", () => {
    const gb = computeCountryRiskV3("GB", { asOf });
    expect(() => buildCountryRiskShadowReport({ asOf, countries: [] })).toThrow(/between 1 and 250/);
    expect(() => buildCountryRiskShadowReport({ asOf, countries: [
      { iso2: "GB", country: "United Kingdom", result: gb },
      { iso2: "GB", country: "Duplicate", result: gb },
    ] })).toThrow(/duplicate/);
  });
});
