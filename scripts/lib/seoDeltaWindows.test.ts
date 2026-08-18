import { describe, expect, it } from "vitest";
import {
  BURN_IN_DAYS,
  MIN_IMPRESSIONS_FOR_VERDICT,
  buildDeltaWindows,
  comparePage,
  type PageMetrics,
} from "./seoDeltaWindows.js";

const metrics = (over: Partial<PageMetrics> = {}): PageMetrics => ({
  clicks: 0,
  impressions: 0,
  ctr: 0,
  position: 10,
  ...over,
});

describe("buildDeltaWindows", () => {
  it("stops the before window short of the ship date", () => {
    const w = buildDeltaWindows("2026-08-18", "2026-09-30");
    // 2-day pre-ship gap, then a 28-day window ending there.
    expect(w.before.endDate).toBe("2026-08-16");
    expect(w.before.startDate).toBe("2026-07-20");
  });

  it("skips burn-in before the after window opens", () => {
    const w = buildDeltaWindows("2026-08-18", "2026-09-30");
    expect(w.after.startDate).toBe("2026-08-28");
    expect(BURN_IN_DAYS).toBe(10);
  });

  it("excludes the incomplete trailing days of Search Console data", () => {
    const w = buildDeltaWindows("2026-08-18", "2026-09-30");
    expect(w.after.endDate).toBe("2026-09-28");
  });

  it("is not ready immediately after shipping", () => {
    const w = buildDeltaWindows("2026-08-18", "2026-08-20");
    expect(w.afterDays).toBe(0);
    expect(w.ready).toBe(false);
  });

  it("is not ready while the after window is under two weeks", () => {
    // after opens 2026-08-28; today 2026-09-05 gives data to 2026-09-03 = 7 days
    const w = buildDeltaWindows("2026-08-18", "2026-09-05");
    expect(w.afterDays).toBe(7);
    expect(w.ready).toBe(false);
  });

  it("becomes ready once fourteen measurable days exist", () => {
    const w = buildDeltaWindows("2026-08-18", "2026-09-12");
    expect(w.afterDays).toBe(14);
    expect(w.ready).toBe(true);
  });

  it("handles a ship date spanning a month boundary", () => {
    const w = buildDeltaWindows("2026-03-02", "2026-04-20");
    expect(w.before.endDate).toBe("2026-02-28");
    expect(w.before.startDate).toBe("2026-02-01");
    expect(w.after.startDate).toBe("2026-03-12");
  });
});

describe("comparePage", () => {
  it("refuses a verdict on thin data", () => {
    const d = comparePage(
      "/regulators/xyz",
      metrics({ impressions: 100, clicks: 1 }),
      metrics({ impressions: 100, clicks: 5 }),
    );
    expect(d.verdict).toBe("insufficient-data");
  });

  it("calls a real CTR gain an improvement", () => {
    const d = comparePage(
      "/regulators/fca",
      metrics({ impressions: 1000, clicks: 2, position: 9.8 }),
      metrics({ impressions: 1000, clicks: 20, position: 9.6 }),
    );
    expect(d.beforeClicksPerMille).toBe(2);
    expect(d.afterClicksPerMille).toBe(20);
    expect(d.verdict).toBe("improved");
    expect(d.positionStable).toBe(true);
  });

  it("flags when position moved, so CTR is not attributable to the snippet", () => {
    const d = comparePage(
      "/regulators/fca",
      metrics({ impressions: 1000, clicks: 2, position: 15 }),
      metrics({ impressions: 1000, clicks: 20, position: 6 }),
    );
    expect(d.verdict).toBe("improved");
    // Improvement is real but caused by ranking, not the title.
    expect(d.positionStable).toBe(false);
    expect(d.positionChange).toBe(-9);
  });

  it("calls a real CTR loss a decline", () => {
    const d = comparePage(
      "/regulators/mas",
      metrics({ impressions: 900, clicks: 30 }),
      metrics({ impressions: 900, clicks: 5 }),
    );
    expect(d.verdict).toBe("declined");
  });

  it("treats small movement as flat", () => {
    const d = comparePage(
      "/regulators/sc",
      metrics({ impressions: 1000, clicks: 10 }),
      metrics({ impressions: 1000, clicks: 10 }),
    );
    expect(d.verdict).toBe("flat");
  });

  it("does not call a rounding artefact an improvement on a near-zero baseline", () => {
    // 0 -> 0.4 clicks per 1k is movement, but under the absolute floor.
    const d = comparePage(
      "/regulators/cbi",
      metrics({ impressions: 5000, clicks: 0 }),
      metrics({ impressions: 5000, clicks: 2 }),
    );
    expect(d.afterClicksPerMille).toBeCloseTo(0.4);
    expect(d.verdict).toBe("flat");
  });

  it("survives a zero-impression window without dividing by zero", () => {
    const d = comparePage("/x", metrics(), metrics());
    expect(d.beforeClicksPerMille).toBe(0);
    expect(d.afterClicksPerMille).toBe(0);
    expect(d.verdict).toBe("insufficient-data");
    expect(MIN_IMPRESSIONS_FOR_VERDICT).toBeGreaterThan(0);
  });
});
