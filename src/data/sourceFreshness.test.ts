import { describe, expect, it } from "vitest";
import { classifyRunFailure, evaluateSourceFreshness } from "./sourceFreshness.js";

const now = new Date("2026-11-14T12:00:00Z");
const ok = { lastSuccessAt: "2026-11-14T05:00:00Z", latestStatus: "success", failureClass: null } as const;

describe("evaluateSourceFreshness", () => {
  it("a currently failing source shows its reason and its true last success date", () => {
    const r = evaluateSourceFreshness("BAFIN", { lastSuccessAt: "2026-11-04T05:49:00Z", latestStatus: "error", failureClass: "blocked" }, true, now);
    expect(r).toMatchObject({ show: true, kind: "failing", lastVerified: "2026-11-04" });
    expect((r as { reason: string }).reason).toMatch(/refused/);
  });
  it("never failing and never successful has no date", () => {
    expect(evaluateSourceFreshness("X", { lastSuccessAt: null, latestStatus: "error", failureClass: "empty" }, true, now)).toMatchObject({ show: true, lastVerified: null });
  });
  it("a regulator with no run history that is listed as such is shown as unknown", () => {
    expect(evaluateSourceFreshness("AMF", null, true, now)).toMatchObject({ show: true, kind: "unknown", lastVerified: null });
    expect(evaluateSourceFreshness("AMF", undefined, false, now)).toMatchObject({ show: true, lastVerified: null });
  });
  it("flags a success older than 30 days; quiet when recent, unloaded or unlisted", () => {
    expect(evaluateSourceFreshness("FCA", { ...ok, lastSuccessAt: "2026-10-01T00:00:00Z" }, true, now)).toMatchObject({ show: true, kind: "stale", lastVerified: "2026-10-01" });
    expect(evaluateSourceFreshness("FCA", ok, true, now).show).toBe(false);
    expect(evaluateSourceFreshness("FCA", null, false, now).show).toBe(false);
    expect(evaluateSourceFreshness("FCA", null, true, now).show).toBe(false);
  });
});

describe("classifyRunFailure", () => {
  it.each([
    ["Request failed with status code 403", "blocked"],
    ["[blocked] challenge page", "blocked"],
    ["site Manutenção programada", "maintenance"],
    ["the official source returned zero records, contrary to its source contract", "empty"],
    ["connect ETIMEDOUT", "unreachable"],
    ["3 of 3 prepared records failed validation", "failed"],
  ])("%s -> %s", (msg, cls) => expect(classifyRunFailure(msg)).toBe(cls));
});
