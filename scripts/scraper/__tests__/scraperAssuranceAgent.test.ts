import { describe, expect, it } from "vitest";
import type { LiveRegulatorHealthResult } from "../lib/liveRegulatorHealth.js";
import {
  buildAssuranceDecision,
  buildDeepSeekMessages,
  buildDeepSeekSafeRetryMessages,
  buildScraperRunIssues,
  buildReviewedAmountRegressionIssues,
  buildSesEmailInput,
  isStaleRunningRun,
  shouldSendQuietAlert,
  estimateDeepSeekCost,
  redactText,
  type ReviewedAmountSentinelRow,
  type AssuranceReport,
} from "../../monitoring/scraperAssuranceAgent.js";
import { getReviewedFmanzAmountEvents } from "../fmanzAmountAttribution.js";

function healthResult(
  regulator: string,
  severity: LiveRegulatorHealthResult["severity"],
): LiveRegulatorHealthResult {
  return {
    regulator,
    fullName: regulator,
    cadence: "daily",
    confidence: "standard",
    automationLevel: "automated",
    recordCount: 10,
    earliestRecordDate: "2024-01-01",
    latestRecordDate: "2026-01-01",
    futureRecordCount: 0,
    latestFutureRecordDate: null,
    ageDays: 10,
    freshnessWindowDays: 180,
    minimumHealthyRecords: 5,
    zeroResultPolicy: "investigate",
    sourceContractSummary: "Automated official source.",
    operatorAction: "Investigate source drift.",
    status: severity === "ok" ? "ok" : "warning",
    severity,
    message: `${regulator} test message`,
  };
}

function reviewedAmountRows(): ReviewedAmountSentinelRow[] {
  return getReviewedFmanzAmountEvents().map((event, reviewedOrdinal) => {
    const manual = event.firm === "AA Insurance Limited (AAI)";
    return {
      reviewedOrdinal,
      reviewedFirm: event.firm,
      reviewedDate: event.date,
      recordId: `record-${reviewedOrdinal}`,
      publicCaseId: `case-${reviewedOrdinal}`,
      amountOriginal: event.amount,
      currency: event.currency,
      amountQuality: manual ? "verified_override" : "derived_explicit",
      requiresAmountReview: false,
      trustedAmountGbp: 100_000,
      amountVerificationUrl: manual ? "https://www.fma.govt.nz/reviewed-evidence.pdf" : null,
      amountOverrideReason: manual ? "Verified against the official judgment." : null,
    };
  });
}

