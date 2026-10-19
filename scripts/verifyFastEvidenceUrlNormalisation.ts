import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import dotenv from "dotenv";

const LOCAL_DATABASE = "ra_atlas_test";
const SOCKET_DIRECTORY = "/tmp";
const EXPECTED_READONLY_HOST = "89.167.95.173";
const EXPECTED_READONLY_DATABASE = "fcafines";
const DEFAULT_ENV_PATH = "/Users/omosanya_main/Documents/fca-fines-dashboard/.env";
const FSS_PREVIEW = "/Users/omosanya_main/storage-audit/regactions-20261019/fss-source-preview-6392d26.json";
const LEGACY_SNAPSHOT = "/Users/omosanya_main/storage-audit/regactions-20261019/fss-pre-repair.json";
const OLD_MIGRATION = path.resolve("migrations/20261017_fss_evidence_url_identity.sql");
const FAST_MIGRATION = path.resolve("migrations/20261019_fast_evidence_url_normalisation.sql");
const MAX_PRODUCTION_URLS = 200_000;
const MAX_URL_BYTES = 25 * 1024 * 1024;
const BENCHMARK_ROWS = 90_000;
const BENCHMARK_REPEATS = 3;

type NormalizerInput = string | null;

function schemaName() {
  return `codex_evunorm_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

function quoteIdentifier(value: string) {
  assert.match(value, /^codex_evunorm_[a-z0-9_]+$/);
  return `"${value}"`;
}

function extractNormalizerDdl(migrationPath: string, schema: string, functionName = "normalise_regulatory_evidence_url") {
  const migration = fs.readFileSync(migrationPath, "utf8");
  const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.normalise_regulatory_evidence_url(value text)");
  const end = migration.indexOf("\n$$;", start);
  assert.ok(start >= 0 && end > start, `normalizer function not found in ${migrationPath}`);
  return migration.slice(start, end + 4)
    .replaceAll("public.", `${schema}.`)
    .replace(`${schema}.normalise_regulatory_evidence_url(value text)`, `${schema}.${functionName}(value text)`);
}

function readArtifactUrls(): NormalizerInput[] {
  const fss = JSON.parse(fs.readFileSync(FSS_PREVIEW, "utf8")) as {
    records?: Array<{ sourceUrl?: unknown; finalNoticeUrl?: unknown }>;
    pdfQuarantine?: Array<{ pdfUrl?: unknown }>;
  };
  const legacy = JSON.parse(fs.readFileSync(LEGACY_SNAPSHOT, "utf8")) as {
    sourceRows?: Array<{ source_url?: unknown; final_notice_url?: unknown }>;
  };
  assert.equal(fss.records?.length, 279, "expected the full existing 279-record FSS preview artifact");
  assert.equal(legacy.sourceRows?.length, 40, "expected the existing 40-row legacy canonical snapshot");
  const urls: NormalizerInput[] = [];
  for (const record of fss.records ?? []) urls.push(record.sourceUrl as string | null, record.finalNoticeUrl as string | null);
  for (const record of fss.pdfQuarantine ?? []) urls.push(record.pdfUrl as string | null);
  for (const record of legacy.sourceRows ?? []) urls.push(record.source_url as string | null, record.final_notice_url as string | null);
  return urls;
}

function syntheticInputs(): NormalizerInput[] {
  return [
    null,
    "",
    "   ",
    "https://example.org/action?id=1",
    "https://example.org/action?id=2#fragment",
    "HTTPS://WWW.FSS.OR.KR/fss.hpdownload?path=/dtm/opn/&file=202400579_01_%ED%95%98%EB%82%98.pdf",
    "https://www.fss.or.kr/fss.hpdownload?file=case.pdf&path=%2Fdtm%2Fopn%2F&cacheBust=one",
    "https://www.fss.or.kr/fss.hpdownload?file=case.pdf&path=%2Fdtm%2Fopn%2F&file=duplicate.pdf",
    "https://www.fss.or.kr/fss.hpdownload?FILE=case.pdf&PATH=%2Fdtm%2Fopn%2F",
    "https://www.fss.or.kr/fss/job/openInfo/view.do?menuNo=200476&examMgmtNo=202400579&emOpenSeq=1",
    "https://www.fss.or.kr/fss/job/openInfo/view.do?pageIndex=3&edate=2026-10-17&emOpenSeq=1&examMgmtNo=202400579&menuNo=200476",
    "https://www.fss.or.kr/fss/job/openInfo/view.do?menuNo=200476&examMgmtNo=202400579",
    "https://example.org/path/?id=2#fragment",
  ];
}

function assertReadonlyTarget(connectionString: string) {
  const target = new URL(connectionString);
  assert.equal(target.hostname.toLowerCase(), EXPECTED_READONLY_HOST, "refusing unexpected read-only source host");
  assert.equal(decodeURIComponent(target.pathname.replace(/^\//, "")), EXPECTED_READONLY_DATABASE, "refusing unexpected read-only source database");
}

function makePostgres(connectionString: string) {
  return postgres(connectionString, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 10,
    ssl: connectionString.includes("sslmode=") ? { rejectUnauthorized: false } : false,
  });
}

async function readProductionCanonicalUrls() {
  dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || DEFAULT_ENV_PATH });
  const connectionString = process.env.REGACTIONS_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  assert.ok(connectionString, "read-only database connection is unavailable");
  assertReadonlyTarget(connectionString);
  const sql = makePostgres(connectionString);
  try {
    return await sql.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION READ ONLY");
      await tx.unsafe("SET LOCAL statement_timeout = '60s'");
      const sizeRows = await tx.unsafe<Array<{ url_count: number; url_bytes: number }>>(`
        WITH canonical_urls AS (
          SELECT source_url AS url FROM public.all_regulatory_fines_canonical
          UNION ALL
          SELECT notice_url AS url FROM public.all_regulatory_fines_canonical
        ), distinct_urls AS (
          SELECT DISTINCT url FROM canonical_urls WHERE url IS NOT NULL
        )
        SELECT count(*)::int AS url_count,
          COALESCE(sum(octet_length(url)), 0)::bigint AS url_bytes
        FROM distinct_urls
      `);
      const urlCount = Number(sizeRows[0]?.url_count ?? 0);
      const urlBytes = Number(sizeRows[0]?.url_bytes ?? 0);
      assert.ok(urlCount > 0, "canonical source and notice URL set is empty");
      assert.ok(urlCount <= MAX_PRODUCTION_URLS, `canonical URL set exceeds ${MAX_PRODUCTION_URLS} row bound`);
      assert.ok(urlBytes <= MAX_URL_BYTES, `canonical URL set exceeds ${MAX_URL_BYTES} byte bound`);
      const urlRows = await tx.unsafe<Array<{ url: string }>>(`
        WITH canonical_urls AS (
          SELECT source_url AS url FROM public.all_regulatory_fines_canonical
          UNION ALL
          SELECT notice_url AS url FROM public.all_regulatory_fines_canonical
        )
        SELECT DISTINCT url FROM canonical_urls WHERE url IS NOT NULL ORDER BY url
      `);
      assert.equal(urlRows.length, urlCount);
      return { urls: urlRows.map(({ url }) => url), urlCount, urlBytes };
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function loadUrls(tx: postgres.TransactionSql, records: NormalizerInput[]) {
  await tx.unsafe("CREATE TEMP TABLE source_urls (ordinal integer, raw_url text) ON COMMIT DROP");
  const json = tx.json(records.map((url) => ({ url })));
  await tx.unsafe(`
    INSERT INTO source_urls (ordinal, raw_url)
    SELECT ordinality::int, item->>'url'
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS entries(item, ordinality)
  `, [json]);
}

async function explainMedian(tx: postgres.TransactionSql, fn: string) {
  const times: number[] = [];
  let finalPlanText = "";
  for (let i = 0; i < BENCHMARK_REPEATS; i += 1) {
    const rows = await tx.unsafe<Array<{ "QUERY PLAN": Array<Record<string, unknown>> }>>(
      `EXPLAIN (ANALYZE, TIMING OFF, VERBOSE, FORMAT JSON)
       SELECT sum(length(${fn}(url)))
       FROM (SELECT 'https://example.org/action?id=' || n::text AS url
             FROM generate_series(1, ${BENCHMARK_ROWS}) AS n) AS generated_urls`,
    );
    const plan = rows[0]?.["QUERY PLAN"]?.[0];
    assert.ok(plan, "EXPLAIN ANALYZE returned no plan");
    times.push(Number(plan["Execution Time"]));
    finalPlanText = JSON.stringify(plan);
  }
  times.sort((a, b) => a - b);
  return { medianMs: times[Math.floor(times.length / 2)], timesMs: times, planText: finalPlanText };
}

async function verify() {
  assert.equal(process.argv.length, 2, "this proof harness accepts no command-line arguments");
  const production = await readProductionCanonicalUrls();
  const allInputs = [...new Set<NormalizerInput>([
    ...production.urls,
    ...readArtifactUrls(),
    ...syntheticInputs(),
  ])];
  const totalBytes = allInputs.reduce((total, url) => total + Buffer.byteLength(url ?? "", "utf8"), 0);
  assert.ok(allInputs.length <= MAX_PRODUCTION_URLS + 1_000, "combined bounded URL input exceeded row limit");
  assert.ok(totalBytes <= MAX_URL_BYTES + 1_000_000, "combined bounded URL input exceeded memory limit");

  const localSql = postgres({
    host: SOCKET_DIRECTORY,
    port: 5432,
    database: LOCAL_DATABASE,
    username: os.userInfo().username,
    ssl: false,
    max: 1,
    connect_timeout: 5,
    idle_timeout: 10,
  });
  const schema = schemaName();
  const s = quoteIdentifier(schema);
  const oldFunction = `${s}.normalise_regulatory_evidence_url`;
  const fastFunction = `${s}.fast_normalise_regulatory_evidence_url`;
  let output: Record<string, unknown> | null = null;

  try {
    await localSql.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION READ WRITE");
      await tx.unsafe("SET LOCAL jit = off");
      await tx.unsafe("SET LOCAL statement_timeout = '30s'");
      const location = await tx.unsafe<Array<{ database_name: string; server_address: string | null }>>(
        "SELECT current_database() AS database_name, inet_server_addr()::text AS server_address",
      );
      assert.equal(location[0]?.database_name, LOCAL_DATABASE, "refusing to run outside the fixed local benchmark database");
      assert.equal(location[0]?.server_address, null, "refusing a TCP connection; local Unix socket is required");

      await tx.unsafe(`CREATE SCHEMA ${s}`);
      await tx.unsafe(extractNormalizerDdl(OLD_MIGRATION, s));
      await tx.unsafe(extractNormalizerDdl(FAST_MIGRATION, s, "fast_normalise_regulatory_evidence_url"));
      await loadUrls(tx, allInputs);

      const comparison = await tx.unsafe<Array<{
        url_count: number;
        mismatch_count: number;
        old_output_hash: string;
        candidate_output_hash: string;
      }>>(`
        WITH normalized AS (
          SELECT ordinal,
            ${oldFunction}(raw_url) AS old_value,
            ${fastFunction}(raw_url) AS candidate_value
          FROM source_urls
        ), fingerprints AS (
          SELECT ordinal, old_value, candidate_value,
            md5(ordinal::text || chr(31) || COALESCE(old_value, '<NULL>')) AS old_fingerprint,
            md5(ordinal::text || chr(31) || COALESCE(candidate_value, '<NULL>')) AS candidate_fingerprint
          FROM normalized
        )
        SELECT count(*)::int AS url_count,
          count(*) FILTER (WHERE old_value IS DISTINCT FROM candidate_value)::int AS mismatch_count,
          md5(string_agg(old_fingerprint, '' ORDER BY ordinal)) AS old_output_hash,
          md5(string_agg(candidate_fingerprint, '' ORDER BY ordinal)) AS candidate_output_hash
        FROM fingerprints
      `);
      assert.equal(Number(comparison[0]?.url_count), allInputs.length);
      assert.equal(Number(comparison[0]?.mismatch_count), 0, "normalization candidate differs from current FSS-preserving implementation");
      assert.equal(comparison[0]?.old_output_hash, comparison[0]?.candidate_output_hash, "ordered normalizer output hashes differ");

      const oldPlan = await explainMedian(tx, oldFunction);
      const fastPlan = await explainMedian(tx, fastFunction);
      assert.match(oldPlan.planText, /normalise_regulatory_evidence_url/);
      assert.doesNotMatch(fastPlan.planText, /fast_normalise_regulatory_evidence_url/);
      assert.match(fastPlan.planText, /regexp_replace/);

      output = {
        status: "passed",
        productionReadOnlySource: `${EXPECTED_READONLY_HOST}/${EXPECTED_READONLY_DATABASE}`,
        productionCanonicalDistinctUrls: production.urlCount,
        productionCanonicalUrlBytes: production.urlBytes,
        fssPreviewRecords: 279,
        fssPdfReviewLinksIncluded: (JSON.parse(fs.readFileSync(FSS_PREVIEW, "utf8")) as { pdfQuarantine?: unknown[] }).pdfQuarantine?.length ?? 0,
        legacyCanonicalSnapshotRecords: 40,
        syntheticEdgeCases: syntheticInputs().length,
        totalComparedInputs: allInputs.length,
        mismatchCount: Number(comparison[0]?.mismatch_count),
        oldOutputAggregateMd5: comparison[0]?.old_output_hash,
        candidateOutputAggregateMd5: comparison[0]?.candidate_output_hash,
        localInlinePlanBenchmark: {
          generatedGenericUrls: BENCHMARK_ROWS,
          jit: "off",
          repetitions: BENCHMARK_REPEATS,
          oldFunctionMedianMs: oldPlan.medianMs,
          candidateMedianMs: fastPlan.medianMs,
          oldTimingsMs: oldPlan.timesMs,
          candidateTimingsMs: fastPlan.timesMs,
          candidateFunctionInlined: true,
        },
        noUrlsLogged: true,
      };

      throw new Error("intentional local proof transaction rollback");
    }).catch((error) => {
      assert.match(String(error), /intentional local proof transaction rollback/);
    });
  } finally {
    await localSql.end({ timeout: 5 });
  }
  assert.ok(output, "proof transaction did not complete");
  console.log(JSON.stringify(output, null, 2));
}

verify().catch((error) => {
  console.error(`Fast evidence URL normalization proof failed: ${String(error)}`);
  process.exitCode = 1;
});
