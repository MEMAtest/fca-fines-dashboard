import { describe, expect, it } from "vitest";
import type { LiveRegulatorHealthResult } from "../lib/liveRegulatorHealth.js";
import {
  buildAssuranceDecision,
  buildDeepSeekMessages,
  buildScraperRunIssues,
  buildSesEmailInput,
  isStaleRunningRun,
  shouldSendQuietAlert,
  estimateDeepSeekCost,
  redactText,
  type AssuranceReport,
} from "../../monitoring/scraperAssuranceAgent.js";

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

describe("scraperAssuranceAgent", () => {
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
      },
      health: [healthResult("SEC", "action_required")],
      scraperRunIssues: [],
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
      totals: { checked: 1, ok: 1, watch: 0, actionRequired: 0, critical: 0, scraperRunIssues: 0 },
      health: [healthResult("SEC", "ok")], scraperRunIssues: [],
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
