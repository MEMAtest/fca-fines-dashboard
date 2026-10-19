import { beforeEach, describe, expect, it, vi } from "vitest";

const { unsafe } = vi.hoisted(() => ({ unsafe: vi.fn() }));
vi.mock("postgres", () => ({ default: vi.fn(() => ({ unsafe })) }));
vi.mock("./db.js", () => ({
  resolveConnectionString: () => "postgres://test.invalid/regactions",
  buildServerlessPostgresOptions: () => ({ max: 1 }),
}));

import handler from "../api/unified/overview.js";

function response() {
  const res: any = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockImplementation((body: unknown) => body);
  return res;
}

describe("unified Fines overview", () => {
  beforeEach(() => unsafe.mockReset());

  it("scopes exact aggregates and paged-search-compatible filters to the same outcome", async () => {
    unsafe
      .mockResolvedValueOnce([{ count: 2, total: "125000", average: "62500", median: "62500", largest: "100000", largest_firm: "Example Bank", top_ten_total: "100000", affected_firms: 2, regulators_in_view: 1, latest_source_check_at: "2026-10-19T10:00:00Z" }])
      .mockResolvedValueOnce([{ year: 2025, count: 2, amount: "125000" }])
      .mockResolvedValueOnce([{ year: 2025, month: 2, count: 2, amount: "125000" }])
      .mockResolvedValueOnce([{ label: "FCA", count: 2, amount: "125000" }])
      .mockResolvedValueOnce([{ label: "AML", count: 2, amount: "125000" }])
      .mockResolvedValueOnce([{ label: "Bank", count: 2, amount: "125000" }])
      .mockResolvedValueOnce([{ label: "Example Bank", count: 1, amount: "125000" }])
      .mockResolvedValueOnce([{ themes: ["AML", "FRAUD"], sectors: ["Bank", "Broker"] }])
      .mockResolvedValueOnce([{ id: "case-1", firm_individual: "Example Bank", amount_gbp: "100000" }]);
    const req = { method: "GET", query: { regulator: "FCA", country: "UK", year: "2025", breachCategory: "AML", sector: "Bank", outcome: "Monetary", q: "Example" } } as any;
    const res = response();

    await handler(req, res);

    expect(unsafe).toHaveBeenCalledTimes(9);
    for (const [sql, params] of unsafe.mock.calls.slice(0, 7).filter((_, index) => index !== 4)) {
      expect(sql).toContain("requires_amount_review");
      expect(sql).toContain("financial penalty");
      expect(params).toEqual(["FCA", "UK", 2025, "Bank", "%Example%", ["AML"]]);
    }
    expect(unsafe.mock.calls[0][0]).toContain("COUNT(DISTINCT regulator)::int AS regulators_in_view");
    expect(unsafe.mock.calls[0][0]).toContain("MAX(source_checked_at) AS latest_source_check_at");
    expect(unsafe.mock.calls[7][0]).toContain("jsonb_build_array(COALESCE(facet_rows.breach_type, 'Other / not classified')))) AS category(value)");
    expect(unsafe.mock.calls[4][0]).toContain("category.value = ANY($7::text[])");
    expect(unsafe.mock.calls[4][1]).toEqual(["FCA", "UK", 2025, "Bank", "%Example%", ["AML"], ["AML"]]);
    const body = res.json.mock.calls[0][0];
    expect(body.metrics).toMatchObject({ count: 2, total: 125000, median: 62500, largest: 100000, largestFirm: "Example Bank", topTenConcentration: 80, regulatorsInView: 1 });
    expect(body.metrics.latestSourceCheckAt).toBe("2026-10-19T10:00:00Z");
    expect(body.availableThemes).toEqual(["AML", "FRAUD"]);
    expect(body.availableSectors).toEqual(["Bank", "Broker"]);
    expect(body.largestActions).toHaveLength(1);
    expect(body.filters).toMatchObject({ outcome: "Monetary", regulator: ["FCA"], sector: "Bank" });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("keeps top-ten concentration and largest firm empty when the scoped view has no monetary records", async () => {
    unsafe
      .mockResolvedValueOnce([{ count: 0, total: "0", average: "0", median: "0", p75: "0", top_ten_total: "0", largest: "0", largest_firm: "", affected_firms: 0, countries: 0, regulators_in_view: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ themes: ["AML"], sectors: ["Bank"] }])
      .mockResolvedValueOnce([]);
    const req = { method: "GET", query: { regulator: "FCA", year: "1900", currency: "EUR" } } as any;
    const res = response();

    await handler(req, res);

    const summarySql = unsafe.mock.calls[0][0] as string;
    const largestSql = unsafe.mock.calls[8][0] as string;
    const body = res.json.mock.calls[0][0];
    expect(summarySql).toContain("ELSE amount_eur END");
    expect(largestSql).toContain("ELSE amount_eur END");
    expect(body.metrics).toMatchObject({ count: 0, total: 0, largest: 0, largestFirm: "", topTenConcentration: 0 });
    expect(body.largestActions).toEqual([]);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("omits the source-check aggregate only when explicitly requested", async () => {
    unsafe
      .mockResolvedValueOnce([{ count: 1, total: "100", average: "100", median: "100", p75: "100", largest: "100", affected_firms: 1, countries: 1, regulators_in_view: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ themes: [], sectors: [] }])
      .mockResolvedValueOnce([{ firm_individual: "Example" }]);
    const req = { method: "GET", query: { regulator: "FCA", includeSourceCheck: "false" } } as any;
    const res = response();

    await handler(req, res);

    const summarySql = unsafe.mock.calls[0][0] as string;
    const body = res.json.mock.calls[0][0];
    expect(summarySql).not.toContain("source_checked_at");
    expect(summarySql).toMatch(/latest_ingestion_at\s+FROM/);
    expect(summarySql).not.toMatch(/latest_ingestion_at\s*,\s*FROM/);
    expect(body.metrics).not.toHaveProperty("latestSourceCheckAt");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
