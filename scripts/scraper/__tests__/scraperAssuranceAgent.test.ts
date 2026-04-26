import { describe, expect, it } from "vitest";
import type { LiveRegulatorHealthResult } from "../lib/liveRegulatorHealth.js";
import {
  buildAssuranceDecision,
  buildDeepSeekMessages,
  buildScraperRunIssues,
  buildSesEmailInput,
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

  it("estimates DeepSeek v4 flash cost using official per-token rates", () => {
    expect(estimateDeepSeekCost(20_000, 1_000)).toBe(0.00308);
  });
});
