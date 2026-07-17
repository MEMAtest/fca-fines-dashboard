import { describe, expect, it } from "vitest";
import type { CountryRiskSourceStatus } from "./countryRiskSources.js";
import {
  assessCountryRiskSourceHealth,
  COUNTRY_RISK_OPERATIONAL_SOURCE_RULES,
  type CountryRiskOperationalSourceRun,
} from "./countryRiskSourceHealth.js";

const asOf = new Date("2026-07-17T12:00:00.000Z");
const declaredSources: CountryRiskSourceStatus[] = [
  {
    id: "fatf-lists",
    name: "FATF lists",
    sourceUrl: "https://example.test/fatf",
    scored: true,
    cadence: "weekly",
    state: "current",
    effectiveAt: "2026-06-19",
    retrievedAt: "2026-07-16",
    sha256: "declared",
    note: "",
  },
];

function healthyRuns(): CountryRiskOperationalSourceRun[] {
  return COUNTRY_RISK_OPERATIONAL_SOURCE_RULES.map((rule) => ({
    source_id: rule.id,
    status: "succeeded",
    retrieved_at: rule.maximumAgeDays > 45 ? "2026-01-01T00:00:00.000Z" : "2026-07-17T08:00:00.000Z",
    sha256: `sha-${rule.id}`,
    parser_version: "test/1",
    record_count: 10,
  }));
}

describe("country-risk source health", () => {
  it("passes only when every required run is current, non-empty and hashed", () => {
    const report = assessCountryRiskSourceHealth({ asOf, declaredSources, operationalRuns: healthyRuns() });
    expect(report.status).toBe("healthy");
    expect(report.readyForScoring).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.publicMessage).toBe("Sources checked through 17 Jul 2026");
  });

  it("fails closed for missing, failed, empty and unhashed runs", () => {
    const runs = healthyRuns().filter((run) => run.source_id !== "ofac-programmes");
    const uk = runs.find((run) => run.source_id === "uk-regimes")!;
    uk.status = "failed";
    uk.record_count = 0;
    uk.sha256 = null;
    const report = assessCountryRiskSourceHealth({ asOf, declaredSources, operationalRuns: runs });
    expect(report.status).toBe("critical");
    expect(report.readyForScoring).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "missing-operational-run",
      "operational-run-failed",
      "operational-run-empty",
      "operational-run-unhashed",
    ]));
  });

  it("flags stale operational evidence and unhealthy declared scored sources", () => {
    const runs = healthyRuns();
    runs.find((run) => run.source_id === "eu-resources")!.retrieved_at = "2026-07-01T00:00:00.000Z";
    const sources = [{ ...declaredSources[0], state: "stale" as const }];
    const report = assessCountryRiskSourceHealth({ asOf, declaredSources: sources, operationalRuns: runs });
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "declared-source-unhealthy",
      "operational-run-stale",
    ]));
  });

  it("treats an unavailable operational database as critical", () => {
    const report = assessCountryRiskSourceHealth({
      asOf,
      declaredSources,
      operationalRuns: [],
      databaseAvailable: false,
      databaseError: "connection refused",
    });
    expect(report.status).toBe("critical");
    expect(report.issues[0]).toMatchObject({ code: "database-unavailable" });
  });
});