describe("scraperAssuranceAgent", () => {
  it("reports a reviewed positive source amount becoming withheld without restoring it", () => {
    const rows = reviewedAmountRows();
    const towerOrdinal = getReviewedFmanzAmountEvents().findIndex((event) => event.firm === "Tower Limited");
    rows[towerOrdinal] = {
      ...rows[towerOrdinal]!,
      amountQuality: "aggregate_unallocated",
      requiresAmountReview: true,
      trustedAmountGbp: null,
    };

    const issues = buildReviewedAmountRegressionIssues(rows);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      regulator: "FMANZ",
      reviewedCase: "Tower Limited (2025-12-09)",
      recordIds: [`record-${towerOrdinal}`],
      publicCaseIds: [`case-${towerOrdinal}`],
      reasonCode: "reviewed_positive_amount_withheld",
    });
    expect(issues[0]?.message).not.toContain("restore");

    const decision = buildAssuranceDecision([healthResult("FMANZ", "ok")], [], {}, issues);
    expect(decision.status).toBe("action_required");
    expect(decision.actionRequiredCount).toBe(1);
    expect(decision.shouldCallAi).toBe(false);
  });

  it("detects native amount or currency drift even when the amount remains trusted", () => {
    const rows = reviewedAmountRows();
    const towerOrdinal = getReviewedFmanzAmountEvents().findIndex((event) => event.firm === "Tower Limited");
    rows[towerOrdinal] = { ...rows[towerOrdinal]!, amountOriginal: 7_000_001 };
    expect(buildReviewedAmountRegressionIssues(rows).map((issue) => issue.reasonCode)).toEqual([
      "reviewed_source_amount_changed",
    ]);

    const currencyRows = reviewedAmountRows();
    currencyRows[towerOrdinal] = { ...currencyRows[towerOrdinal]!, currency: "USD" };
    expect(buildReviewedAmountRegressionIssues(currencyRows).map((issue) => issue.reasonCode)).toEqual([
      "reviewed_source_currency_changed",
    ]);
  });

  it("exempts only an evidenced verified manual override from tuple-value drift", () => {
    const rows = reviewedAmountRows();
    const overrideOrdinal = getReviewedFmanzAmountEvents().findIndex((event) => event.firm === "AA Insurance Limited (AAI)");
    rows[overrideOrdinal] = {
      ...rows[overrideOrdinal]!,
      amountOriginal: 1,
      currency: "USD",
    };
    expect(buildReviewedAmountRegressionIssues(rows)).toEqual([]);

    rows[overrideOrdinal] = { ...rows[overrideOrdinal]!, amountVerificationUrl: null };
    expect(buildReviewedAmountRegressionIssues(rows).map((issue) => issue.reasonCode)).toEqual([
      "reviewed_source_amount_changed",
    ]);
  });

  it("raises a bounded action-required issue for a missing reviewed identity and ignores unreviewed source growth", () => {
    const rows = reviewedAmountRows();
    const towerOrdinal = getReviewedFmanzAmountEvents().findIndex((event) => event.firm === "Tower Limited");
    rows[towerOrdinal] = { ...rows[towerOrdinal]!, recordId: null, publicCaseId: null };
    rows.push({
      reviewedOrdinal: 99,
      reviewedFirm: "New FMANZ source row",
      reviewedDate: "2026-01-01",
      recordId: "unreviewed-growth",
      publicCaseId: "unreviewed-growth",
      amountOriginal: 1,
      currency: "NZD",
      amountQuality: "reported",
      requiresAmountReview: false,
      trustedAmountGbp: 1,
      amountVerificationUrl: null,
      amountOverrideReason: null,
    });

    const issues = buildReviewedAmountRegressionIssues(rows);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.reasonCode).toBe("reviewed_source_identity_missing");
    expect(issues[0]?.recordIds).toEqual([]);
    expect(issues[0]?.message.length).toBeLessThan(180);
    expect(issues.length).toBeLessThanOrEqual(8);
  });

  it("marks a killed run stale from its last heartbeat", () => {
    const now = Date.parse("2026-08-25T12:00:00Z");
    expect(isStaleRunningRun({ status: "running", startedAt: "2026-08-25T08:00:00Z", heartbeatAt: "2026-08-25T08:30:00Z" }, now)).toBe(true);
    expect(isStaleRunningRun({ status: "running", startedAt: "2026-08-25T11:00:00Z", heartbeatAt: "2026-08-25T11:45:00Z" }, now)).toBe(false);
  });

  it("suppresses unchanged alert fingerprints but sends transitions", () => {
    expect(shouldSendQuietAlert({ status: "action_required", fingerprint: "first", previousStatus: null, previousFingerprint: null })).toBe(true);
    expect(shouldSendQuietAlert({ status: "action_required", fingerprint: "same", previousStatus: "action_required", previousFingerprint: "same" })).toBe(false);
    expect(shouldSendQuietAlert({ status: "action_required", fingerprint: "changed", previousStatus: "action_required", previousFingerprint: "same" })).toBe(true);
    expect(shouldSendQuietAlert({ status: "critical", fingerprint: "escalated", previousStatus: "warning", previousFingerprint: "changed" })).toBe(true);
    expect(shouldSendQuietAlert({ status: "ok", fingerprint: "recovered", previousStatus: "action_required", previousFingerprint: "same" })).toBe(true);
    expect(shouldSendQuietAlert({ status: "ok", fingerprint: "recovered", previousStatus: "healthy", previousFingerprint: "recovered" })).toBe(false);
    expect(shouldSendQuietAlert({ status: "watch", fingerprint: "watch|same", previousStatus: "warning", previousFingerprint: "watch|same" })).toBe(false);
    expect(shouldSendQuietAlert({ status: "watch", fingerprint: "watch|recovered", previousStatus: "warning", previousFingerprint: "action_required|same" })).toBe(true);
    expect(shouldSendQuietAlert({ status: "watch", fingerprint: "watch|recovered", previousStatus: "warning", previousFingerprint: "watch|recovered" })).toBe(false);
  });
  it("does not call AI for healthy or watch-only findings by default", () => {
    expect(
      buildAssuranceDecision([healthResult("FCA", "ok")], []).shouldCallAi,
    ).toBe(false);
    expect(
      buildAssuranceDecision([healthResult("DFSA", "watch")], []).shouldCallAi,
    ).toBe(false);
  });

  it("requires AI triage and alerts for action-required findings", () => {
    const decision = buildAssuranceDecision(
      [healthResult("SEC", "action_required")],
      [],
    );

    expect(decision.status).toBe("action_required");
    expect(decision.alertRequired).toBe(true);
    expect(decision.shouldCallAi).toBe(true);
  });

  it("detects consecutive scraper run failures", () => {
    const issues = buildScraperRunIssues([
      {
        regulator: "SEC",
        status: "error",
        startedAt: "2026-04-26T12:00:00Z",
        errorMessage: "Timeout",
        runUrl: "https://example.com/run/2",
        recordsPrepared: 0,
      },
      {
        regulator: "SEC",
        status: "error",
        startedAt: "2026-04-25T12:00:00Z",
        errorMessage: "Timeout",
        runUrl: "https://example.com/run/1",
        recordsPrepared: 0,
      },
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("action_required");
    expect(issues[0].message).toContain("two most recent");
  });

  it("treats terminal timed-out leases as scraper failures", () => {
    const issues = buildScraperRunIssues([
      { regulator: "SEC", status: "timed_out", startedAt: "2026-04-26T12:00:00Z", errorMessage: "Timed out", runUrl: null, recordsPrepared: 0 },
      { regulator: "SEC", status: "timed_out", startedAt: "2026-04-25T12:00:00Z", errorMessage: "Timed out", runUrl: null, recordsPrepared: 0 },
    ]);
    expect(issues[0]?.severity).toBe("action_required");
    expect(issues[0]?.consecutiveErrors).toBe(2);
  });

  it("downgrades consecutive scraper failures when live data is healthy", () => {
    const issues = buildScraperRunIssues(
      [
        {
          regulator: "FCA",
          status: "error",
          startedAt: "2026-05-14T12:00:00Z",
          errorMessage: "Request failed with status code 403",
          runUrl: "https://example.com/run/2",
          recordsPrepared: 0,
        },
        {
          regulator: "FCA",
          status: "error",
          startedAt: "2026-05-14T06:00:00Z",
          errorMessage: "Request failed with status code 403",
          runUrl: "https://example.com/run/1",
          recordsPrepared: 0,
        },
      ],
      [healthResult("FCA", "ok")],
    );

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("watch");
    expect(issues[0].message).toContain("live data remains");
  });

  it("redacts sensitive-looking values before AI payload construction", () => {
    const text = redactText(
      "Failed for user@example.com with token=abcdefghijklmnopqrstuvwxyz123456 and postgres://user:pass@host/db",
    );

    expect(text).not.toContain("user@example.com");
    expect(text).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
    expect(text).not.toContain("user:pass");

    const messages = buildDeepSeekMessages({
      status: "action_required",
      health: [
        {
          ...healthResult("SEC", "action_required"),
          message: "Failed for user@example.com with secret=abc123",
        },
      ],
      scraperRunIssues: [],
      workflowUrl: "https://example.com/workflow",
    });

    expect(JSON.stringify(messages)).not.toContain("user@example.com");
    expect(JSON.stringify(messages)).not.toContain("secret=abc123");
  });

  it("builds a content-risk retry from typed health facts only", () => {
    const retry = buildDeepSeekSafeRetryMessages({
      status: "action_required",
      health: [{
        ...healthResult("GFSC", "action_required"),
        message: "untrusted source title that triggered provider filtering",
        operatorAction: "free-form operator instruction",
      }],
      scraperRunIssues: [{
        regulator: "GFSC",
        severity: "action_required",
        latestStatus: "error",
        latestStartedAt: "2026-09-13T12:00:00Z",
        latestErrorMessage: "untrusted provider response",
        consecutiveErrors: 2,
        runUrl: null,
        message: "untrusted scraper error body",
      }],
    });
    const serialized = JSON.stringify(retry);
    expect(serialized).toContain("GFSC");
    expect(serialized).toContain("consecutiveErrors");
    expect(serialized).not.toContain("untrusted source title");
    expect(serialized).not.toContain("free-form operator instruction");
    expect(serialized).not.toContain("untrusted scraper error body");
  });

  it("builds SES alert JSON without shell interpolation", () => {
    const report: AssuranceReport = {
      generatedAt: "2026-04-26T12:00:00Z",
      status: "action_required",
      cadence: "all",
      totals: {
        checked: 1,
        ok: 0,
        watch: 0,
        actionRequired: 1,
        critical: 0,
        scraperRunIssues: 0,
        reviewedAmountIssues: 0,
      },
      health: [healthResult("SEC", "action_required")],
      scraperRunIssues: [],
      reviewedAmountIssues: [],
      aiTriage: {
        status: "skipped",
        provider: "deepseek",
        model: "deepseek-v4-flash",
        summary: "DEEPSEEK_API_KEY is not configured",
        likelyCause: null,
        impactedRegulators: [],
        nextAction: null,
        confidence: null,
        usage: null,
        costEstimateUsd: 0,
        errorMessage: null,
      },
      costEstimate: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        usd: 0,
      },
      workflowUrl: "https://example.com/workflow",
    };

    const email = buildSesEmailInput(report, "alerts@example.com");
    expect(email.Destination.ToAddresses).toEqual(["alerts@example.com"]);
    expect(email.Message.Subject.Data).toContain("SCRAPER ALERT");
    expect(email.Message.Body.Text.Data).toContain("SEC");
  });

  it("writes a correctly worded recovery notification", () => {
    const report = {
      ...({} as AssuranceReport),
      generatedAt: "2026-04-26T12:00:00Z",
      status: "ok" as const,
      cadence: "all" as const,
      totals: { checked: 1, ok: 1, watch: 0, actionRequired: 0, critical: 0, scraperRunIssues: 0, reviewedAmountIssues: 0 },
      health: [healthResult("SEC", "ok")], scraperRunIssues: [], reviewedAmountIssues: [],
      aiTriage: { status: "skipped" as const, provider: "deepseek", model: "deepseek-v4-flash", summary: "ok", likelyCause: null, impactedRegulators: [], nextAction: null, confidence: null, usage: null, costEstimateUsd: 0, errorMessage: null },
      costEstimate: { provider: "deepseek", model: "deepseek-v4-flash", usd: 0 }, workflowUrl: null,
    };
    const email = buildSesEmailInput(report, "alerts@example.com", { recovered: true });
    expect(email.Message.Subject.Data).toContain("RECOVERED");
    expect(email.Message.Body.Text.Data).toContain("previously actionable scraper findings have recovered");
  });

  it("estimates DeepSeek v4 flash cost using official per-token rates", () => {
    expect(estimateDeepSeekCost(20_000, 1_000)).toBe(0.00308);
  });
});
