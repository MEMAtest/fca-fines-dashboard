import { describe, expect, it } from "vitest";
import { topTwentyMovement } from "../../scripts/reportSearchConsole.js";

describe("weekly Search Console reporting", () => {
  it("counts Top-20 entries and sorts comparable gains", () => {
    const row = (query: string, position: number, impressions = 10) => ({ keys: [query], clicks: 0, impressions, ctr: 0, position });
    const result = topTwentyMovement(
      [row("entered", 12), row("mover", 8, 30), row("outside", 24)],
      [row("entered", 30), row("mover", 14, 30), row("old", 5)],
    );
    expect(result.currentCount).toBe(2);
    expect(result.previousCount).toBe(2);
    expect(result.entered.map((entry) => entry.keys?.[0])).toEqual(["entered"]);
    expect(result.movers.map((entry) => entry.query)).toEqual(["entered", "mover"]);
  });
});
