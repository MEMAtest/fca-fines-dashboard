/**
 * Per-URL before/after Search Console report for a shipped SEO change.
 *
 * Answers "did the change work?" for a specific set of pages, rather than the
 * site-wide weekly trend that `reportSearchConsole.ts` produces. Written
 * because the regulator-hub freshness work is otherwise unfalsifiable: without
 * an anchored comparison, any later movement can be attributed to it after the
 * fact.
 *
 * Usage:
 *   SC_PROPERTY="sc-domain:regactions.com" \
 *   SC_CREDENTIALS_JSON="$(cat service-account.json)" \
 *   npx tsx scripts/monitoring/seoPageDelta.ts --actioned 2026-08-18 \
 *     --pages /regulators/fca,/regulators/mas
 *
 * With no --pages, defaults to the regulator hubs carrying meaningful
 * impressions. Exits 0 even when the verdict is "too early" -- this is a report,
 * not a gate.
 */
import { writeFileSync } from "node:fs";
import {
  accessToken,
  query,
  readCredentialsFromEnv,
  type SearchConsoleRow,
} from "../lib/searchConsole.js";
import {
  buildDeltaWindows,
  comparePage,
  type PageMetrics,
} from "../lib/seoDeltaWindows.js";

const BASE_URL = "https://regactions.com";

/**
 * Default watch list: the hubs that actually have impressions to move.
 * /regulators/fca and /regulators/mas are the two that rank respectably and
 * convert almost nothing, so they are the pages the freshness work targets.
 */
const DEFAULT_PAGES = [
  "/regulators/fca",
  "/regulators/mas",
  "/regulators/fsra",
  "/regulators/cbi",
  "/regulators/sc",
  "/regulators/jfsc",
  "/regulators/cssf",
  "/regulators/fmaat",
  "/regulators/amf",
];

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function toMetrics(rows: SearchConsoleRow[]): PageMetrics {
  const row = rows[0];
  if (!row) return { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  return {
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  };
}

async function pageMetrics(
  token: string,
  property: string,
  page: string,
  window: { startDate: string; endDate: string },
): Promise<PageMetrics> {
  const rows = await query(token, property, {
    startDate: window.startDate,
    endDate: window.endDate,
    rowLimit: 1,
    dimensionFilterGroups: [
      {
        filters: [
          {
            dimension: "page",
            operator: "equals",
            expression: `${BASE_URL}${page}`,
          },
        ],
      },
    ],
  });
  return toMetrics(rows);
}

async function main() {
  const property = process.env.SC_PROPERTY?.trim();
  if (!property) throw new Error("SC_PROPERTY is required");
  const actionedAt = arg("actioned");
  if (!actionedAt || !/^\d{4}-\d{2}-\d{2}$/.test(actionedAt)) {
    throw new Error("--actioned YYYY-MM-DD is required (the ship date)");
  }
  const pages = arg("pages")?.split(",").map((p) => p.trim()).filter(Boolean)
    ?? DEFAULT_PAGES;

  const today = todayISO();
  const windows = buildDeltaWindows(actionedAt, today);

  console.log(`Shipped:  ${actionedAt}`);
  console.log(
    `Before:   ${windows.before.startDate} .. ${windows.before.endDate}`,
  );
  console.log(
    `After:    ${windows.after.startDate} .. ${windows.after.endDate} (${windows.afterDays} day(s))`,
  );

  if (!windows.ready) {
    console.log(
      `\nToo early to read. Google has not had enough post-recrawl days yet; re-run once the after window reaches 14 days.`,
    );
    return;
  }

  const token = await accessToken(readCredentialsFromEnv());
  const deltas = [];
  for (const page of pages) {
    const [before, after] = await Promise.all([
      pageMetrics(token, property, page, windows.before),
      pageMetrics(token, property, page, windows.after),
    ]);
    deltas.push(comparePage(page, before, after));
  }

  deltas.sort((a, b) => b.before.impressions - a.before.impressions);

  console.log(
    `\n${"page".padEnd(24)} ${"clicks/1k before→after".padEnd(24)} ${"pos".padEnd(14)} verdict`,
  );
  for (const d of deltas) {
    const rate = `${d.beforeClicksPerMille.toFixed(1)} → ${d.afterClicksPerMille.toFixed(1)}`;
    const pos = `${d.before.position.toFixed(1)} → ${d.after.position.toFixed(1)}`;
    const caveat = d.positionStable ? "" : "  (position moved — not snippet-attributable)";
    console.log(
      `${d.page.padEnd(24)} ${rate.padEnd(24)} ${pos.padEnd(14)} ${d.verdict}${caveat}`,
    );
  }

  const outPath = process.env.SEO_DELTA_JSON_PATH ?? "seo-page-delta.json";
  writeFileSync(
    outPath,
    `${JSON.stringify({ actionedAt, windows, deltas }, null, 2)}\n`,
  );
  console.log(`\nWrote ${outPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
