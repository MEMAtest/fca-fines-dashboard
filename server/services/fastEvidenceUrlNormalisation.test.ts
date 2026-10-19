import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(process.cwd(), "migrations/20261019_fast_evidence_url_normalisation.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const functionStart = migration.indexOf("CREATE OR REPLACE FUNCTION public.normalise_regulatory_evidence_url(value text)");
const functionEnd = migration.indexOf("\n$$;", functionStart);
const functionDefinition = migration.slice(functionStart, functionEnd + 4);

describe("fast FSS-preserving evidence URL normalizer", () => {
  it("uses a scalar SQL SELECT so PostgreSQL can inline the generic path", () => {
    expect(functionDefinition).toContain("LANGUAGE sql");
    expect(functionDefinition).toContain("IMMUTABLE");
    expect(functionDefinition).toContain("PARALLEL SAFE");
    expect(functionDefinition).toMatch(/AS \$\$\s*SELECT\s+lower\(regexp_replace\(/);
    expect(functionDefinition).not.toMatch(/\bWITH\b|\bFROM\b/);
  });

  it("only parses FSS query parameters after matching the official endpoint", () => {
    const pdfEndpoint = functionDefinition.indexOf("fss\\.hpdownload");
    const detailsEndpoint = functionDefinition.indexOf("openInfo/view");
    const firstParameterParse = functionDefinition.indexOf("regexp_match(");
    expect(pdfEndpoint).toBeGreaterThan(-1);
    expect(detailsEndpoint).toBeGreaterThan(pdfEndpoint);
    expect(firstParameterParse).toBeGreaterThan(pdfEndpoint);
    expect(functionDefinition).toContain("file=([^&]+)");
    expect(functionDefinition).toContain("path=([^&]+)");
    expect(functionDefinition).toContain("menuNo=([^&]+)");
    expect(functionDefinition).toContain("examMgmtNo=([^&]+)");
    expect(functionDefinition).toContain("emOpenSeq=([^&]+)");
    expect(functionDefinition).toContain("ELSE regexp_replace(trim(COALESCE(value, '')), '[?#].*$', '')");
  });

  it("keeps migration identity and rollback-safe data scope explicit", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.normalise_regulatory_evidence_url");
    expect(migration).toContain("FSS sanction PDF evidence URLs still collide");
    expect(migration).toContain("FSS sanction detail URLs still collide");
    expect(migration).toContain("generic query stripping");
    expect(migration).not.toMatch(/INSERT\s+INTO|UPDATE\s+public\.|REFRESH\s+MATERIALIZED/i);
  });

  it("pins the parity/performance proof to the bounded existing artifacts and local socket", () => {
    const harness = fs.readFileSync(path.resolve(process.cwd(), "scripts/verifyFastEvidenceUrlNormalisation.ts"), "utf8");
    expect(harness).toContain('const LOCAL_DATABASE = "ra_atlas_test"');
    expect(harness).toContain('const SOCKET_DIRECTORY = "/tmp"');
    expect(harness).toContain('const EXPECTED_READONLY_HOST = "89.167.95.173"');
    expect(harness).toContain('const EXPECTED_READONLY_DATABASE = "fcafines"');
    expect(harness).toContain("SET TRANSACTION READ ONLY");
    expect(harness).toContain("MAX_PRODUCTION_URLS = 200_000");
    expect(harness).toContain("MAX_URL_BYTES = 25 * 1024 * 1024");
    expect(harness).toContain("this proof harness accepts no command-line arguments");
    expect(harness).toContain("fss-source-preview-6392d26.json");
    expect(harness).toContain("fss-pre-repair.json");
    expect(harness).toContain("BENCHMARK_ROWS = 90_000");
    expect(harness).toContain("intentional local proof transaction rollback");
    expect(harness).toContain("noUrlsLogged: true");
  });
});
