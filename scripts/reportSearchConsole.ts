import { writeFileSync } from "node:fs";
import {
  accessToken,
  query,
  readCredentialsFromEnv,
  type SearchConsoleRow,
} from "./lib/searchConsole.js";

type Metrics = Pick<SearchConsoleRow, "clicks" | "impressions" | "ctr" | "position">;

/**
 * Search Console query groups that RegActions is deliberately trying to own.
 * Keep this deterministic and small: this is a measurement contract, not an
 * LLM classification exercise. The FCA group is checked first so a query such
 * as "FCA regulatory fines" has one owner.
 */
export const TARGET_QUERY_CLUSTERS = [
  {
    id: "fca-fines",
    label: "FCA fines",
    ownerPage: "/regulators/fca",
    patterns: [
      /\b(?:fca|financial\s+conduct\s+authority)\b.*\b(?:fine|fines|penalt(?:y|ies)|enforcement|final notices?)\b/i,
      /\b(?:fine|fines|penalt(?:y|ies)|enforcement|final notices?)\b.*\b(?:fca|financial\s+conduct\s+authority)\b/i,
    ],
  },
  {
    id: "regulatory-fines",
    label: "Regulatory fines",
    ownerPage: "/fines",
    patterns: [
      /\b(?:financial\s+)?regulatory\s+(?:fine|fines|penalt(?:y|ies)|enforcement)\b/i,
      /\bregulatory\s+(?:fine|fines)\s+database\b/i,
    ],
  },
] as const;

export type TargetQueryCluster = (typeof TARGET_QUERY_CLUSTERS)[number];

export const SEO_ALERT_THRESHOLDS = {
  /** A weekly site-wide fall must be material before it is actionable. */
  siteClicksDropPct: 25,
  siteImpressionsDropPct: 25,
  /** Five or more query exits is more useful than emailing on every exit. */
  topTwentyExits: 5,
  /** Individual opportunities are reported, but do not send an email alone. */
  highImpressionMin: 50,
  lowCtrMax: 0.01,
  /** A cluster needs meaningful visibility before a cluster alert is raised. */
  clusterImpressionsMin: 100,
  clusterClicksDropPct: 30,
} as const;

export const DIGEST_POLICY = {
  cadence: "weekly",
  channel: "artifact-only",
  maxAlerts: 5,
  description:
    "Write one concise weekly report and GitHub summary; do not send an email for an individual page, query exit, or cannibalisation finding.",
} as const;

function isoDaysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function pct(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function metricRow(rows: SearchConsoleRow[]): Metrics {
  const row = rows[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  return { clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position };
}

function emptyMetrics(): Metrics {
  return { clicks: 0, impressions: 0, ctr: 0, position: 0 };
}

function addMetrics(target: Metrics, row: SearchConsoleRow | Metrics): Metrics {
  const impressions = target.impressions + row.impressions;
  const clicks = target.clicks + row.clicks;
  const position = impressions === 0
    ? 0
    : ((target.position * target.impressions) + (row.position * row.impressions)) / impressions;
  return {
    clicks,
    impressions,
    ctr: impressions === 0 ? 0 : clicks / impressions,
    position,
  };
}

export function classifyTargetCluster(queryText: string): TargetQueryCluster["id"] | null {
  const cluster = TARGET_QUERY_CLUSTERS.find((candidate) =>
    candidate.patterns.some((pattern) => pattern.test(queryText)),
  );
  return cluster?.id ?? null;
}

function clusterById(id: TargetQueryCluster["id"]): TargetQueryCluster {
  return TARGET_QUERY_CLUSTERS.find((cluster) => cluster.id === id)!;
}

function reportRow(row: SearchConsoleRow, queryText: string, page?: string) {
  return {
    query: queryText,
    ...(page ? { page } : {}),
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  };
}

/** Exact query performance for the two commercial target clusters. */
export function targetClusterPerformance(
  queryRows: SearchConsoleRow[],
  queryPageRows: SearchConsoleRow[] = [],
) {
  return TARGET_QUERY_CLUSTERS.map((cluster) => {
    const matchedQueries = queryRows
      .map((row) => ({ row, query: row.keys?.[0] ?? "" }))
      .filter(({ query }) => classifyTargetCluster(query) === cluster.id);
    const queryPages = queryPageRows
      .map((row) => ({ row, query: row.keys?.[0] ?? "", page: row.keys?.[1] ?? "" }))
      .filter(({ query }) => classifyTargetCluster(query) === cluster.id);
    const metrics = matchedQueries.reduce((total, { row }) => addMetrics(total, row), emptyMetrics());
    const queries = matchedQueries
      .map(({ row, query }) => reportRow(row, query))
      .sort((left, right) => right.impressions - left.impressions || left.query.localeCompare(right.query));
    const exactQueryPages = queryPages
      .map(({ row, query, page }) => reportRow(row, query, page))
      .sort((left, right) => right.impressions - left.impressions || left.query.localeCompare(right.query));
    return {
      id: cluster.id,
      label: cluster.label,
      ownerPage: cluster.ownerPage,
      metrics,
      queryCount: queries.length,
      queries,
      queryPageCount: exactQueryPages.length,
      queryPages: exactQueryPages,
    };
  });
}

function pagePath(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
}

/**
 * Find clusters and exact queries served by more than one URL. A cluster-level
 * finding is informational in the weekly report; it is not an email trigger.
 */
export function detectCannibalisation(queryPageRows: SearchConsoleRow[]) {
  const clusterPages = new Map<string, Map<string, Metrics>>();
  const queryPages = new Map<string, Map<string, Set<string>>>();
  for (const row of queryPageRows) {
    const queryText = row.keys?.[0] ?? "";
    const page = row.keys?.[1] ?? "";
    const clusterId = classifyTargetCluster(queryText);
    if (!clusterId || !page) continue;
    const pages = clusterPages.get(clusterId) ?? new Map<string, Metrics>();
    pages.set(page, addMetrics(pages.get(page) ?? emptyMetrics(), row));
    clusterPages.set(clusterId, pages);
    const perQuery = queryPages.get(queryText) ?? new Map<string, Set<string>>();
    const queriesForPage = perQuery.get(clusterId) ?? new Set<string>();
    queriesForPage.add(page);
    perQuery.set(clusterId, queriesForPage);
    queryPages.set(queryText, perQuery);
  }
  const clusters = [...clusterPages.entries()]
    .map(([clusterId, pages]) => ({
      ...clusterById(clusterId as TargetQueryCluster["id"]),
      urlCount: pages.size,
      pages: [...pages.entries()]
        .map(([page, metrics]) => ({ page, ...metrics }))
        .sort((left, right) => right.impressions - left.impressions || left.page.localeCompare(right.page)),
    }))
    .filter((cluster) => cluster.urlCount > 1);
  const queries = [...queryPages.entries()]
    .flatMap(([query, byCluster]) => [...byCluster.entries()]
      .map(([clusterId, pages]) => ({
        query,
        clusterId,
        pages: [...pages].sort(),
        urlCount: pages.size,
      }))
      .filter((entry) => entry.urlCount > 1));
  return { clusters, queries };
}

export const detectCannibalization = detectCannibalisation;

export function findHighImpressionLowCtrPages(
  pages: SearchConsoleRow[],
  options: { minImpressions?: number; maxCtr?: number; maxPosition?: number; limit?: number } = {},
) {
  const minImpressions = options.minImpressions ?? SEO_ALERT_THRESHOLDS.highImpressionMin;
  const maxCtr = options.maxCtr ?? SEO_ALERT_THRESHOLDS.lowCtrMax;
  const maxPosition = options.maxPosition ?? 20;
  const limit = options.limit ?? 20;
  return pages
    .filter((row) => row.impressions >= minImpressions && row.ctr <= maxCtr && row.position <= maxPosition)
    .sort((left, right) => right.impressions - left.impressions || left.ctr - right.ctr)
    .slice(0, limit)
    .map((row) => ({
      page: pagePath(row.keys?.[0] ?? ""),
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }));
}

export const highImpressionLowCtrPages = findHighImpressionLowCtrPages;

export function topTwentyMovement(current: SearchConsoleRow[], previous: SearchConsoleRow[]) {
  const previousByQuery = new Map(previous.map((row) => [row.keys?.[0] ?? "", row]));
  const currentByQuery = new Map(current.map((row) => [row.keys?.[0] ?? "", row]));
  const currentTop20 = current.filter((row) => row.position <= 20);
  const previousTop20 = previous.filter((row) => row.position <= 20);
  const entered = currentTop20.filter((row) => (previousByQuery.get(row.keys?.[0] ?? "")?.position ?? Infinity) > 20);
  const exits = previousTop20
    .filter((row) => (currentByQuery.get(row.keys?.[0] ?? "")?.position ?? Infinity) > 20)
    .map((row) => {
      const query = row.keys?.[0] ?? "";
      const currentRow = currentByQuery.get(query);
      return {
        ...row,
        query,
        previousPosition: row.position,
        currentPosition: currentRow?.position ?? null,
        reason: currentRow ? "fell-below-20" : "not-returned",
      };
    })
    .sort((left, right) => right.impressions - left.impressions || left.query.localeCompare(right.query))
    .slice(0, 15);
  const movers = current
    .map((row) => {
      const queryText = row.keys?.[0] ?? "";
      const prior = previousByQuery.get(queryText);
      return prior ? { query: queryText, position: row.position, previousPosition: prior.position, gain: prior.position - row.position, impressions: row.impressions } : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .filter((row) => row.gain > 0)
    .sort((left, right) => right.gain - left.gain || right.impressions - left.impressions)
    .slice(0, 15);
  return {
    currentCount: currentTop20.length,
    previousCount: previousTop20.length,
    entered: entered.slice(0, 15),
    exits,
    enteredCount: entered.length,
    // A query omitted from the current Search Console response is not proof
    // that it lost rank: low-volume/privacy-filtered rows can disappear between
    // windows. Only count an exit when the query is still observable below 20.
    exitCount: previousTop20.filter((row) => {
      const currentRow = currentByQuery.get(row.keys?.[0] ?? "");
      return currentRow !== undefined && currentRow.position > 20;
    }).length,
    notReturnedCount: previousTop20.filter((row) => !currentByQuery.has(row.keys?.[0] ?? "")).length,
    movers,
  };
}

export function buildSeoAlerts(
  currentTotals: Metrics,
  previousTotals: Metrics,
  movement: ReturnType<typeof topTwentyMovement>,
  clusters: ReturnType<typeof targetClusterPerformance>,
  previousClusters: ReturnType<typeof targetClusterPerformance> = [],
) {
  const alerts: Array<{ severity: "warning" | "critical"; code: string; message: string }> = [];
  const clicksChange = pct(currentTotals.clicks, previousTotals.clicks);
  const impressionsChange = pct(currentTotals.impressions, previousTotals.impressions);
  if (clicksChange !== null && clicksChange <= -SEO_ALERT_THRESHOLDS.siteClicksDropPct) {
    alerts.push({ severity: "warning", code: "site-clicks-drop", message: `Site clicks fell ${Math.abs(clicksChange).toFixed(0)}% week-on-week.` });
  }
  if (impressionsChange !== null && impressionsChange <= -SEO_ALERT_THRESHOLDS.siteImpressionsDropPct) {
    alerts.push({ severity: "critical", code: "site-impressions-drop", message: `Site impressions fell ${Math.abs(impressionsChange).toFixed(0)}% week-on-week.` });
  }
  const exitCount = movement.exitCount ?? movement.exits.length;
  if (exitCount >= SEO_ALERT_THRESHOLDS.topTwentyExits) {
    alerts.push({ severity: "warning", code: "top20-exits", message: `${exitCount} queries exited the Top 20.` });
  }
  for (const cluster of clusters) {
    const prior = previousClusters.find((entry) => entry.id === cluster.id);
    if (!prior || cluster.metrics.impressions < SEO_ALERT_THRESHOLDS.clusterImpressionsMin) continue;
    const clusterChange = pct(cluster.metrics.clicks, prior.metrics.clicks);
    if (clusterChange !== null && clusterChange <= -SEO_ALERT_THRESHOLDS.clusterClicksDropPct) {
      alerts.push({ severity: "warning", code: `${cluster.id}-clicks-drop`, message: `${cluster.label} clicks fell ${Math.abs(clusterChange).toFixed(0)}% week-on-week.` });
    }
  }
  return alerts.slice(0, DIGEST_POLICY.maxAlerts);
}

async function main() {
  const property = process.env.SC_PROPERTY?.trim();
  if (!property) throw new Error("SC_PROPERTY is required");
  const token = await accessToken(readCredentialsFromEnv());
  const current = { startDate: isoDaysAgo(8), endDate: isoDaysAgo(2) };
  const previous = { startDate: isoDaysAgo(15), endDate: isoDaysAgo(9) };
  const [currentTotalRows, previousTotalRows, currentQueries, previousQueries, currentQueryPages, pages] = await Promise.all([
    query(token, property, current),
    query(token, property, previous),
    query(token, property, { ...current, dimensions: ["query"], rowLimit: 25_000 }),
    query(token, property, { ...previous, dimensions: ["query"], rowLimit: 25_000 }),
    query(token, property, { ...current, dimensions: ["query", "page"], rowLimit: 25_000 }),
    query(token, property, { ...current, dimensions: ["page"], rowLimit: 2_000 }),
  ]);
  const currentTotals = metricRow(currentTotalRows);
  const previousTotals = metricRow(previousTotalRows);
  const movement = topTwentyMovement(currentQueries, previousQueries);
  const currentClusters = targetClusterPerformance(currentQueries, currentQueryPages);
  const previousClusters = targetClusterPerformance(previousQueries);
  const lowCtrPages = findHighImpressionLowCtrPages(pages);
  const legacyOpportunityPages = pages
    .filter((row) => row.impressions >= 10 && row.position >= 5)
    .sort((left, right) => right.impressions - left.impressions)
    .slice(0, 20);
  const cannibalisation = detectCannibalisation(currentQueryPages);
  const alerts = buildSeoAlerts(currentTotals, previousTotals, movement, currentClusters, previousClusters);
  const report = {
    generatedAt: new Date().toISOString(),
    property,
    current,
    previous,
    totals: {
      current: currentTotals,
      previous: previousTotals,
      change: {
        clicksPct: pct(currentTotals.clicks, previousTotals.clicks),
        impressionsPct: pct(currentTotals.impressions, previousTotals.impressions),
        ctrPct: pct(currentTotals.ctr, previousTotals.ctr),
        position: currentTotals.position - previousTotals.position,
      },
    },
    topTwenty: movement,
    targetClusters: currentClusters,
    cannibalisation,
    cannibalization: cannibalisation,
    highImpressionLowCtrPages: lowCtrPages,
    // Backwards-compatible field consumed by older artifact readers.
    opportunityPages: legacyOpportunityPages,
    alerts,
    digest: { ...DIGEST_POLICY, alertCount: alerts.length },
  };
  const markdown = [
    `# RegActions weekly Search Console report`,
    ``,
    `Current: ${current.startDate} to ${current.endDate}; comparison: ${previous.startDate} to ${previous.endDate}.`,
    ``,
    `- Clicks: ${currentTotals.clicks} (previous ${previousTotals.clicks})`,
    `- Impressions: ${currentTotals.impressions} (previous ${previousTotals.impressions})`,
    `- CTR: ${(currentTotals.ctr * 100).toFixed(2)}% (previous ${(previousTotals.ctr * 100).toFixed(2)}%)`,
    `- Average position: ${currentTotals.position.toFixed(2)} (previous ${previousTotals.position.toFixed(2)})`,
    `- Queries in Top 20: ${movement.currentCount} (previous ${movement.previousCount})`,
    ``,
    `## Target query clusters`,
    ``,
    ...currentClusters.map((cluster) => `- **${cluster.label}** → \`${cluster.ownerPage}\`: ${cluster.metrics.impressions} impressions, ${cluster.metrics.clicks} clicks, ${(cluster.metrics.ctr * 100).toFixed(2)}% CTR, average position ${cluster.metrics.position.toFixed(1)} across ${cluster.queryCount} queries.`),
    ...(currentClusters.every((cluster) => cluster.queryCount === 0) ? ["- No matching target-cluster queries in this window."] : []),
    ``,
    `## Top-20 movement`,
    ``,
    `- Confirmed exits: ${movement.exitCount}`,
    `- Previously visible queries not returned in the current sample: ${movement.notReturnedCount} (not treated as ranking exits)`,
    ...(movement.exits.length ? movement.exits.map((row) => `- ${row.query}: ${row.previousPosition.toFixed(1)} → ${row.currentPosition === null ? "not observable" : row.currentPosition.toFixed(1)} (${row.reason})`) : ["- No Top-20 movement to review."]),
    ``,
    `## High-impression, low-CTR pages`,
    ``,
    ...(lowCtrPages.length ? lowCtrPages.map((row) => `- ${row.page}: ${row.impressions} impressions, ${row.clicks} clicks, ${(row.ctr * 100).toFixed(2)}% CTR, position ${row.position.toFixed(1)}`) : ["- No pages crossed the 50-impression / 1% CTR opportunity threshold."]),
    ``,
    `## Query ownership and cannibalisation`,
    ``,
    ...(cannibalisation.queries.length
      ? cannibalisation.queries.map((entry) => `- Exact query \`${entry.query}\` appears against ${entry.urlCount} URLs.`)
      : ["- No exact target query appeared against multiple URLs."]),
    ...(cannibalisation.clusters.length
      ? cannibalisation.clusters.map((cluster) => `- Ownership spread: ${cluster.label} impressions reached ${cluster.urlCount} URLs across the cluster; review against owner \`${cluster.ownerPage}\`.`)
      : []),
    ``,
    `## Alert digest`,
    ``,
    ...(alerts.length ? alerts.map((alert) => `- ${alert.severity}: ${alert.message}`) : ["- No alert. Report remains artifact-only; no email is sent." ]),
    ``,
    `## Biggest position gains`,
    ``,
    ...(movement.movers.length ? movement.movers.map((row) => `- ${row.query}: ${row.previousPosition.toFixed(1)} to ${row.position.toFixed(1)} (${row.gain.toFixed(1)} places)`) : ["- No comparable gains in this window."]),
    ``,
  ].join("\n");
  writeFileSync(process.env.GSC_REPORT_JSON_PATH ?? "search-console-weekly.json", `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(process.env.GSC_REPORT_MARKDOWN_PATH ?? "search-console-weekly.md", markdown);
  console.log(markdown);
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
