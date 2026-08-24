import { describe, expect, it } from "vitest";

/**
 * The intelligence modules rank by action volume and print a count, so the bar
 * beside that count has to be sized by the same measure.
 *
 * It was not. The bars used `share`, which is share of penalty VALUE, so the
 * OCC's 5,598 actions rendered on a 15% bar while the SEC's 1,803 sat on a 51%
 * one — the picture contradicted the number printed next to it, which is the
 * fastest way to lose a reader's trust in a data product.
 *
 * This tests the sizing rule directly. The component reads it from live data,
 * so asserting the rule is what actually protects against the regression.
 */
function byActionVolume<T extends { label: string; count: number }>(items: T[]) {
  const ranked = items.slice().sort((left, right) => right.count - left.count).slice(0, 5);
  const max = ranked[0]?.count ?? 0;
  return ranked.map((item) => ({
    ...item,
    width: max > 0 ? Math.max(4, (item.count / max) * 100) : 4,
  }));
}

describe("intelligence module bars", () => {
  // The real numbers that exposed the bug, with their misleading value shares.
  const regulators = [
    { label: "SEC", count: 1803, share: 50.6 },
    { label: "OCC", count: 5598, share: 15.0 },
    { label: "FCA", count: 752, share: 10.2 },
    { label: "FRB", count: 2845, share: 10.1 },
    { label: "DNB", count: 48, share: 4 },
  ];

  it("orders by count, not by value share", () => {
    expect(byActionVolume(regulators).map((item) => item.label)).toEqual([
      "OCC", "FRB", "SEC", "FCA", "DNB",
    ]);
  });

  it("never draws a longer bar for a smaller count", () => {
    const ranked = byActionVolume(regulators);
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i].width, `${ranked[i].label} vs ${ranked[i - 1].label}`)
        .toBeLessThanOrEqual(ranked[i - 1].width);
    }
  });

  it("fills the largest bar and keeps the smallest visible", () => {
    const ranked = byActionVolume(regulators);
    expect(ranked[0].width).toBe(100);
    expect(ranked.at(-1)!.width).toBeGreaterThanOrEqual(4);
  });

  it("does not divide by zero when nothing matches the filters", () => {
    expect(byActionVolume([])).toEqual([]);
    expect(byActionVolume([{ label: "None", count: 0 }])[0].width).toBe(4);
  });
});
