import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchUnifiedSearch } from "../api.js";
import { fetchWorkspaceRecords } from "./fetchWorkspaceRecords.js";

vi.mock("../api.js", () => ({ fetchUnifiedSearch: vi.fn() }));

const record = (id: number) => ({
  id: String(id),
  regulator: "FCA",
  regulator_full_name: "Financial Conduct Authority",
  country_code: "GB",
  country_name: "United Kingdom",
  firm_individual: `Firm ${id}`,
  firm_category: "Banking",
  amount_original: 100,
  currency: "GBP",
  amount_gbp: 100,
  amount_eur: 115,
  date_issued: "2026-09-20",
  year_issued: 2026,
  month_issued: 9,
  breach_type: "Final Notice",
  breach_categories: ["MONETARY_SANCTION"],
  summary: "The firm was fined.",
  notice_url: "https://www.fca.org.uk/example",
  source_url: "https://www.fca.org.uk/example",
  created_at: "2026-09-20T00:00:00Z",
});

function page(offset: number, size: number, total: number) {
  const count = Math.max(0, Math.min(size, total - offset));
  return {
    results: Array.from({ length: count }, (_, index) => record(offset + index)),
    pagination: {
      total,
      limit: size,
      offset,
      hasMore: offset + count < total,
      pages: Math.ceil(total / size),
      currentPage: Math.floor(offset / size) + 1,
    },
    filters: {},
  };
}

describe("fetchWorkspaceRecords", () => {
  beforeEach(() => vi.mocked(fetchUnifiedSearch).mockReset());

  it("loads ordered pages up to the evidence cap and reports truncation", async () => {
    const total = 2_500;
    vi.mocked(fetchUnifiedSearch).mockImplementation(async (params = {}) =>
      page(Number(params.offset ?? 0), Number(params.limit ?? 1000), total) as never,
    );

    const result = await fetchWorkspaceRecords({ year: [2025, 2026] }, "GBP", 2_200);

    expect(result.total).toBe(total);
    expect(result.records).toHaveLength(2_200);
    expect(result.truncated).toBe(true);
    expect(result.records[0].id).toBe("0");
    expect(result.records[result.records.length - 1]?.id).toBe("2199");
    expect(vi.mocked(fetchUnifiedSearch).mock.calls.map(([params]) => params?.offset)).toEqual([0, 1000, 2000]);
  });
});
