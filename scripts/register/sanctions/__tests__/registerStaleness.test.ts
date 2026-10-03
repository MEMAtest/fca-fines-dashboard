import { describe, expect, it } from "vitest";
import { evaluateLaneStaleness, STALENESS_BUDGET_HOURS } from "../registerStaleness.js";

describe("evaluateLaneStaleness", () => {
  it("is not stale when the sanctions lane ran 1 hour ago (budget 48h)", () => {
    const now = new Date("2026-10-03T12:00:00Z");
    const lastSuccessAt = new Date("2026-10-03T11:00:00Z").toISOString();
    const result = evaluateLaneStaleness("sanctions", lastSuccessAt, now);
    expect(result.isStale).toBe(false);
    expect(result.staleSince).toBeNull();
  });

  it("is stale when the sanctions lane last ran 49 hours ago (budget 48h)", () => {
    const now = new Date("2026-10-03T12:00:00Z");
    const lastSuccessAt = new Date("2026-10-01T11:00:00Z").toISOString(); // 49h before `now`
    const result = evaluateLaneStaleness("sanctions", lastSuccessAt, now);
    expect(result.isStale).toBe(true);
    expect(result.staleSince).toBe(new Date("2026-10-03T11:00:00Z").toISOString());
  });

  it("is not stale when the FATF lane ran 6 days ago (budget 7d)", () => {
    const now = new Date("2026-10-03T12:00:00Z");
    const lastSuccessAt = new Date("2026-09-27T12:00:00Z").toISOString(); // 6 days before
    const result = evaluateLaneStaleness("fatf", lastSuccessAt, now);
    expect(result.isStale).toBe(false);
  });

  it("is stale when the FATF lane last ran 8 days ago (budget 7d)", () => {
    const now = new Date("2026-10-03T12:00:00Z");
    const lastSuccessAt = new Date("2026-09-25T12:00:00Z").toISOString(); // 8 days before
    const result = evaluateLaneStaleness("fatf", lastSuccessAt, now);
    expect(result.isStale).toBe(true);
  });

  it("treats a never-run lane as stale, never as clean/undefined", () => {
    const result = evaluateLaneStaleness("sanctions", null, new Date("2026-10-03T12:00:00Z"));
    expect(result.isStale).toBe(true);
    expect(result.lastSuccessAt).toBeNull();
    expect(result.staleSince).toBeNull();
  });

  it("budgets match the plan: sanctions 48h, FATF 7d (168h)", () => {
    expect(STALENESS_BUDGET_HOURS.sanctions).toBe(48);
    expect(STALENESS_BUDGET_HOURS.fatf).toBe(168);
  });
});
