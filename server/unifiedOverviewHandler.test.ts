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
      .mockResolvedValueOnce([{ count: 2, total: "125000", average: "62500", median: "62500", largest: "100000", largest_firm: "Example Bank", affected_firms: 2, regulators_in_view: 1 }])
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
    expect(unsafe.mock.calls[4][0]).toContain("category.value = ANY($7::text[])");
    expect(unsafe.mock.calls[4][1]).toEqual(["FCA", "UK", 2025, "Bank", "%Example%", ["AML"], ["AML"]]);
    const body = res.json.mock.calls[0][0];
    expect(body.metrics).toMatchObject({ count: 2, total: 125000, median: 62500, largest: 100000, regulatorsInView: 1 });
    expect(body.availableThemes).toEqual(["AML", "FRAUD"]);
    expect(body.availableSectors).toEqual(["Bank", "Broker"]);
    expect(body.largestActions).toHaveLength(1);
    expect(body.filters).toMatchObject({ outcome: "Monetary", regulator: ["FCA"], sector: "Bank" });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
