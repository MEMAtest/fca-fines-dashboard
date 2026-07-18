import { describe, expect, it } from "vitest";
import { evaluateMonitorDeliveryHealth } from "./health.js";

describe("monitor delivery health", () => {
  it("is healthy when mail and delivery state are ready", () => {
    expect(evaluateMonitorDeliveryHealth({
      verificationOverdue: 0,
      activeWithoutBaseline: 0,
      recentFailures: 0,
      mailConfigured: true,
    })).toEqual({ healthy: true, reasons: [] });
  });

  it("fails closed for incomplete baselines, delivery failures and missing SES", () => {
    const result = evaluateMonitorDeliveryHealth({
      verificationOverdue: 1,
      activeWithoutBaseline: 2,
      recentFailures: 3,
      mailConfigured: false,
    });
    expect(result.healthy).toBe(false);
    expect(result.reasons).toHaveLength(4);
  });
});
