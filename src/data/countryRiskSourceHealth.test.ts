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

  it("keeps explicitly unchanged catalogues healthy while blocking only the changed catalogue", () => {
    const runs = healthyRuns();
    for (const id of ["ofac-programmes", "uk-regimes", "un-consolidated-list"]) {
      const run = runs.find((item) => item.source_id === id)!;
      run.status = "review_required";
      run.metadata = { changed: false, baselineMissing: false, reportRequiresHumanReview: true };
    }
    const eu = runs.find((item) => item.source_id === "eu-resources")!;
    eu.status = "review_required";
    eu.metadata = { changed: true, baselineMissing: false, reportRequiresHumanReview: true };

    const report = assessCountryRiskSourceHealth({ asOf, declaredSources, operationalRuns: runs });
    expect(report.status).toBe("critical");
    expect(report.issues).toEqual([
      expect.objectContaining({
        sourceId: "eu-resources",
        code: "operational-run-review-required",
      }),
    ]);
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

  it("warns immediately when a FATF attempt is unavailable but retained evidence is current", () => {
    const runs = healthyRuns();
    runs.push({
      source_id: "fatf-lists",
      status: "failed",
      retrieved_at: "2026-07-17T10:00:00.000Z",
      sha256: null,
      parser_version: "fatf-list-assurance/1.0",
      record_count: 0,
      error_message: "protected page unavailable",
      metadata: { outcome: "unavailable", retainedEvidence: true },
    });

    const report = assessCountryRiskSourceHealth({ asOf, declaredSources, operationalRuns: runs });
    expect(report.status).toBe("warning");
    expect(report.readyForScoring).toBe(true);
    expect(report.issues).toEqual([
      expect.objectContaining({
        sourceId: "fatf-lists",
        severity: "warning",
        code: "operational-run-unavailable",
      }),
    ]);
  });

  it("turns retained FATF evidence critical when the last success exceeds 14 days", () => {
    const runs = healthyRuns();
    const fatfSuccess = runs.find((run) => run.source_id === "fatf-lists")!;
    fatfSuccess.retrieved_at = "2026-07-01T08:00:00.000Z";
    runs.push({
      source_id: "fatf-lists",
      status: "failed",
      retrieved_at: "2026-07-17T10:00:00.000Z",
      sha256: null,
      parser_version: "fatf-list-assurance/1.0",
      record_count: 0,
      metadata: { outcome: "unavailable", retainedEvidence: true },
    });

    const report = assessCountryRiskSourceHealth({ asOf, declaredSources, operationalRuns: runs });
    expect(report.status).toBe("critical");
    expect(report.readyForScoring).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "operational-run-unavailable", severity: "warning" }),
      expect.objectContaining({ code: "operational-run-stale", severity: "critical" }),
    ]));
  });

  it("treats FATF list drift as review-required rather than source unavailability", () => {
    const runs = healthyRuns();
    runs.push({
      source_id: "fatf-lists",
      status: "review_required",
      retrieved_at: "2026-07-17T10:00:00.000Z",
      sha256: "live-fatf-hash",
      parser_version: "fatf-list-assurance/1.0",
      record_count: 25,
      metadata: { outcome: "drift", retainedEvidence: false },
    });

    const report = assessCountryRiskSourceHealth({ asOf, declaredSources, operationalRuns: runs });
    expect(report.status).toBe("critical");
    expect(report.readyForScoring).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      sourceId: "fatf-lists",
      code: "operational-run-review-required",
    }));
    expect(report.issues.some((issue) => issue.code === "operational-run-unavailable")).toBe(false);
  });
});
