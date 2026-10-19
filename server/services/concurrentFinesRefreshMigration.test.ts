import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(process.cwd(), "migrations/20261019_concurrent_fines_refresh.sql");

describe("concurrent unified fines refresh migration", () => {
  const migration = fs.readFileSync(migrationPath, "utf8");

  it("fails closed unless both populated materialized views have full valid unique indexes", () => {
    expect(migration).toContain("'public.all_regulatory_fines'");
    expect(migration).toContain("'public.all_regulatory_fines_canonical'");
    expect(migration).toContain("matview.relkind = 'm'");
    expect(migration).toContain("matview.relispopulated");
    expect(migration).toMatch(/index_info\.indisunique[\s\S]*index_info\.indisvalid[\s\S]*index_info\.indisready[\s\S]*index_info\.indpred IS NULL[\s\S]*index_info\.indexprs IS NULL/);
    expect(migration.indexOf("Cannot enable concurrent refresh")).toBeLessThan(migration.indexOf("CREATE OR REPLACE FUNCTION public.refresh_all_fines"));
  });

  it("refreshes source and canonical snapshots concurrently within one function call", () => {
    const functionDefinition = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.refresh_all_fines"));
    expect(functionDefinition.match(/REFRESH MATERIALIZED VIEW CONCURRENTLY/g)).toHaveLength(2);
    expect(functionDefinition).toContain("REFRESH MATERIALIZED VIEW CONCURRENTLY public.all_regulatory_fines;");
    expect(functionDefinition).toContain("REFRESH MATERIALIZED VIEW CONCURRENTLY public.all_regulatory_fines_canonical;");
    expect(migration).toContain("Both refreshes intentionally remain in this single function statement");
  });

  it("retains the previous blocking function body as a rollback backup", () => {
    expect(migration).toContain("Rollback backup: restore the previous blocking refresh implementation");
    expect(migration).toContain("--   REFRESH MATERIALIZED VIEW public.all_regulatory_fines;");
    expect(migration).toContain("--   REFRESH MATERIALIZED VIEW public.all_regulatory_fines_canonical;");
  });

  it("keeps the reproducible PostgreSQL proof pinned to a local socket and cleans up its own schemas", () => {
    const harness = fs.readFileSync(path.resolve(process.cwd(), "scripts/verifyConcurrentFinesRefresh.ts"), "utf8");
    expect(harness).toContain('const LOCAL_DATABASE = "ra_atlas_test"');
    expect(harness).toContain('const SOCKET_DIRECTORY = "/tmp"');
    expect(harness).toContain("assert.equal(location[0]?.server_address, null");
    expect(harness).toContain("this verification harness accepts no command-line arguments");
    expect(harness).toContain("CREATE SCHEMA ${quoteIdentifier(schema)}");
    expect(harness).toContain("DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE");
    expect(harness).toContain("statement_timeout = '1500ms'");
    expect(harness).toContain('"missing"');
    expect(harness).toContain('"partial"');
    expect(harness).not.toContain("DATABASE_URL");
  });
});
