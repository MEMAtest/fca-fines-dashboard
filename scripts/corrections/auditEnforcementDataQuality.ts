#!/usr/bin/env npx tsx
/**
 * Evidence-first audit for duplicate and shared/aggregate enforcement amounts.
 *
 * Default mode is read-only and emits JSON suitable for a coverage/QA queue.
 * --apply records fail-closed review markers only; it never mutates an
 * underlying FCA or global-enforcement row and never invents an allocation.
 */
import pg from "pg";
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPgPoolConfig, resolveConnectionString } from "../../server/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");
config({ path: join(root, ".env") });
config({ path: join(root, ".env.local"), override: false });

const NORMALISED_URL = `public.normalise_regulatory_evidence_url(
  COALESCE(NULLIF(notice_url, ''), NULLIF(source_url, ''), '')
)`;
const NORMALISED_TEXT = (column: string) =>
  `regexp_replace(lower(trim(COALESCE(${column}, ''))), '[[:space:]]+', ' ', 'g')`;

interface ExactDuplicateGroup {
  regulator: string;
  evidence_url: string;
  firm: string;
  date_issued: string;
  amount_original: string | null;
  currency: string | null;
  source_row_ids: string[];
  row_count: number;
}

interface AggregateCandidate {
  regulator: string;
  evidence_url: string;
  date_issued: string;
  amount_original: string;
  currency: string;
  source_row_ids: string[];
  firms: string[];
  participant_count: number;
}

interface QaRecord {
  id: string;
  regulator: string;
  firm_individual: string | null;
  date_issued: string | null;
  notice_url: string | null;
  source_url: string | null;
  issue: string;
}

async function main() {
  const connectionString = resolveConnectionString();
  if (!connectionString) throw new Error("A database connection string is required");

  const apply = process.argv.includes("--apply");
  const pool = new pg.Pool(buildPgPoolConfig(connectionString));
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const [exactDuplicates, aggregateCandidates, malformedEntities, nonSpecificSources] = await Promise.all([
      client.query<ExactDuplicateGroup>(`
        SELECT
          upper(regulator) AS regulator,
          ${NORMALISED_URL} AS evidence_url,
          min(firm_individual) AS firm,
          date_issued::text,
          amount_original::text,
          upper(currency) AS currency,
          array_agg(id::text ORDER BY created_at DESC NULLS LAST, id DESC) AS source_row_ids,
          count(*)::integer AS row_count
        FROM public.all_regulatory_fines
        WHERE ${NORMALISED_URL} <> ''
        GROUP BY upper(regulator), ${NORMALISED_URL}, ${NORMALISED_TEXT("firm_individual")}, date_issued, amount_original, upper(currency), ${NORMALISED_TEXT("summary")}
        HAVING count(*) > 1
        ORDER BY count(*) DESC, regulator, evidence_url
      `),
      client.query<AggregateCandidate>(`
        SELECT
          upper(regulator) AS regulator,
          ${NORMALISED_URL} AS evidence_url,
          date_issued::text,
          amount_original::text,
          upper(currency) AS currency,
          array_agg(id::text ORDER BY id) AS source_row_ids,
          array_agg(DISTINCT firm_individual ORDER BY firm_individual) AS firms,
          count(DISTINCT ${NORMALISED_TEXT("firm_individual")})::integer AS participant_count
        FROM public.all_regulatory_fines
        WHERE ${NORMALISED_URL} <> ''
          AND amount_original IS NOT NULL
          AND NULLIF(trim(COALESCE(firm_individual, '')), '') IS NOT NULL
        GROUP BY upper(regulator), ${NORMALISED_URL}, date_issued, amount_original, upper(currency)
        HAVING count(DISTINCT ${NORMALISED_TEXT("firm_individual")}) > 1
        ORDER BY participant_count DESC, regulator, evidence_url
      `),
      client.query<QaRecord>(`
        SELECT id::text, upper(regulator) AS regulator, firm_individual, date_issued::text,
          notice_url, source_url, 'malformed_entity' AS issue
        FROM public.all_regulatory_fines
        WHERE firm_individual ~* '^(aktuelles( & presse)?|news|press release|enforcement|sanctions|details|untitled)\\s*[-:|]'
        ORDER BY regulator, date_issued DESC NULLS LAST
      `),
      client.query<QaRecord>(`
        SELECT id::text, upper(regulator) AS regulator, firm_individual, date_issued::text,
          notice_url, source_url, 'missing_or_non_specific_source' AS issue
        FROM public.all_regulatory_fines
        WHERE ${NORMALISED_URL} = ''
          OR ${NORMALISED_URL} ~ '/(search|news|enforcement)(/)?$'
        ORDER BY regulator, date_issued DESC NULLS LAST
      `),
    ]);

    let persistedReviewMarkers = 0;
    if (apply && aggregateCandidates.rows.length) {
      const rows = aggregateCandidates.rows.flatMap((candidate) =>
        candidate.source_row_ids.map((sourceRowId) => ({
          sourceRowId,
          evidenceUrl: candidate.evidence_url,
          reason: `One ${candidate.currency} ${candidate.amount_original} amount is repeated across ${candidate.participant_count} participants on ${candidate.date_issued} in the same official publication. The publication-level total is withheld until an individual allocation is verified.`,
        })),
      );
      const result = await client.query(
        `INSERT INTO public.regulatory_case_amount_reviews (
           source_row_id, review_status, reason, evidence_url, detected_at, updated_at
         )
         SELECT item."sourceRowId", 'required', item.reason, item."evidenceUrl", now(), now()
         FROM jsonb_to_recordset($1::jsonb) AS item(
           "sourceRowId" text, "evidenceUrl" text, reason text
         )
         ON CONFLICT (source_row_id) DO UPDATE SET
           review_status = 'required',
           reason = EXCLUDED.reason,
           evidence_url = EXCLUDED.evidence_url,
           updated_at = now()`,
        [JSON.stringify(rows)],
      );
      persistedReviewMarkers = result.rowCount ?? 0;
      await client.query("SELECT public.refresh_all_fines()");
    }

    if (apply) await client.query("COMMIT");
    else await client.query("ROLLBACK");

    console.log(JSON.stringify({
      mode: apply ? "apply-review-markers" : "dry-run",
      generatedAt: new Date().toISOString(),
      exactSameSourceDuplicates: exactDuplicates.rows,
      aggregateAmountCandidates: aggregateCandidates.rows,
      malformedEntities: malformedEntities.rows,
      missingOrNonSpecificSources: nonSpecificSources.rows,
      summary: {
        exactSameSourceDuplicateGroups: exactDuplicates.rows.length,
        aggregateAmountGroups: aggregateCandidates.rows.length,
        aggregateRowsMarkedForReview: apply ? persistedReviewMarkers : aggregateCandidates.rows.reduce((sum, row) => sum + row.source_row_ids.length, 0),
        malformedEntityRows: malformedEntities.rows.length,
        missingOrNonSpecificSourceRows: nonSpecificSources.rows.length,
      },
    }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error("Enforcement evidence quality audit failed", error);
  process.exitCode = 1;
});
