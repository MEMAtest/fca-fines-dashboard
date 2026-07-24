import { describe, expect, it } from "vitest";
import { upsertSnapshot } from "../../scripts/snapshot-scores.js";

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
  });
});
