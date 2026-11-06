import { describe, expect, it } from "vitest";
import raw from "./scoreSnapshots.json" with { type: "json" };
import { computeMovers, snapshotComparison, snapshotSeries, largestGapDays, type MoverSnapshot } from "./scoreMovers.js";
import { CURRENT_COUNTRY_RISK_METHODOLOGY_VERSION as V } from "./countryRiskMethodology.js";

const snap = (date: string, scores: Record<string, number>, v: string | undefined = V): MoverSnapshot => ({ date, scores, methodologyVersion: v });

describe("scoreSnapshots.json integrity", () => {
  const snaps = raw as unknown as MoverSnapshot[];
  it("has strictly ascending unique dates, none in the future", () => {
    for (let i = 1; i < snaps.length; i++) expect(snaps[i].date > snaps[i - 1].date).toBe(true);
    expect(snaps[snaps.length - 1].date <= new Date().toISOString().slice(0, 10)).toBe(true);
  });
});

describe("computeMovers", () => {
  const snaps = [
    snap("2026-08-03", { GB: 2, FR: 3 }, "2.0.0"),
    snap("2026-09-07", { GB: 2, FR: 3, BG: 5 }),
    snap("2026-10-05", { GB: 2.4, FR: 2.5, BG: 5 }),
    snap("2026-11-02", { GB: 2.4, FR: 2.9, BG: 4.1 }),
  ];
  it("ignores other-methodology snapshots and picks the baseline ~N weeks back", () => {
    const w = computeMovers(4, snaps, []);
    expect(w.status).toBe("ready");
    if (w.status !== "ready") return;
    expect(w.fromDate).toBe("2026-10-05");
    expect(w.risers.map((m) => m.iso2)).toEqual(["FR"]);
    expect(w.fallers.map((m) => m.iso2)).toEqual(["BG"]);
    expect(w.unchangedCount).toBe(1);
  });
  it("is insufficient when history does not span the window", () => {
    const w = computeMovers(12, snaps, []);
    expect(w.status).toBe("insufficient");
  });
  it("is insufficient with a single snapshot and never fabricates", () => {
    expect(computeMovers(4, [snap("2026-11-02", { GB: 1 })], []).status).toBe("insufficient");
    expect(computeMovers(4, [], []).status).toBe("insufficient");
  });
  it("snapshotSeries and gap detection", () => {
    expect(snapshotSeries("GB", snaps)).toEqual(expect.any(Array));
    expect(largestGapDays([{ date: "2026-09-07" }, { date: "2026-11-02" }])).toBe(56);
  });
});

describe("snapshotComparison", () => {
  it("names the real previous snapshot and gap from irregular dates", () => {
    const c = snapshotComparison([
      snap("2026-07-16", { GB: 1 }, "2.0.0"),
      snap("2026-11-02", { GB: 2 }),
      snap("2026-11-06", { GB: 3 }),
    ]);
    expect(c).toEqual({ latest: "2026-11-06", previous: "2026-11-02", spanDays: 4, count: 2 });
  });
  it("has no previous date with a single comparable snapshot, and null with none", () => {
    expect(snapshotComparison([snap("2026-11-06", { GB: 3 })])?.previous).toBeNull();
    expect(snapshotComparison([snap("2026-11-06", { GB: 3 }, "2.0.0")])).toBeNull();
  });
});
