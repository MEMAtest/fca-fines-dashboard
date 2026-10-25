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
  resolveEuSanctionsXmlUrl,
  type CountryRegimeAggregate,
  type SanctionsRegimeCode,
} from "./connectors.js";
import { recordRun } from "./registerStaleness.js";

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

export interface IngestResult {
  regimeCode: SanctionsRegimeCode;
  skipped: boolean;
  evidence?: string;
  entryCount?: number;
  countryCount?: number;
  changeLogRows?: number;
}

export async function ingestRegime(regimeCode: SanctionsRegimeCode): Promise<IngestResult> {
  const feed = SANCTIONS_FEEDS[regimeCode];
  let url = feed.defaultMachineReadableUrl;
  if (url === "builtin:eu-financial-sanctions") {
    const resolution = await resolveEuSanctionsXmlUrl();
    if (!resolution.url) {
      // The catalogue genuinely gave no machine-readable URL this run: show
      // the evidence and skip, rather than guessing or hard-coding a stale
      // tokenised link. The tab must say "EU list not ingested", never imply
      // "no EU sanctions".
      console.warn(`EU list not ingested — ${resolution.evidence}`);
      await recordRun("sanctions-eu", "skipped", resolution.evidence);
      return { regimeCode, skipped: true, evidence: resolution.evidence };
    }
    url = resolution.url;
    console.log(`EU XML resolved at runtime from the catalogue: ${resolution.evidence}`);
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
  if (regimeCode === "eu") {
    await recordRun("sanctions-eu", "success", `${entries.length} entries, ${aggregates.length} countries`);
  }
  return {
    regimeCode,
    skipped: false,
    entryCount: entries.length,
    countryCount: aggregates.length,
    changeLogRows,
  };
}

async function main() {
  const codes: SanctionsRegimeCode[] = ["un", "ofac", "uk", "eu"];
  let anySucceeded = false;
  const errors: string[] = [];
  for (const code of codes) {
    try {
      const result = await ingestRegime(code);
      if (!result.skipped) anySucceeded = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${code} ingest failed:`, message);
      errors.push(`${code}: ${message}`);
      if (code === "eu") await recordRun("sanctions-eu", "error", message);
      process.exitCode = 1;
    }
  }
  // Staleness is about the pipeline running successfully, not about every
  // regime succeeding every day (EU can be legitimately skipped on a given
  // run if the catalogue has no XML distribution that day).
  if (anySucceeded) {
    await recordRun("sanctions", "success", errors.length > 0 ? errors.join("; ") : undefined);
  } else {
    await recordRun("sanctions", "error", errors.join("; ") || "No regime ingested successfully");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
