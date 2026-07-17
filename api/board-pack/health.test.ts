import { describe, expect, it } from "vitest";
import { evaluateBoardPackDeliveryHealth } from "./health.js";

describe("Board Pack delivery health", () => {
  it("is healthy only when delivery and mail configuration are ready", () => {
    expect(evaluateBoardPackDeliveryHealth({ failed: 0, processing: 0, overdue: 0, mailConfigured: true })).toEqual({ healthy: true, reasons: [] });
  });

  it("fails closed for overdue work and missing mail configuration", () => {
    const result = evaluateBoardPackDeliveryHealth({ failed: 0, processing: 0, overdue: 2, mailConfigured: false });
    expect(result.healthy).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      "RESEND_API_KEY is not configured",
      "2 pending deliveries are overdue by more than 10 minutes",
    ]));
  });
});
