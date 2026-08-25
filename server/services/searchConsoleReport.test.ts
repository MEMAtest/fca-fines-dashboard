import { describe, expect, it } from "vitest";
import {
  buildSeoAlerts,
  classifyTargetCluster,
  detectCannibalisation,
  findHighImpressionLowCtrPages,
  targetClusterPerformance,
  topTwentyMovement,
} from "../../scripts/reportSearchConsole.js";

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

  it("reports Top-20 exits, including queries no longer returned", () => {
    const row = (query: string, position: number, impressions = 10) => ({ keys: [query], clicks: 0, impressions, ctr: 0, position });
    const result = topTwentyMovement(
      [row("held", 8), row("fallen", 24)],
      [row("held", 6), row("fallen", 7, 40), row("missing", 9, 50)],
    );
    expect(result.exits.map((entry) => [entry.query, entry.reason])).toEqual([
      ["missing", "not-returned"],
      ["fallen", "fell-below-20"],
    ]);
    expect(result.exitCount).toBe(1);
    expect(result.notReturnedCount).toBe(1);
  });

  it("assigns FCA queries to the FCA owner before the broad regulatory cluster", () => {
    expect(classifyTargetCluster("FCA regulatory fines database")).toBe("fca-fines");
    expect(classifyTargetCluster("Financial Conduct Authority fines")).toBe("fca-fines");
    expect(classifyTargetCluster("global regulatory fines")).toBe("regulatory-fines");
    expect(classifyTargetCluster("unrelated query")).toBeNull();
  });

  it("returns exact target query and query-page performance", () => {
    const row = (keys: string[], clicks: number, impressions: number, position: number) => ({
      keys, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position,
    });
    const clusters = targetClusterPerformance(
      [row(["FCA fines"], 3, 100, 8), row(["regulatory fines"], 1, 80, 12)],
      [row(["FCA fines", "https://regactions.com/regulators/fca"], 2, 70, 7), row(["FCA fines", "https://regactions.com/fca-fines"], 1, 30, 11)],
    );
    expect(clusters[0].ownerPage).toBe("/regulators/fca");
    expect(clusters[0].metrics).toMatchObject({ clicks: 3, impressions: 100 });
    expect(clusters[0].queryPages).toHaveLength(2);
  });

  it("detects multiple URLs for a target cluster without treating it as an alert", () => {
    const row = (query: string, page: string, impressions: number) => ({ keys: [query, page], clicks: 0, impressions, ctr: 0, position: 10 });
    const result = detectCannibalisation([
      row("FCA fines", "https://regactions.com/regulators/fca", 90),
      row("FCA fines", "https://regactions.com/fca-fines", 20),
    ]);
    expect(result.clusters[0]).toMatchObject({ id: "fca-fines", urlCount: 2 });
    expect(result.queries[0]).toMatchObject({ query: "FCA fines", urlCount: 2 });
  });

  it("finds high-impression pages with low CTR", () => {
    const row = (page: string, clicks: number, impressions: number, position: number) => ({ keys: [page], clicks, impressions, ctr: clicks / impressions, position });
    const result = findHighImpressionLowCtrPages([
      row("https://regactions.com/regulators/fca", 3, 560, 9.9),
      row("https://regactions.com/fines", 5, 500, 24),
      row("https://regactions.com/regulators/mas", 0, 341, 8),
    ]);
    expect(result.map((entry) => entry.page)).toEqual(["/regulators/fca", "/regulators/mas"]);
  });

  it("only raises material alerts and caps the digest", () => {
    const metric = (clicks: number, impressions: number) => ({ clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: 10 });
    const currentQueries = Array.from({ length: 16 }, (_, index) => ({ keys: [`q${index}`], clicks: 0, impressions: 10, ctr: 0, position: 30 }));
    const previousQueries = Array.from({ length: 16 }, (_, index) => ({ keys: [`q${index}`], clicks: 0, impressions: 100, ctr: 0, position: 10 }));
    const movement = topTwentyMovement(currentQueries, previousQueries);
    expect(movement.exits).toHaveLength(15);
    expect(movement.exitCount).toBe(16);
    expect(movement.notReturnedCount).toBe(0);
    const currentClusters = targetClusterPerformance([]);
    const previousClusters = targetClusterPerformance([]);
    const alerts = buildSeoAlerts(metric(50, 500), metric(100, 1000), movement, currentClusters, previousClusters);
    expect(alerts.map((alert) => alert.code)).toContain("site-clicks-drop");
    expect(alerts.map((alert) => alert.code)).toContain("site-impressions-drop");
    expect(alerts).toHaveLength(3);
    expect(alerts.find((alert) => alert.code === "top20-exits")?.message).toContain("16");
  });
});
