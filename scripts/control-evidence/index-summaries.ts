import "dotenv/config";
import path from "node:path";
import { pathToFileURL } from "node:url";
import postgres, { type Sql } from "postgres";
import { CONTROL_TAXONOMY_VERSION, matchControlEvidence } from "../../src/data/controlTaxonomy.js";
import { CONTROL_DISCOVERY_REGULATOR_CODES } from "../../src/data/controlDiscoveryScope.js";
import { describeDbTarget, requireExpectedDbTarget, resolveConnectionString } from "../../scripts/lib/dbTarget.js";

/**
 * Bounded incremental indexer for current stored fields. Default mode is
 * repeatable-read/read-only. `--apply` mutates only the classification and
 * index-state tables; `--prune-stale` is an explicit operator-only delete of
 * obsolete rows in that classification table. `__NO_MATCH__` is bookkeeping,
 * never a visible control or official-source claim.
 */
export const DEFAULT_SUMMARY_INDEX_PAGE_SIZE = 250;
export const MAX_SUMMARY_INDEX_PAGE_SIZE = 1000;
export const SUMMARY_INDEX_STATEMENT_TIMEOUT = "120s";
export const SUMMARY_INDEX_LOCK_TIMEOUT = "10s";
export const SUMMARY_INDEX_CURSOR_NAME = "control_summary_index_scan";
export const NO_MATCH_SENTINEL_CONTROL_CODE = "__NO_MATCH__";
type TransactionSql = postgres.TransactionSql;

export type StoredSummaryRecord = {
  public_case_id: string;
  firm_individual: string | null;
  summary: string | null;
  breach_type: string | null;
  /** Preserve this raw JSONB value in fingerprints, including double-encoded strings. */
  breach_categories: unknown;
};

export type SummaryClassification = {
  public_case_id: string;
  control_code: string;
  taxonomy_version: string;
  match_terms: string[];
  matched_passages: Array<{ field: string; passage: string; matchedTerms: string[] }>;
  source_field_fingerprints: {
    firm_individual: string | null;
    summary: string | null;
    breach_type: string | null;
    breach_categories: unknown;
  };
  classification_basis: "stored_summary";
};

export type SummaryIndexOptions = { apply: boolean; pruneStale: boolean; pageSize: number; outputPath: string | null };

function parseCategories(value: unknown): string[] {
  let current = value;
  for (let depth = 0; depth < 3 && typeof current === "string"; depth += 1) {
    try { current = JSON.parse(current); } catch { return []; }
  }
  return Array.isArray(current) ? current.map((item) => String(item)) : [];
}

export function buildSourceFieldFingerprints(record: StoredSummaryRecord): SummaryClassification["source_field_fingerprints"] {
  return {
    firm_individual: record.firm_individual ?? null,
    summary: record.summary ?? null,
    breach_type: record.breach_type ?? null,
    breach_categories: record.breach_categories ?? null,
  };
}

export function classifyStoredSummary(record: StoredSummaryRecord, taxonomyVersion = CONTROL_TAXONOMY_VERSION): SummaryClassification[] {
  const matches = matchControlEvidence({
    firmIndividual: record.firm_individual,
    summary: record.summary,
    breachType: record.breach_type,
    breachCategories: parseCategories(record.breach_categories),
  });
  const byCode = new Map<string, SummaryClassification>();
  for (const match of matches) {
    let entry = byCode.get(match.code);
    if (!entry) {
      entry = {
        public_case_id: record.public_case_id,
        control_code: match.code,
        taxonomy_version: taxonomyVersion,
        match_terms: [],
        matched_passages: [],
        source_field_fingerprints: buildSourceFieldFingerprints(record),
        classification_basis: "stored_summary",
      };
      byCode.set(match.code, entry);
    }
    for (const term of match.matchedTerms) if (!entry.match_terms.includes(term)) entry.match_terms.push(term);
    if (!entry.matched_passages.some((passage) => passage.field === match.field && passage.passage === match.passage)) {
      entry.matched_passages.push({ field: match.field, passage: match.passage, matchedTerms: [...match.matchedTerms] });
    }
  }
  if (!byCode.size) {
    return [{
      public_case_id: record.public_case_id,
      control_code: NO_MATCH_SENTINEL_CONTROL_CODE,
      taxonomy_version: taxonomyVersion,
      match_terms: [],
      matched_passages: [],
      source_field_fingerprints: buildSourceFieldFingerprints(record),
      classification_basis: "stored_summary",
    }];
  }
  return [...byCode.values()];
}

