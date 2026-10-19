import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import postgres, { type Sql } from "postgres";

const LOCAL_DATABASE = "ra_atlas_test";
const SOCKET_DIRECTORY = "/tmp";
const ROOT = process.cwd();
const MIGRATION_PATH = path.join(ROOT, "migrations/20261019_concurrent_fines_refresh.sql");
const SLOW_ROWS = 16;
const SLOW_ROW_DELAY_SECONDS = 0.08;

function makeSchemaName() {
  return `codex_cfr_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

function quoteIdentifier(value: string) {
  assert.match(value, /^codex_cfr_[a-z0-9_]+$/);
  return `"${value}"`;
}

function adaptedMigrationStatements(schema: string) {
  const migration = fs.readFileSync(MIGRATION_PATH, "utf8");
  const preflightStart = migration.indexOf("DO $$");
  const preflightEnd = migration.indexOf("\n$$;", preflightStart);
  const functionStart = migration.indexOf("CREATE OR REPLACE FUNCTION public.refresh_all_fines()");
  const functionEnd = migration.indexOf("\n$$;", functionStart);
  const commentStart = migration.indexOf("COMMENT ON FUNCTION public.refresh_all_fines() IS");
  const commentEnd = migration.indexOf(";\n\nCOMMIT;", commentStart);
  assert.ok(preflightStart >= 0 && preflightEnd > preflightStart, "migration preflight DO block not found");
  assert.ok(functionStart >= 0 && functionEnd > functionStart, "migration refresh function not found");
  assert.ok(commentStart >= 0 && commentEnd > commentStart, "migration function comment not found");

  return [
    migration.slice(preflightStart, preflightEnd + 4),
    migration.slice(functionStart, functionEnd + 4),
    migration.slice(commentStart, commentEnd + 1),
  ].map((statement) => statement.replaceAll("public.", `${schema}.`));
}

async function createSchema(sql: Sql, ownedSchemas: string[]) {
  const schema = makeSchemaName();
  const exists = await sql.unsafe<{ exists: boolean }[]>(
    "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS exists",
    [schema],
  );
  assert.equal(exists[0]?.exists, false, "generated fixture schema unexpectedly exists; refusing to touch it");
  await sql.unsafe(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
  ownedSchemas.push(schema);
  return schema;
}

async function createFixture(sql: Sql, schema: string, indexMode: "full" | "missing" | "partial", slow: boolean) {
  const s = quoteIdentifier(schema);
  await sql.unsafe(`CREATE TABLE ${s}.source_rows (id integer PRIMARY KEY, value integer NOT NULL)`);
  if (slow) {
    await sql.unsafe(`
      CREATE FUNCTION ${s}.slow_value(input integer) RETURNS integer
      LANGUAGE plpgsql VOLATILE AS $$
      BEGIN
        PERFORM pg_sleep(${SLOW_ROW_DELAY_SECONDS});
        RETURN input;
      END;
      $$
    `);
  }
  await sql.unsafe(
    `INSERT INTO ${s}.source_rows (id, value) SELECT row_number, 1 FROM generate_series(1, ${slow ? SLOW_ROWS : 1}) AS row_number`,
  );
  const valueExpression = slow ? `${s}.slow_value(value)` : "value";
  const canonicalExpression = slow ? `${s}.slow_value(value * 10)` : "value * 10";
  await sql.unsafe(`CREATE MATERIALIZED VIEW ${s}.all_regulatory_fines AS SELECT id, ${valueExpression} AS value FROM ${s}.source_rows`);
  await sql.unsafe(`CREATE UNIQUE INDEX all_regulatory_fines_full_unique_id ON ${s}.all_regulatory_fines (id)`);
  await sql.unsafe(`CREATE MATERIALIZED VIEW ${s}.all_regulatory_fines_canonical AS SELECT id, ${canonicalExpression} AS value FROM ${s}.source_rows`);
  if (indexMode === "full") {
    await sql.unsafe(`CREATE UNIQUE INDEX all_regulatory_fines_canonical_full_unique_id ON ${s}.all_regulatory_fines_canonical (id)`);
  } else if (indexMode === "partial") {
    await sql.unsafe(`CREATE UNIQUE INDEX all_regulatory_fines_canonical_partial_unique_id ON ${s}.all_regulatory_fines_canonical (id) WHERE id > 0`);
  }
}

async function applyAdaptedMigration(sql: Sql, schema: string) {
  const statements = adaptedMigrationStatements(schema);
  await sql.begin(async (tx) => {
    for (const statement of statements) await tx.unsafe(statement);
  });
}

async function snapshots(sql: Pick<Sql, "unsafe">, schema: string) {
  const s = quoteIdentifier(schema);
  const rows = await sql.unsafe<Array<{
    legacy_count: number;
    legacy_max: number;
    canonical_count: number;
    canonical_max: number;
  }>>(`
    SELECT
      (SELECT count(*)::int FROM ${s}.all_regulatory_fines) AS legacy_count,
      (SELECT max(value)::int FROM ${s}.all_regulatory_fines) AS legacy_max,
      (SELECT count(*)::int FROM ${s}.all_regulatory_fines_canonical) AS canonical_count,
      (SELECT max(value)::int FROM ${s}.all_regulatory_fines_canonical) AS canonical_max
  `);
  return rows[0];
}

async function waitForRefresh(sql: Pick<Sql, "unsafe">, schema: string) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const rows = await sql.unsafe<Array<{ active: number }>>(
      `SELECT count(*)::int AS active FROM pg_stat_activity WHERE datname = current_database() AND state = 'active' AND pid <> pg_backend_pid() AND query LIKE '%' || $1 || '%refresh_all_fines%'`,
      [schema],
    );
    if ((rows[0]?.active ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Concurrent refresh for ${schema} did not appear in local pg_stat_activity within three seconds`);
}

