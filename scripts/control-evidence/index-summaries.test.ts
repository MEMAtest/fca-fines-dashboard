import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { CONTROL_TAXONOMY_VERSION } from "../../src/data/controlTaxonomy.js";
import { CONTROL_DISCOVERY_REGULATOR_CODES } from "../../src/data/controlDiscoveryScope.js";
import {
  DEFAULT_SUMMARY_INDEX_PAGE_SIZE,
  FETCH_UNINDEXED_SUMMARY_PAGE_SQL,
  MAX_SUMMARY_INDEX_PAGE_SIZE,
  SUMMARY_INDEX_LOCK_TIMEOUT,
  SUMMARY_INDEX_STATEMENT_TIMEOUT,
  PRUNE_STALE_SUMMARY_MATCHES_SQL,
  buildSourceFieldFingerprints,
  classifyStoredSummary,
  parseSummaryIndexArgs,
  summaryClassificationsJsonbParameter,
  type StoredSummaryRecord,
} from "./index-summaries.js";

const baseRecord: StoredSummaryRecord = {
  public_case_id: "public-case-1",
  firm_individual: "North Star Financial Group",
  summary: null,
  breach_type: null,
  breach_categories: null,
};

describe("stored-summary control classification", () => {
  it("classifies all explicit current fields without claiming official-source verification", () => {
    const results = classifyStoredSummary({
      ...baseRecord,
      summary: "North Star Financial Group failed to submit currency transaction reports and suspicious transaction reports.",
    });
    expect(results.map(({ control_code }) => control_code)).toEqual(["AML_CASH_CONTROLS", "SAR_STR_REPORTING"]);
    expect(results.every(({ taxonomy_version, classification_basis }) => taxonomy_version === CONTROL_TAXONOMY_VERSION && classification_basis === "stored_summary")).toBe(true);
    expect(results[0].matched_passages[0].passage).not.toContain("North Star Financial Group");
    expect(results[0].match_terms).toContain("currency transaction reports");
  });

  it("preserves the exact raw JSONB categories in the source-field fingerprint", () => {
    const rawCategories = JSON.stringify(JSON.stringify(["AML", "CASS"]));
    const record = { ...baseRecord, breach_categories: rawCategories };
    expect(buildSourceFieldFingerprints(record)).toEqual({
      firm_individual: baseRecord.firm_individual,
      summary: null,
      breach_type: null,
      breach_categories: rawCategories,
    });
    expect(classifyStoredSummary(record).map(({ control_code }) => control_code)).toEqual(["__NO_MATCH__"]);
  });

  it("binds the upsert batch as a postgres.js JSONB value rather than a JSON string scalar", async () => {
    const client = postgres("postgres://unused:unused@127.0.0.1:1/unused", { max: 1, connect_timeout: 1 });
    try {
      const entries = classifyStoredSummary({
        ...baseRecord,
        summary: "The firm failed to submit currency transaction reports.",
      });
      const parameter = summaryClassificationsJsonbParameter(client, entries);

      // postgres.js' json() helper binds OID 3802 and serializes the original
      // array as JSON. JSON.stringify(entries) passed as a plain string instead
      // binds a JSON string scalar, which jsonb_to_recordset rejects.
      expect(parameter.type).toBe(3802);
      expect(parameter.value).toEqual(entries);
      expect(Array.isArray(parameter.value)).toBe(true);
    } finally {
      await client.end({ timeout: 0 });
    }
  });

  it("does not classify negated cash findings, entity-name lookalikes, or generic duties", () => {
    expect(classifyStoredSummary({ ...baseRecord, summary: "No deficiencies in cash handling; the firm must maintain transaction monitoring." }).map(({ control_code }) => control_code)).toEqual(["__NO_MATCH__"]);
    expect(classifyStoredSummary({ ...baseRecord, firm_individual: "Cashflow Group", summary: "Cashflow Group failed to maintain controls." }).map(({ control_code }) => control_code)).toEqual(["__NO_MATCH__"]);
  });
});