export function parseSummaryIndexArgs(args: string[]): SummaryIndexOptions {
  let apply = false;
  let dryRun = false;
  let pruneStale = false;
  let pageSize = DEFAULT_SUMMARY_INDEX_PAGE_SIZE;
  let outputPath: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") apply = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--prune-stale") pruneStale = true;
    else if (arg === "--page-size") {
      const value = Number(args[++index]);
      if (!Number.isInteger(value) || value < 1 || value > MAX_SUMMARY_INDEX_PAGE_SIZE) throw new Error(`--page-size must be an integer from 1 to ${MAX_SUMMARY_INDEX_PAGE_SIZE}`);
      pageSize = value;
    } else if (arg.startsWith("--page-size=")) {
      const value = Number(arg.slice("--page-size=".length));
      if (!Number.isInteger(value) || value < 1 || value > MAX_SUMMARY_INDEX_PAGE_SIZE) throw new Error(`--page-size must be an integer from 1 to ${MAX_SUMMARY_INDEX_PAGE_SIZE}`);
      pageSize = value;
    } else if (arg === "--out") {
      outputPath = args[++index];
      if (!outputPath || outputPath.startsWith("--")) throw new Error("--out requires a path");
    } else if (arg.startsWith("--out=")) outputPath = arg.slice("--out=".length) || null;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (apply && dryRun) throw new Error("--apply and --dry-run are mutually exclusive");
  if (pruneStale && !apply) throw new Error("--prune-stale requires explicit --apply");
  return { apply, pruneStale, pageSize, outputPath };
}

export const PRUNE_STALE_SUMMARY_MATCHES_SQL = `
DELETE FROM public.enforcement_control_summary_matches AS match
WHERE match.taxonomy_version <> $1
   OR NOT EXISTS (
     SELECT 1
       FROM public.all_regulatory_fines_trusted AS current_case
      WHERE current_case.public_case_id = match.public_case_id
        AND match.source_field_fingerprints = jsonb_build_object(
          'firm_individual', current_case.firm_individual,
          'summary', current_case.summary,
          'breach_type', current_case.breach_type,
          'breach_categories', current_case.breach_categories
        )
   )`;

type SummaryIndexSummary = {
  mode: "dry-run" | "apply";
  database: { host: string; database: string } | null;
  taxonomyVersion: string;
  pageSize: number;
  publicCaseCount: number;
  publicMaxCaseId: string | null;
  classifiedThroughPublicId: string | null;
  casesScanned: number;
  casesWithNoControlMatch: number;
  matchesFound: number;
  matchesByControl: Record<string, number>;
  matchesUpserted?: number;
  staleRowsRemoved?: number;
  classificationBasis: "stored_summary";
};

export const CANONICAL_UNINDEXED_SUMMARIES_SQL = `
    WITH canonical_cases AS (
      SELECT DISTINCT ON (source_case.public_case_id)
        source_case.public_case_id,
        source_case.firm_individual,
        source_case.summary,
        source_case.breach_type,
        source_case.breach_categories,
        source_case.created_at,
        source_case.id::text AS source_row_sort_id
      FROM public.all_regulatory_fines_trusted AS source_case
      WHERE source_case.public_case_id IS NOT NULL
        AND upper(source_case.regulator) = ANY($2::text[])
      ORDER BY source_case.public_case_id,
               source_case.created_at DESC NULLS LAST,
               source_case.id::text DESC
    )
    SELECT current_case.public_case_id,
           current_case.firm_individual,
           current_case.summary,
           current_case.breach_type,
           current_case.breach_categories
      FROM canonical_cases AS current_case
     WHERE NOT EXISTS (
        SELECT 1
          FROM public.enforcement_control_summary_matches AS indexed
         WHERE indexed.public_case_id = current_case.public_case_id
           AND indexed.taxonomy_version = $1
           AND indexed.source_field_fingerprints = jsonb_build_object(
             'firm_individual', current_case.firm_individual,
             'summary', current_case.summary,
             'breach_type', current_case.breach_type,
             'breach_categories', current_case.breach_categories
           )
      )
     ORDER BY current_case.public_case_id
`;