async function assertInvalidIndexRejected(sql: Sql, ownedSchemas: string[], mode: "missing" | "partial") {
  const schema = await createSchema(sql, ownedSchemas);
  await createFixture(sql, schema, mode, false);
  await assert.rejects(
    applyAdaptedMigration(sql, schema),
    new RegExp(`${schema}\\.all_regulatory_fines_canonical lacks a valid full unique index`),
  );
}

async function verify() {
  assert.equal(process.argv.length, 2, "this verification harness accepts no command-line arguments");
  const sql = postgres({
    host: SOCKET_DIRECTORY,
    port: 5432,
    database: LOCAL_DATABASE,
    username: os.userInfo().username,
    ssl: false,
    max: 4,
    connect_timeout: 5,
    idle_timeout: 10,
  });
  const ownedSchemas: string[] = [];
  let reader: Awaited<ReturnType<typeof sql.reserve>> | null = null;
  let inFlightRefresh: Promise<unknown> | null = null;
  let result: Record<string, unknown> | null = null;

  try {
    const location = await sql.unsafe<Array<{ database_name: string; server_address: string | null }>>(
      "SELECT current_database() AS database_name, inet_server_addr()::text AS server_address",
    );
    assert.equal(location[0]?.database_name, LOCAL_DATABASE, "refusing to run outside the fixed local fixture database");
    assert.equal(location[0]?.server_address, null, "refusing a TCP connection; local Unix socket is required");

    const mainSchema = await createSchema(sql, ownedSchemas);
    await createFixture(sql, mainSchema, "full", true);
    await applyAdaptedMigration(sql, mainSchema);

    const s = quoteIdentifier(mainSchema);
    await sql.unsafe(`UPDATE ${s}.source_rows SET value = 2`);
    await sql.unsafe(`SELECT ${s}.refresh_all_fines()`);
    const standalone = await snapshots(sql, mainSchema);
    assert.deepEqual(standalone, { legacy_count: SLOW_ROWS, legacy_max: 2, canonical_count: SLOW_ROWS, canonical_max: 20 });

    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(`UPDATE ${s}.source_rows SET value = 3`);
        await tx.unsafe(`SELECT ${s}.refresh_all_fines()`);
        const inside = await snapshots(tx, mainSchema);
        assert.deepEqual(inside, { legacy_count: SLOW_ROWS, legacy_max: 3, canonical_count: SLOW_ROWS, canonical_max: 30 });
        throw new Error("intentional harness rollback");
      });
      assert.fail("explicit transaction unexpectedly committed instead of rolling back");
    } catch (error) {
      assert.match(String(error), /intentional harness rollback/);
    }
    const afterRollback = await snapshots(sql, mainSchema);
    assert.deepEqual(afterRollback, { legacy_count: SLOW_ROWS, legacy_max: 2, canonical_count: SLOW_ROWS, canonical_max: 20 });
    const sourceAfterRollback = await sql.unsafe<Array<{ max_value: number }>>(`SELECT max(value)::int AS max_value FROM ${s}.source_rows`);
    assert.equal(sourceAfterRollback[0]?.max_value, 2);

    await sql.unsafe(`UPDATE ${s}.source_rows SET value = 4`);
    reader = await sql.reserve();
    await reader.unsafe("SET statement_timeout = '1500ms'");
    const refreshStarted = performance.now();
    let refreshSettled = false;
    // Attaching .then() dispatches the postgres.js query immediately; merely
    // retaining its lazy query object would not start the refresh yet.
    inFlightRefresh = sql.unsafe(`SELECT ${s}.refresh_all_fines()`).then((value) => {
      refreshSettled = true;
      return value;
    }, (error) => {
      refreshSettled = true;
      throw error;
    });
    await waitForRefresh(reader, mainSchema);
    assert.equal(refreshSettled, false, "refresh completed before the overlap check");
    const readerStarted = performance.now();
    const duringRefresh = await snapshots(reader, mainSchema);
    const readerLatencyMs = Math.round(performance.now() - readerStarted);
    assert.equal(refreshSettled, false, "refresh completed before the independent reader finished");
    await inFlightRefresh;
    const refreshDurationMs = Math.round(performance.now() - refreshStarted);
    inFlightRefresh = null;
    assert.deepEqual(duringRefresh, { legacy_count: SLOW_ROWS, legacy_max: 2, canonical_count: SLOW_ROWS, canonical_max: 20 });
    assert.ok(readerLatencyMs < 1_000, `public-reader analogue took ${readerLatencyMs}ms during concurrent refresh`);
    assert.ok(refreshDurationMs > 1_500, `fixture refresh completed too quickly (${refreshDurationMs}ms) to prove overlap`);
    const afterConcurrent = await snapshots(sql, mainSchema);
    assert.deepEqual(afterConcurrent, { legacy_count: SLOW_ROWS, legacy_max: 4, canonical_count: SLOW_ROWS, canonical_max: 40 });

    await assertInvalidIndexRejected(sql, ownedSchemas, "missing");
    await assertInvalidIndexRejected(sql, ownedSchemas, "partial");

    result = {
      status: "passed",
      database: LOCAL_DATABASE,
      connection: "local Unix socket only",
      standaloneAndTransactionRollback: "passed; both materialized-view snapshots remained atomic",
      concurrentReaderLatencyMs: readerLatencyMs,
      slowRefreshDurationMs: refreshDurationMs,
      missingAndPartialUniqueIndexPreflight: "both rejected",
      fixtureSchemasCleaned: ownedSchemas.length,
    };
  } finally {
    if (inFlightRefresh) await inFlightRefresh.catch(() => undefined);
    reader?.release();
    for (const schema of ownedSchemas.reverse()) {
      await sql.unsafe(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`).catch((error) => {
        console.error(`Failed to clean up task-owned fixture schema ${schema}: ${String(error)}`);
        throw error;
      });
    }
    await sql.end({ timeout: 5 });
  }
  console.log(JSON.stringify(result, null, 2));
}

verify().catch((error) => {
  console.error(`Concurrent fines refresh verification failed: ${String(error)}`);
  process.exitCode = 1;
});
