/**
 * Daily sanctions ingest for the global register ("atlas"), Phase 2.
 *
 * Fetches each regime's machine-readable list, parses it (in Actions, not in
 * the DB), aggregates per country, and writes ONLY batched aggregates:
 *   - one register_sanctions_snapshots row per (regime, country, day)
 *   - a register_change_log row per (regime, country) whose count changed
 *     versus yesterday's snapshot, via diffAggregate()
 *
 * Individual designees are never persisted — aggregateByCountry() discards
 * them before this function sees anything.
 */
import { createHash } from "node:crypto";
import { getSqlClient } from "../../../server/db.js";
import {
  SANCTIONS_FEEDS,
  aggregateByCountry,
  diffAggregate,
  parseSanctionsFeed,
  type CountryRegimeAggregate,
  type SanctionsRegimeCode,
} from "./connectors.js";

async function fetchFeedText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "RegActions-Atlas/1.0", Accept: "application/xml, text/xml, */*" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
  return await response.text();
}

async function getPreviousAggregate(
  sql: ReturnType<typeof getSqlClient>,
  regimeCode: SanctionsRegimeCode,
  iso2: string,
): Promise<CountryRegimeAggregate | null> {
  const rows = await sql(
    `SELECT designation_count, programmes FROM register_sanctions_snapshots
     WHERE regime_code = $1 AND iso2 = $2 ORDER BY snapshot_date DESC LIMIT 1`,
    [regimeCode, iso2],
  );
  if (rows.length === 0) return null;
  return {
    regimeCode,
    iso2,
    designationCount: Number(rows[0].designation_count),
    programmes: (rows[0].programmes as string[] | undefined) ?? [],
  };
}

export async function ingestRegime(regimeCode: SanctionsRegimeCode) {
  const feed = SANCTIONS_FEEDS[regimeCode];
  const url = feed.defaultMachineReadableUrl;
  if (url === "builtin:eu-financial-sanctions") {
    // EU dataset resolution (data.europa.eu metadata -> XML distribution) is
    // out of scope for this pass; skip rather than guess a URL.
    console.warn(`Skipping ${regimeCode}: builtin EU URL resolution not implemented in this script`);
    return;
  }

  const xml = await fetchFeedText(url);
  const fileSha256 = createHash("sha256").update(xml, "utf8").digest("hex");
  const entries = parseSanctionsFeed(regimeCode, xml);
  const aggregates = aggregateByCountry(regimeCode, entries);

  const sql = getSqlClient();
  const sourceRow = await sql(`SELECT id FROM register_sources WHERE code = $1 LIMIT 1`, [feed.sourceCode]);
  const sourceId = sourceRow[0]?.id ?? null;
  const today = new Date().toISOString().slice(0, 10);

  let changeLogRows = 0;
  for (const aggregate of aggregates) {
    const previous = await getPreviousAggregate(sql, regimeCode, aggregate.iso2);
    await sql(
      `INSERT INTO register_sanctions_snapshots
         (regime_code, iso2, snapshot_date, designation_count, programmes, file_sha256, source_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (regime_code, iso2, snapshot_date) DO UPDATE SET
         designation_count = EXCLUDED.designation_count,
         programmes = EXCLUDED.programmes,
         file_sha256 = EXCLUDED.file_sha256`,
      [regimeCode, aggregate.iso2, today, aggregate.designationCount, aggregate.programmes, fileSha256, sourceId],
    );

    const summary = diffAggregate(aggregate, previous);
    if (summary) {
      await sql(
        `INSERT INTO register_change_log (iso2, category, event_date, summary, source_url, source_id)
         VALUES ($1, 'sanctions', $2, $3, $4, $5)`,
        [aggregate.iso2, today, summary, feed.sourceUrl, sourceId],
      );
      changeLogRows += 1;
    }
  }

  console.log(
    `${regimeCode}: parsed ${entries.length} entries, ${aggregates.length} countries, ${changeLogRows} change-log row(s) written.`,
  );
}

async function main() {
  const codes: SanctionsRegimeCode[] = ["un", "ofac", "uk", "eu"];
  for (const code of codes) {
    try {
      await ingestRegime(code);
    } catch (error) {
      console.error(`${code} ingest failed:`, error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