async function fetchPublicScope(tx: TransactionSql): Promise<{ public_case_count: number; public_max_case_id: string | null }> {
  const [row] = await tx.unsafe<Array<{ public_case_count: string; public_max_case_id: string | null }>>(`
    SELECT count(DISTINCT public_case_id)::text AS public_case_count,
           max(public_case_id) AS public_max_case_id
      FROM public.all_regulatory_fines_trusted
     WHERE public_case_id IS NOT NULL
       AND upper(regulator) = ANY($1::text[])
  `, [CONTROL_DISCOVERY_REGULATOR_CODES]);
  return { public_case_count: Number(row.public_case_count), public_max_case_id: row.public_max_case_id };
}

export const RECORD_VERSIONED_SUMMARY_INDEX_STATE_SQL = `
  INSERT INTO public.enforcement_control_summary_index_state_versions (
    scope_key, taxonomy_version, scan_as_of, public_case_count,
    public_max_case_id, classified_through_public_id, complete, indexed_at
  ) VALUES ('public', $1, transaction_timestamp(), $2, $3, $3, true, now())
  ON CONFLICT (scope_key, taxonomy_version) DO UPDATE SET
    scan_as_of = EXCLUDED.scan_as_of,
    public_case_count = EXCLUDED.public_case_count,
    public_max_case_id = EXCLUDED.public_max_case_id,
    classified_through_public_id = EXCLUDED.classified_through_public_id,
    complete = true,
    indexed_at = EXCLUDED.indexed_at
`;

async function recordCompleteIndexState(tx: TransactionSql, publicCaseCount: number, publicMaxCaseId: string | null): Promise<void> {
  await tx.unsafe(RECORD_VERSIONED_SUMMARY_INDEX_STATE_SQL, [CONTROL_TAXONOMY_VERSION, publicCaseCount, publicMaxCaseId]);
}

/** Force postgres.js to bind the batch as one JSONB value (OID 3802). */
export function summaryClassificationsJsonbParameter(
  tx: Pick<TransactionSql, "json">,
  entries: SummaryClassification[],
): ReturnType<TransactionSql["json"]> {
  // PostgreSQL JSONB values in fingerprints are runtime-JSON-compatible, but
  // their source column is intentionally typed `unknown` to preserve fidelity.
  return tx.json(entries as never);
}

async function upsertClassifications(tx: TransactionSql, entries: SummaryClassification[]): Promise<number> {
  if (!entries.length) return 0;
  const result = await tx.unsafe<{ public_case_id: string }[]>(`
    INSERT INTO public.enforcement_control_summary_matches AS existing (
      public_case_id, control_code, taxonomy_version, match_terms,
      matched_passages, source_field_fingerprints, classification_basis, classified_at
    )
    SELECT
      row.public_case_id,
      row.control_code,
      row.taxonomy_version,
      ARRAY(SELECT jsonb_array_elements_text(row.match_terms)),
      row.matched_passages,
      row.source_field_fingerprints,
      'stored_summary',
      now()
    FROM jsonb_to_recordset($1::jsonb) AS row(
      public_case_id text,
      control_code text,
      taxonomy_version text,
      match_terms jsonb,
      matched_passages jsonb,
      source_field_fingerprints jsonb
    )
    ON CONFLICT (public_case_id, control_code, taxonomy_version)
    DO UPDATE SET
      match_terms = EXCLUDED.match_terms,
      matched_passages = EXCLUDED.matched_passages,
      source_field_fingerprints = EXCLUDED.source_field_fingerprints,
      classification_basis = 'stored_summary',
      classified_at = now()
    WHERE existing.match_terms IS DISTINCT FROM EXCLUDED.match_terms
       OR existing.matched_passages IS DISTINCT FROM EXCLUDED.matched_passages
       OR existing.source_field_fingerprints IS DISTINCT FROM EXCLUDED.source_field_fingerprints
    RETURNING public_case_id
  `, [summaryClassificationsJsonbParameter(tx, entries)]);
  return result.length;
}