describe("operator-safe summary index arguments", () => {
  it("selects one deterministic current row per public case before checking its indexed fingerprint", () => {
    const duplicateVariants = [
      { public_case_id: "same-id", created_at: "2026-01-01", id: "older", summary: "older summary" },
      { public_case_id: "same-id", created_at: "2026-02-01", id: "newer", summary: "canonical summary" },
    ];
    const canonical = [...duplicateVariants].sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))[0];
    const indexedCanonicalFingerprints = new Set([canonical.summary]);

    const canonicalCte = FETCH_UNINDEXED_SUMMARY_PAGE_SQL.trimStart().indexOf("WITH canonical_cases AS");
    const distinct = FETCH_UNINDEXED_SUMMARY_PAGE_SQL.indexOf("DISTINCT ON (source_case.public_case_id)");
    const sourceOrdering = FETCH_UNINDEXED_SUMMARY_PAGE_SQL.indexOf("source_case.created_at DESC NULLS LAST");
    const sourceKeyset = FETCH_UNINDEXED_SUMMARY_PAGE_SQL.indexOf("source_case.public_case_id > $1");
    const outerCanonicalRead = FETCH_UNINDEXED_SUMMARY_PAGE_SQL.indexOf("FROM canonical_cases AS current_case");
    const fingerprintGuard = FETCH_UNINDEXED_SUMMARY_PAGE_SQL.indexOf("AND NOT EXISTS (");
    const keysetFilter = FETCH_UNINDEXED_SUMMARY_PAGE_SQL.indexOf("current_case.public_case_id > $1");
    const limit = FETCH_UNINDEXED_SUMMARY_PAGE_SQL.indexOf("LIMIT $3");

    expect(canonicalCte).toBe(0);
    expect(distinct).toBeGreaterThan(canonicalCte);
    expect(sourceOrdering).toBeGreaterThan(distinct);
    expect(sourceKeyset).toBeGreaterThan(distinct);
    expect(sourceKeyset).toBeLessThan(sourceOrdering);
    expect(outerCanonicalRead).toBeGreaterThan(sourceOrdering);
    expect(fingerprintGuard).toBeGreaterThan(outerCanonicalRead);
    expect(keysetFilter).toBeGreaterThan(outerCanonicalRead);
    expect(limit).toBeGreaterThan(fingerprintGuard);
    expect(FETCH_UNINDEXED_SUMMARY_PAGE_SQL).toContain("source_case.id::text DESC");
    expect(canonical.summary).toBe("canonical summary");
    // The same canonical fingerprint is present on the next scan, so the
    // outer NOT EXISTS guard excludes it and the indexer has no row to upsert.
    expect(indexedCanonicalFingerprints.has(canonical.summary)).toBe(true);
    expect(FETCH_UNINDEXED_SUMMARY_PAGE_SQL).toContain("indexed.source_field_fingerprints = jsonb_build_object(");
  });

  it("defaults to read-only dry-run and a bounded page size", () => {
    expect(parseSummaryIndexArgs([])).toEqual({
      apply: false,
      pruneStale: false,
      pageSize: DEFAULT_SUMMARY_INDEX_PAGE_SIZE,
      outputPath: null,
    });
    expect(parseSummaryIndexArgs(["--dry-run", "--page-size=300"]).pageSize).toBe(300);
  });

  it("sets bounded per-statement and lock timeouts for the index transaction", () => {
    expect(SUMMARY_INDEX_STATEMENT_TIMEOUT).toBe("120s");
    expect(SUMMARY_INDEX_LOCK_TIMEOUT).toBe("10s");
  });

  it("requires explicit apply for writes and a separate flag to prune stale rows", () => {
    expect(parseSummaryIndexArgs(["--apply"]).apply).toBe(true);
    expect(() => parseSummaryIndexArgs(["--apply", "--dry-run"])).toThrow(/mutually exclusive/);
    expect(() => parseSummaryIndexArgs(["--prune-stale"])).toThrow(/requires explicit --apply/);
    expect(parseSummaryIndexArgs(["--apply", "--prune-stale"]).pruneStale).toBe(true);
  });

  it("bounds page sizes and only prunes the classification table", () => {
    expect(() => parseSummaryIndexArgs(["--page-size", "0"])).toThrow(/page-size/);
    expect(() => parseSummaryIndexArgs([`--page-size=${MAX_SUMMARY_INDEX_PAGE_SIZE + 1}`])).toThrow(/page-size/);
    expect(PRUNE_STALE_SUMMARY_MATCHES_SQL).toContain("DELETE FROM public.enforcement_control_summary_matches");
    expect(PRUNE_STALE_SUMMARY_MATCHES_SQL).not.toContain("DELETE FROM public.all_regulatory_fines");
    expect(PRUNE_STALE_SUMMARY_MATCHES_SQL).toContain("source_field_fingerprints = jsonb_build_object");
  });
});
