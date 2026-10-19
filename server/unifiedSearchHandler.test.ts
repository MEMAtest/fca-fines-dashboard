import { beforeEach, describe, expect, it, vi } from "vitest";

const { unsafe } = vi.hoisted(() => ({ unsafe: vi.fn() }));

vi.mock("postgres", () => ({
  default: vi.fn(() => ({ unsafe })),
}));
vi.mock("./db.js", () => ({
  resolveConnectionString: () => "postgres://test.invalid/regactions",
  buildServerlessPostgresOptions: () => ({ max: 1 }),
}));

import handler from "../api/site/unified/search.js";

function response() {
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockImplementation((body: unknown) => body);
  return res;
}

describe("unified search theme filtering", () => {
  beforeEach(() => {
    unsafe.mockReset();
  });

  it("passes breach categories as a JSON array rather than a JSON-encoded string", async () => {
    unsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: "0" }]);
    const req = { method: "GET", query: { breachCategory: "FRAUD" }, headers: { host: "regactions.com", "sec-fetch-site": "same-origin" } } as any;
    const res = response();

    await handler(req, res);

    const searchParams = unsafe.mock.calls[0][1];
    expect(searchParams[1]).toEqual(["FRAUD"]);
    expect(searchParams[1]).not.toBe(JSON.stringify(["FRAUD"]));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("constrains monthly chart drill-downs to the selected year and month", async () => {
    unsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: "0" }]);
    const req = { method: "GET", query: { year: "2025", month: "8" }, headers: { host: "regactions.com", "sec-fetch-site": "same-origin" } } as any;
    const res = response();

    await handler(req, res);

    const [query, searchParams] = unsafe.mock.calls[0];
    expect(query).toContain("month_issued");
    expect(searchParams.slice(1, 3)).toEqual([2025, 8]);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("uses the same outcome scope for page records and the exact filtered total", async () => {
    unsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: "247" }]);
    const req = { method: "GET", query: { outcome: "Monetary", regulator: "FCA", year: "2025", limit: "100", offset: "200" }, headers: { host: "regactions.com", "sec-fetch-site": "same-origin" } } as any;
    const res = response();

    await handler(req, res);

    const [recordsSql, recordParams] = unsafe.mock.calls[0];
    const [countSql, countParams] = unsafe.mock.calls[1];
    expect(recordsSql).toContain("requires_amount_review");
    expect(recordsSql).toContain("financial penalty");
    expect(countSql).toContain("requires_amount_review");
    expect(recordParams.slice(0, -2)).toEqual(countParams);
    expect(recordParams.slice(-2)).toEqual([100, 200]);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("keeps amount-band drilldowns inside the same bounded, counted query scope", async () => {
    unsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: "14" }]);
    const req = { method: "GET", query: { amountBand: "100k_1m", regulator: "FCA", limit: "100", offset: "100" }, headers: { host: "regactions.com", "sec-fetch-site": "same-origin" } } as any;
    const res = response();

    await handler(req, res);

    const [recordsSql, recordParams] = unsafe.mock.calls[0];
    const [countSql, countParams] = unsafe.mock.calls[1];
    expect(recordsSql).toContain("trusted_amount_gbp > 100000 AND trusted_amount_gbp <= 1000000");
    expect(countSql).toContain("trusted_amount_gbp > 100000 AND trusted_amount_gbp <= 1000000");
    expect(recordParams.slice(0, -2)).toEqual(countParams);
    expect(recordParams.slice(-2)).toEqual([100, 100]);
  });
});
