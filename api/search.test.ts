import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queries, mock } = vi.hoisted(() => ({
  queries: [] as Array<{ sql: string; params: unknown[] }>,
  mock: { queryResponse: null as ((sql: string) => unknown[]) | null },
}));

vi.mock("../server/db.js", () => ({
  getSqlClient: () => async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    return mock.queryResponse?.(sql) ?? [];
  },
}));

import handler from "./search.js";

describe("enforcement search SQL", () => {
  beforeEach(() => { queries.length = 0; mock.queryResponse = null; });
  afterEach(() => { vi.restoreAllMocks(); });

  it("carries amount quality through the ranked CTE and searches only trusted cases", async () => {
    let statusCode = 0;
    let payload: unknown;
    const req = {
      method: "GET",
      query: { q: "Goldman Sachs enforcement" },
      headers: {},
      socket: {},
    };
    const res = {
      setHeader: vi.fn(),
      status(code: number) { statusCode = code; return this; },
      json(value: unknown) { payload = value; return this; },
      end: vi.fn(),
    };

    await handler(req as never, res as never);

    expect(statusCode).toBe(200);
    expect(payload).toMatchObject({ query: "Goldman Sachs enforcement", results: [] });
    const rankedQuery = queries.find(({ sql }) => sql.includes("COUNT(*) OVER() AS total_count"));
    expect(rankedQuery).toBeDefined();
    expect(rankedQuery?.sql).toContain("FROM public.all_regulatory_fines_trusted");
    expect(rankedQuery?.sql).toContain("public_case_id AS canonical_case_id");
    expect(rankedQuery?.sql).toMatch(/filtered_results AS \([\s\S]*?amount_quality,[\s\S]*?requires_amount_review,[\s\S]*?CASE/);
    expect(rankedQuery?.sql).toContain("COUNT(*) OVER() AS total_count");
    expect(rankedQuery?.sql).toContain("candidate_rows AS MATERIALIZED");
    expect(rankedQuery?.sql).toContain("normalized_candidate_rows AS MATERIALIZED");
    expect(rankedQuery?.sql).toContain("firm_norm.normalized_name AS normalized_firm_name");
    expect(rankedQuery?.sql).toContain("FROM normalized_candidate_rows");
    expect(rankedQuery?.sql).toContain("ILIKE ANY($3::text[])");
    expect(rankedQuery?.sql).toContain("ILIKE ANY($10::text[])");
    expect(rankedQuery?.sql).toContain("ILIKE ANY($19::text[])");
    expect(rankedQuery?.sql).toContain("regulator = ANY($5::text[])");
    expect(rankedQuery?.sql).toContain("country_code = ANY($6::text[])");
    expect(rankedQuery?.sql).toMatch(/regulator_hint_score DESC,[\s\S]*country_hint_score DESC,[\s\S]*firm_match_score DESC,[\s\S]*firm_token_match_score DESC,[\s\S]*fuzzy_firm_match_score DESC,[\s\S]*fuzzy_firm_token_match_score DESC/);
    expect(rankedQuery?.sql).toMatch(/country_hint_score DESC,[\s\S]*firm_match_score DESC/);
  });

  it("prioritizes specific firm prefixes in the bounded typo vocabulary query", async () => {
    mock.queryResponse = (sql) => sql.includes("AS prefix_specificity")
      ? [{ firm_individual: "Coinbase Europe Limited", regulator: "CBI", regulator_full_name: "Central Bank of Ireland", country_name: "Ireland" }]
      : [];
    let payload: { metadata?: { correction?: { correctedQuery?: string } } } | undefined;
    const req = { method: "GET", query: { q: "Coinbsae Europe Limited enforcement" }, headers: {}, socket: {} };
    const res = {
      setHeader: vi.fn(), status() { return this; },
      json(value: typeof payload) { payload = value; return this; }, end: vi.fn(),
    };

    await handler(req as never, res as never);

    const vocabularyQuery = queries.find(({ sql }) => sql.includes("AS prefix_specificity"));
    expect(vocabularyQuery?.params).toContainEqual(["coinbsae", "coi", "co", "ci", "europe", "eur", "eu", "er"]);
    expect(vocabularyQuery?.sql).toContain("FROM public.all_regulatory_fines_trusted");
    expect(vocabularyQuery?.sql).toContain("prefix_specificity DESC,");
    expect(vocabularyQuery?.sql).toContain("metadata_specificity DESC");
    expect(vocabularyQuery?.sql).toContain("LIMIT 1200");
    expect(vocabularyQuery?.sql).toContain("SELECT DISTINCT ON (firm_individual)");
    expect(vocabularyQuery?.sql).toContain("LIMIT 1200");
    expect(payload?.metadata?.correction?.correctedQuery).toBe("coinbase europe limited");
    mock.queryResponse = null;
  });

  it("discovers a firm typo when the transposition is inside the prefix", async () => {
    mock.queryResponse = (sql) => sql.includes("AS prefix_specificity")
      ? [{ firm_individual: "Barclays Bank plc", regulator: "FCA", regulator_full_name: "Financial Conduct Authority", country_name: "United Kingdom" }]
      : [];
    let payload: { metadata?: { correction?: { correctedQuery?: string } } } | undefined;
    const req = { method: "GET", query: { q: "Barclays Bnak plc enforcement", correctionOnly: "1" }, headers: {}, socket: {} };
    const res = {
      setHeader: vi.fn(), status() { return this; },
      json(value: typeof payload) { payload = value; return this; }, end: vi.fn(),
    };

    await handler(req as never, res as never);

    const vocabularyQuery = queries.find(({ sql }) => sql.includes("AS prefix_specificity"));
    expect(vocabularyQuery?.params).toContainEqual(expect.arrayContaining(["ba", "bn", "barclays"]));
    expect(payload?.metadata?.correction?.correctedQuery).toBe("barclays bank plc");
  });

  it("prioritizes corrected firm matches only when the firm query was actually corrected", async () => {
    mock.queryResponse = (sql) => sql.includes("AS metadata_specificity")
      ? [{ firm_individual: "Barclays Bank plc", regulator: "FCA", regulator_full_name: "Financial Conduct Authority", country_name: "United Kingdom" }]
      : [];
    const req = { method: "GET", query: { q: "Barclays Bnak plc enforcement" }, headers: {}, socket: {} };
    const res = {
      setHeader: vi.fn(), status() { return this; },
      json: vi.fn(), end: vi.fn(),
    };

    await handler(req as never, res as never);

    const rankedQuery = queries.find(({ sql }) => sql.includes("COUNT(*) OVER() AS total_count"));
    expect(rankedQuery?.sql).toMatch(/fuzzy_firm_match_score DESC,[\s\S]*fuzzy_firm_token_match_score DESC,[\s\S]*firm_match_score DESC,[\s\S]*firm_token_match_score DESC,[\s\S]*regulator_hint_score DESC,[\s\S]*country_hint_score DESC/);
  });

  it("returns only deterministic correction metadata when correctionOnly is requested", async () => {
    mock.queryResponse = (sql) => sql.includes("AS prefix_specificity")
      ? [{ firm_individual: "Coinbase Europe Limited", regulator: "CBI", regulator_full_name: "Central Bank of Ireland", country_name: "Ireland" }]
      : [];
    let payload: {
      query?: string;
      metadata?: { correction?: { correctedQuery?: string } | null; correctionOnly?: boolean };
    } | undefined;
    const req = {
      method: "GET",
      query: { q: "Coinbsae Europe Limited", correctionOnly: "1" },
      headers: {},
      socket: {},
    };
    const res = {
      setHeader: vi.fn(), status() { return this; },
      json(value: typeof payload) { payload = value; return this; }, end: vi.fn(),
    };

    await handler(req as never, res as never);

    expect(payload).toMatchObject({
      query: "Coinbsae Europe Limited",
      metadata: {
        correctionOnly: true,
        correction: { correctedQuery: "coinbase europe limited" },
      },
    });
    expect(queries.some(({ sql }) => sql.includes("COUNT(*) OVER() AS total_count"))).toBe(false);
    expect(queries.some(({ sql }) => sql.includes("INSERT INTO public.search_query_analytics"))).toBe(false);
    expect(queries.some(({ sql }) => sql.includes("AS prefix_specificity"))).toBe(true);
  });

  it("keeps correctionOnly with low-signal text read-only and metadata-only", async () => {
    let payload: { metadata?: { correctionOnly?: boolean; correction?: unknown } } | undefined;
    const req = { method: "GET", query: { q: "the and", correctionOnly: "1" }, headers: {}, socket: {} };
    const res = {
      setHeader: vi.fn(), status() { return this; },
      json(value: typeof payload) { payload = value; return this; }, end: vi.fn(),
    };

    await handler(req as never, res as never);

    expect(payload).toEqual({ query: "the and", metadata: { correction: null, correctionOnly: true } });
    expect(queries).toEqual([]);
  });
});
