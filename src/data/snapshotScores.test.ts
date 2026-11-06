import { describe, expect, it } from "vitest";
import { upsertSnapshot } from "../../scripts/snapshot-scores.js";
import { validateSnapshotHistory } from "../../scripts/validate-score-snapshots.js";
import { CURRENT_COUNTRY_RISK_METHODOLOGY_VERSION } from "./countryRiskMethodology.js";

describe("weekly score snapshots", () => {
  it("is byte-stable when the same date and scores are rerun", () => {
    const initial = [
      { date: "2026-07-13", scores: { GB: 2.1, US: 2.8 } },
    ];
    const first = upsertSnapshot(initial, "2026-07-20", {
      GB: 2.2,
      US: 2.9,
    });
    const second = upsertSnapshot(first, "2026-07-20", {
      GB: 2.2,
      US: 2.9,
    });

    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(
      second.filter((snapshot) => snapshot.date === "2026-07-20"),
    ).toHaveLength(1);
    expect(second[1].methodologyVersion).toBe(CURRENT_COUNTRY_RISK_METHODOLOGY_VERSION);
  });

  describe("validateSnapshotHistory (self-merge gate)", () => {
    const base = [
      { date: "2026-10-26", scores: { GB: 2.1, US: 2.8, FR: 3 } },
      { date: "2026-11-02", scores: { GB: 2.1, US: 2.8, FR: 3 } },
    ];
    const withNew = (scores: Record<string, number>, date = "2026-11-09") => [...base, { date, scores }];

    it("accepts a single appended snapshot", () => {
      expect(validateSnapshotHistory(base, withNew({ GB: 2.2, US: 2.8, FR: 3.1 }))).toEqual([]);
      expect(validateSnapshotHistory(base, base)).toEqual([]);
    });
    it("rejects dropped or changed history, including an emptied file", () => {
      expect(validateSnapshotHistory(base, [])).not.toEqual([]);
      expect(validateSnapshotHistory(base, [base[1], withNew({ GB: 2, US: 2, FR: 2 })[2]])).not.toEqual([]);
      const changed = [{ ...base[0], scores: { GB: 9, US: 2.8, FR: 3 } }, base[1]];
      expect(validateSnapshotHistory(base, changed).join()).toContain("changed");
    });
    it("rejects more than one new entry, non-ascending dates and big country drops", () => {
      expect(validateSnapshotHistory(base, [...withNew({ GB: 1, US: 1, FR: 1 }), { date: "2026-11-16", scores: { GB: 1, US: 1, FR: 1 } }]).join()).toContain("more than one");
      expect(validateSnapshotHistory(base, withNew({ GB: 1, US: 1, FR: 1 }, "2026-11-02"))).not.toEqual([]);
      expect(validateSnapshotHistory(base, withNew({}))).not.toEqual([]);
      expect(validateSnapshotHistory(base, withNew({ GB: 1, US: 1 }))).toEqual([]);
    });
    it("rejects out-of-range scores", () => {
      expect(validateSnapshotHistory(base, withNew({ GB: 11, US: 2, FR: 2 }))).not.toEqual([]);
      expect(validateSnapshotHistory(base, withNew({ GB: -1, US: 2, FR: 2 }))).not.toEqual([]);
    });
  });
});
