import { describe, expect, it } from "vitest";
import { evaluateSourceFreshness } from "./sourceFreshness.js";

const now = new Date("2026-11-14T12:00:00Z");

describe("evaluateSourceFreshness", () => {
  it("shows a blocked source with its last verified date", () => {
    const r = evaluateSourceFreshness("dnb", "2026-09-01T03:00:00Z", true, now);
    expect(r).toMatchObject({ show: true, kind: "blocked", lastVerified: "2026-09-01" });
  });
  it("a blocked source with no recorded success has no date, never a current one", () => {
    const r = evaluateSourceFreshness("CMVM", null, true, now);
    expect(r).toMatchObject({ show: true, kind: "blocked", lastVerified: null });
  });
  it("a blocked source still shows its note when the status feed failed", () => {
    expect(evaluateSourceFreshness("BAFIN", undefined, false, now)).toMatchObject({ show: true, lastVerified: null });
  });
  it("flags a healthy-listed regulator whose last success is over 30 days old", () => {
    const r = evaluateSourceFreshness("FCA", "2026-10-01T00:00:00Z", true, now);
    expect(r).toMatchObject({ show: true, kind: "stale", lastVerified: "2026-10-01" });
  });
  it("stays quiet for a recent success, an unloaded feed, or no scrape history", () => {
    expect(evaluateSourceFreshness("FCA", "2026-11-13T00:00:00Z", true, now).show).toBe(false);
    expect(evaluateSourceFreshness("FCA", null, false, now).show).toBe(false);
    expect(evaluateSourceFreshness("FCA", null, true, now).show).toBe(false);
  });
});
