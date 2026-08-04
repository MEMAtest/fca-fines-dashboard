import { createSign } from "node:crypto";
import { writeFileSync } from "node:fs";

type SearchConsoleRow = {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type Metrics = Pick<SearchConsoleRow, "clicks" | "impressions" | "ctr" | "position">;

const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function isoDaysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function encode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

async function accessToken(credentials: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = encode(JSON.stringify({
    iss: credentials.client_email,
    scope: SEARCH_CONSOLE_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(credentials.private_key, "base64url")}`;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Search Console authentication failed (${response.status})`);
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("Search Console authentication returned no token");
  return payload.access_token;
}

async function query(
  token: string,
  property: string,
  body: { startDate: string; endDate: string; dimensions?: string[]; rowLimit?: number },
) {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Search Console query failed (${response.status}): ${await response.text()}`);
  const payload = await response.json() as { rows?: SearchConsoleRow[] };
  return payload.rows ?? [];
}

function pct(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function metricRow(rows: SearchConsoleRow[]): Metrics {
  const row = rows[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  return { clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position };
}

export function topTwentyMovement(current: SearchConsoleRow[], previous: SearchConsoleRow[]) {
  const previousByQuery = new Map(previous.map((row) => [row.keys?.[0] ?? "", row]));
  const currentTop20 = current.filter((row) => row.position <= 20);
  const previousTop20 = previous.filter((row) => row.position <= 20);
  const entered = currentTop20.filter((row) => (previousByQuery.get(row.keys?.[0] ?? "")?.position ?? Infinity) > 20);
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
  return { currentCount: currentTop20.length, previousCount: previousTop20.length, entered: entered.slice(0, 15), movers };
}

async function main() {
  const property = process.env.SC_PROPERTY?.trim();
  const rawCredentials = process.env.SC_CREDENTIALS_JSON?.trim();
  if (!property || !rawCredentials) throw new Error("SC_PROPERTY and SC_CREDENTIALS_JSON are required");
  const credentials = JSON.parse(rawCredentials) as { client_email: string; private_key: string };
  const token = await accessToken(credentials);
  const current = { startDate: isoDaysAgo(8), endDate: isoDaysAgo(2) };
  const previous = { startDate: isoDaysAgo(15), endDate: isoDaysAgo(9) };
  const [currentTotalRows, previousTotalRows, currentQueries, previousQueries, pages] = await Promise.all([
    query(token, property, current),
    query(token, property, previous),
    query(token, property, { ...current, dimensions: ["query"], rowLimit: 25_000 }),
    query(token, property, { ...previous, dimensions: ["query"], rowLimit: 25_000 }),
    query(token, property, { ...current, dimensions: ["page"], rowLimit: 2_000 }),
  ]);
  const currentTotals = metricRow(currentTotalRows);
  const previousTotals = metricRow(previousTotalRows);
  const movement = topTwentyMovement(currentQueries, previousQueries);
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
    opportunityPages: pages
      .filter((row) => row.impressions >= 10 && row.position >= 5)
      .sort((left, right) => right.impressions - left.impressions)
      .slice(0, 20),
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
