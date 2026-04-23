import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(databaseUrl, {
  ssl: databaseUrl.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : undefined,
});

function parseIntArg(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeJsonArrayExpression(columnName: string) {
  return `
    CASE
      WHEN jsonb_typeof(${columnName}) = 'array' THEN ${columnName}
      WHEN jsonb_typeof(${columnName}) = 'string'
        AND (${columnName} #>> '{}') LIKE '[%'
        THEN (${columnName} #>> '{}')::jsonb
      ELSE '[]'::jsonb
    END
  `;
}

async function main() {
  const windowDays = parseIntArg(process.argv[2], 30);
  const limit = parseIntArg(process.argv[3], 10);

  const [summary] = await sql<
    Array<{
      total_queries: number;
      zero_result_queries: number;
      low_signal_queries: number;
      corrected_queries: number;
      avg_latency_ms: number | null;
      p95_latency_ms: number | null;
    }>
  >`
    SELECT
      COUNT(*)::int AS total_queries,
      COUNT(*) FILTER (WHERE zero_result)::int AS zero_result_queries,
      COUNT(*) FILTER (WHERE low_signal)::int AS low_signal_queries,
      COUNT(*) FILTER (WHERE correction_count > 0)::int AS corrected_queries,
      ROUND(AVG(latency_ms))::int AS avg_latency_ms,
      ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms))::int AS p95_latency_ms
    FROM search_query_analytics
    WHERE created_at >= NOW() - (${windowDays} || ' days')::interval
  `;

  const daily = await sql<
    Array<{
      day: string;
      total_queries: number;
      zero_result_queries: number;
      low_signal_queries: number;
      corrected_queries: number;
    }>
  >`
    SELECT
      TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS total_queries,
      COUNT(*) FILTER (WHERE zero_result)::int AS zero_result_queries,
      COUNT(*) FILTER (WHERE low_signal)::int AS low_signal_queries,
      COUNT(*) FILTER (WHERE correction_count > 0)::int AS corrected_queries
    FROM search_query_analytics
    WHERE created_at >= NOW() - (${windowDays} || ' days')::interval
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT ${Math.min(windowDays, 14)}
  `;

  const topZeroResultQueries = await sql<
    Array<{
      query_normalized: string;
      searches: number;
      last_seen: string;
    }>
  >`
    SELECT
      query_normalized,
      COUNT(*)::int AS searches,
      MAX(created_at)::text AS last_seen
    FROM search_query_analytics
    WHERE created_at >= NOW() - (${windowDays} || ' days')::interval
      AND zero_result = TRUE
      AND low_signal = FALSE
    GROUP BY query_normalized
    ORDER BY searches DESC, last_seen DESC
    LIMIT ${limit}
  `;

  const topLowSignalQueries = await sql<
    Array<{
      query_normalized: string;
      searches: number;
      last_seen: string;
    }>
  >`
    SELECT
      query_normalized,
      COUNT(*)::int AS searches,
      MAX(created_at)::text AS last_seen
    FROM search_query_analytics
    WHERE created_at >= NOW() - (${windowDays} || ' days')::interval
      AND low_signal = TRUE
    GROUP BY query_normalized
    ORDER BY searches DESC, last_seen DESC
    LIMIT ${limit}
  `;

  const topCorrections = await sql<
    Array<{
      from_term: string;
      to_term: string;
      uses: number;
    }>
  >`
    SELECT
      correction ->> 'from' AS from_term,
      correction ->> 'to' AS to_term,
      COUNT(*)::int AS uses
    FROM search_query_analytics,
      LATERAL jsonb_array_elements(
        ${sql.unsafe(normalizeJsonArrayExpression('correction_pairs'))}
      ) AS correction
    WHERE created_at >= NOW() - (${windowDays} || ' days')::interval
    GROUP BY 1, 2
    ORDER BY uses DESC, from_term ASC
    LIMIT ${limit}
  `;

  const broadAmbiguousQueries = await sql<
    Array<{
      query_normalized: string;
      searches: number;
      avg_result_count: number;
      last_seen: string;
    }>
  >`
    SELECT
      query_normalized,
      COUNT(*)::int AS searches,
      ROUND(AVG(result_count))::int AS avg_result_count,
      MAX(created_at)::text AS last_seen
    FROM search_query_analytics
    WHERE created_at >= NOW() - (${windowDays} || ' days')::interval
      AND zero_result = FALSE
      AND low_signal = FALSE
      AND result_count >= 250
      AND firm_intent_term_count = 0
    GROUP BY query_normalized
    ORDER BY searches DESC, avg_result_count DESC
    LIMIT ${limit}
  `;

  const queryModeSummary = await sql<
    Array<{
      query_mode: string;
      total_queries: number;
      zero_result_queries: number;
      avg_result_count: number;
    }>
  >`
    SELECT
      query_mode,
      COUNT(*)::int AS total_queries,
      COUNT(*) FILTER (WHERE zero_result)::int AS zero_result_queries,
      ROUND(AVG(result_count))::int AS avg_result_count
    FROM search_query_analytics
    WHERE created_at >= NOW() - (${windowDays} || ' days')::interval
    GROUP BY query_mode
    ORDER BY total_queries DESC
  `;

  const shortFirmLookupQueries = await sql<
    Array<{
      query_normalized: string;
      searches: number;
      avg_result_count: number;
      corrected_searches: number;
      suppressed_fuzzy_searches: number;
      last_seen: string;
    }>
  >`
    SELECT
      query_normalized,
      COUNT(*)::int AS searches,
      ROUND(AVG(result_count))::int AS avg_result_count,
      COUNT(*) FILTER (WHERE correction_count > 0)::int AS corrected_searches,
      COUNT(*) FILTER (WHERE fuzzy_suppressed_by_firm_candidate)::int
        AS suppressed_fuzzy_searches,
      MAX(created_at)::text AS last_seen
    FROM search_query_analytics
    WHERE created_at >= NOW() - (${windowDays} || ' days')::interval
      AND short_query = TRUE
    GROUP BY query_normalized
    ORDER BY searches DESC, suppressed_fuzzy_searches DESC, avg_result_count DESC
    LIMIT ${limit}
  `;

  const report = {
    windowDays,
    summary: {
      totalQueries: summary?.total_queries ?? 0,
      zeroResultQueries: summary?.zero_result_queries ?? 0,
      lowSignalQueries: summary?.low_signal_queries ?? 0,
      correctedQueries: summary?.corrected_queries ?? 0,
      avgLatencyMs: summary?.avg_latency_ms ?? 0,
      p95LatencyMs: summary?.p95_latency_ms ?? 0,
    },
    daily,
    topZeroResultQueries,
    topLowSignalQueries,
    topCorrections,
    broadAmbiguousQueries,
    queryModeSummary,
    shortFirmLookupQueries,
  };

  console.log(JSON.stringify(report, null, 2));
  await sql.end();
}

void main().catch(async (error) => {
  console.error('❌ Search analytics report failed', error);
  await sql.end();
  process.exitCode = 1;
});
