import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api.js";
import { renderHook, waitFor } from "@testing-library/react";
import { fetchPage, fetchPages, useUnifiedData } from "./useUnifiedData.js";

const page = (total: number) => ({
  results: [],
  pagination: { total, limit: 500, offset: 0 },
}) as unknown as api.UnifiedSearchResponse;

describe("fetchPage", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns the page when the first attempt succeeds", async () => {
    const spy = vi.spyOn(api, "fetchUnifiedSearch").mockResolvedValue(page(752));
    await expect(fetchPage(0, 500, {})).resolves.toEqual(page(752));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("survives a transient failure rather than blanking the page", async () => {
    // One dropped request in a Promise.all burst used to lose the whole view.
    const spy = vi.spyOn(api, "fetchUnifiedSearch")
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(page(752));
    await expect(fetchPage(500, 500, {})).resolves.toEqual(page(752));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("still fails after three attempts, so a partial set is never shown as complete", async () => {
    const spy = vi.spyOn(api, "fetchUnifiedSearch").mockRejectedValue(new Error("down"));
    await expect(fetchPage(0, 500, {})).rejects.toThrow("down");
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("passes the offset and limit through unchanged", async () => {
    const spy = vi.spyOn(api, "fetchUnifiedSearch").mockResolvedValue(page(1));
    await fetchPage(1500, 500, { regulator: "FCA" });
    expect(spy).toHaveBeenCalledWith({ regulator: "FCA", limit: 500, offset: 1500 });
  });

  it("bounds paginated requests while preserving offset order", async () => {
    let active = 0;
    let peak = 0;
    const spy = vi.spyOn(api, "fetchUnifiedSearch").mockImplementation(async (params = {}) => {
      const offset = params.offset ?? 0;
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return {
        ...page(3000),
        pagination: {
          total: 3000,
          limit: 500,
          offset,
          hasMore: offset + 500 < 3000,
          pages: 6,
          currentPage: Math.floor(offset / 500) + 1,
        },
      };
    });

    const pages = await fetchPages([500, 1000, 1500, 2000, 2500], 500, {}, 2);

    expect(peak).toBe(2);
    expect(pages.map((result) => result.pagination.offset)).toEqual([500, 1000, 1500, 2000, 2500]);
    expect(spy).toHaveBeenCalledTimes(5);
  });
});

describe("useUnifiedData server-side search", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("sends q to the server so firms outside the latest 500 rows are found", async () => {
    const old = {
      id: "9", regulator: "SEC", regulator_full_name: "U.S. Securities and Exchange Commission", country_code: "US", country_name: "United States",
      firm_individual: "Cantor Fitzgerald", firm_category: "Firm", amount_original: 100, currency: "USD", amount_gbp: 80, amount_eur: 90,
      date_issued: "2012-01-05", year_issued: 2012, month_issued: 1, breach_type: "Charges", breach_categories: [], summary: "Old case",
      notice_url: null, source_url: "https://www.sec.gov/x", created_at: "2012-01-05T00:00:00Z",
    };
    const spy = vi.spyOn(api, "fetchUnifiedSearch").mockResolvedValue({
      results: [old], pagination: { total: 1, limit: 500, offset: 0 },
    } as unknown as api.UnifiedSearchResponse);
    const { result } = renderHook(() => useUnifiedData({ regulator: "All", country: "All", year: 0, currency: "GBP", q: "  Cantor Fitzgerald " }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ q: "Cantor Fitzgerald" }));
    expect(result.current.fines.map((fine) => fine.firm_individual)).toEqual(["Cantor Fitzgerald"]);
  });

  it("sends no q when the search box is empty", async () => {
    const spy = vi.spyOn(api, "fetchUnifiedSearch").mockResolvedValue({ results: [], pagination: { total: 0, limit: 500, offset: 0 } } as unknown as api.UnifiedSearchResponse);
    const { result } = renderHook(() => useUnifiedData({ regulator: "All", country: "All", year: 0, currency: "GBP", q: "   " }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(spy.mock.calls[0][0]).toMatchObject({ q: undefined });
  });
});