export async function runSummaryIndex(sql: Sql, options: SummaryIndexOptions, database: SummaryIndexSummary["database"]): Promise<SummaryIndexSummary> {
  const summary: SummaryIndexSummary = {
    mode: options.apply ? "apply" : "dry-run",
    database,
    taxonomyVersion: CONTROL_TAXONOMY_VERSION,
    pageSize: options.pageSize,
    publicCaseCount: 0,
    publicMaxCaseId: null,
    classifiedThroughPublicId: null,
    casesScanned: 0,
    casesWithNoControlMatch: 0,
    matchesFound: 0,
    matchesByControl: {},
    classificationBasis: "stored_summary",
  };
  let upserted = 0;
  let staleRowsRemoved = 0;
  let pagesScanned = 0;
  await sql.begin(async (tx) => {
    await tx.unsafe(options.apply
      ? "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"
      : "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    await tx.unsafe(`SET LOCAL statement_timeout = '${SUMMARY_INDEX_STATEMENT_TIMEOUT}'`);
    await tx.unsafe(`SET LOCAL lock_timeout = '${SUMMARY_INDEX_LOCK_TIMEOUT}'`);
    if (options.apply) await tx.unsafe("SELECT pg_advisory_xact_lock(hashtext('regactions-control-summary-index'))");
    await tx.unsafe(`DECLARE ${SUMMARY_INDEX_CURSOR_NAME} NO SCROLL CURSOR FOR ${CANONICAL_UNINDEXED_SUMMARIES_SQL}`, [
      CONTROL_TAXONOMY_VERSION,
      CONTROL_DISCOVERY_REGULATOR_CODES,
    ]);
    for (;;) {
      const page = await tx.unsafe<StoredSummaryRecord[]>(`FETCH FORWARD ${options.pageSize} FROM ${SUMMARY_INDEX_CURSOR_NAME}`);
      if (!page.length) break;
      pagesScanned += 1;
      const entries = page.flatMap((record) => classifyStoredSummary(record));
      const visibleMatches = entries.filter((entry) => entry.control_code !== NO_MATCH_SENTINEL_CONTROL_CODE);
      summary.casesScanned += page.length;
      summary.casesWithNoControlMatch += entries.filter((entry) => entry.control_code === NO_MATCH_SENTINEL_CONTROL_CODE).length;
      summary.matchesFound += visibleMatches.length;
      for (const entry of visibleMatches) summary.matchesByControl[entry.control_code] = (summary.matchesByControl[entry.control_code] ?? 0) + 1;
      if (options.apply) upserted += await upsertClassifications(tx, entries);
      if (options.apply && pagesScanned % 10 === 0) {
        process.stderr.write(`[control-summary-index] scanned ${summary.casesScanned} cases across ${pagesScanned} pages\n`);
      }
    }
    await tx.unsafe(`CLOSE ${SUMMARY_INDEX_CURSOR_NAME}`);
    const scope = await fetchPublicScope(tx);
    summary.publicCaseCount = scope.public_case_count;
    summary.publicMaxCaseId = scope.public_max_case_id;
    summary.classifiedThroughPublicId = scope.public_max_case_id;
    if (options.apply) await recordCompleteIndexState(tx, scope.public_case_count, scope.public_max_case_id);
    if (options.apply && options.pruneStale) {
      const result = await tx.unsafe<{ public_case_id: string }[]>(`${PRUNE_STALE_SUMMARY_MATCHES_SQL} RETURNING public_case_id`, [CONTROL_TAXONOMY_VERSION]);
      staleRowsRemoved = result.length;
    }
  });
  if (options.apply) {
    summary.matchesUpserted = upserted;
    if (options.pruneStale) summary.staleRowsRemoved = staleRowsRemoved;
  }
  return summary;
}

async function main(): Promise<void> {
  const options = parseSummaryIndexArgs(process.argv.slice(2));
  const connectionString = resolveConnectionString();
  if (!connectionString) throw new Error("A supported REGACTIONS_DATABASE_URL or DATABASE_URL is required");
  const database = describeDbTarget(connectionString);
  if (!database) throw new Error("Unable to determine database target");
  if (options.apply) requireExpectedDbTarget("control-summary-index");
  const sql = postgres(connectionString, { max: 1, connect_timeout: 10, idle_timeout: 5, ssl: connectionString.includes("sslmode=") ? { rejectUnauthorized: false } : false });
  try {
    const result = await runSummaryIndex(sql, options, database);
    const output = `${JSON.stringify(result, null, 2)}\n`;
    if (options.outputPath) {
      const fs = await import("node:fs/promises");
      const destination = path.resolve(options.outputPath);
      await fs.writeFile(destination, output, { flag: "wx", mode: 0o600 });
      console.log(`Summary written to ${destination}`);
    } else console.log(output);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
