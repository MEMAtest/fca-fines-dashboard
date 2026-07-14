import { beforeEach, describe, expect, it, vi } from "vitest";

const { unsafe } = vi.hoisted(() => ({ unsafe: vi.fn() }));

vi.mock("postgres", () => ({
  default: vi.fn(() => ({ unsafe })),
}));
vi.mock("./db.js", () => ({
  resolveConnectionString: () => "postgres://test.invalid/regactions",
}));

import handler from "../api/unified/search.js";

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
    const req = { method: "GET", query: { breachCategory: "FRAUD" } } as any;
    const res = response();

    await handler(req, res);

    const searchParams = unsafe.mock.calls[0][1];
    expect(searchParams[1]).toEqual(["FRAUD"]);
    expect(searchParams[1]).not.toBe(JSON.stringify(["FRAUD"]));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("constrains monthly chart drill-downs to the selected year and month", async () => {
    unsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: "0" }]);
    const req = { method: "GET", query: { year: "2025", month: "8" } } as any;
    const res = response();

    await handler(req, res);

    const [query, searchParams] = unsafe.mock.calls[0];
    expect(query).toContain("month_issued");
    expect(searchParams.slice(1, 3)).toEqual([2025, 8]);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
