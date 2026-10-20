import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSearchCorrection, fetchUnifiedOverview, fetchUnifiedSearch } from "./api.js";

describe("public aggregate request sharing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shares concurrent and briefly caches identical overview reads", async () => {
    const response = { ok: true, json: async () => ({ totals: { cases: 1 } }) };
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      fetchUnifiedOverview({}),
      fetchUnifiedOverview({}),
    ]);
    await fetchUnifiedOverview({});

    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the expensive source-check aggregate opt-in per overview request while defaulting to the full response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ metrics: { count: 1 } }) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchUnifiedOverview({ includeSourceCheck: false });
    await fetchUnifiedOverview({ country: "ZZ" });

    const urls = fetchMock.mock.calls.map(([url]) => new URL(String(url), "https://local"));
    expect(urls[0]?.searchParams.get("includeSourceCheck")).toBe("false");
    expect(urls[1]?.searchParams.has("includeSourceCheck")).toBe(false);
  });

  it("shares duplicate recent-search reads without mixing different queries", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => ({ query: new URL(String(url), "https://local").searchParams.get("q") }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([
      fetchUnifiedSearch({ sortBy: "date_issued", order: "desc", limit: 5 }),
      fetchUnifiedSearch({ sortBy: "date_issued", order: "desc", limit: 5 }),
    ]);
    await fetchUnifiedSearch({ q: "different", sortBy: "date_issued", order: "desc", limit: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps abortable comparison searches private to the caller", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], pagination: { total: 0 } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const firstController = new AbortController();
    const secondController = new AbortController();

    await Promise.all([
      fetchUnifiedSearch({ q: "comparison-cancel", signal: firstController.signal }),
      fetchUnifiedSearch({ q: "comparison-cancel", signal: secondController.signal }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: firstController.signal });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ signal: secondController.signal });
  });

  it("requests correction metadata without asking the generic search endpoint for results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ metadata: { correction: { correctedQuery: "coinbase europe limited" } } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchSearchCorrection({ q: "Coinbsae Europe Limited", regulator: "CBI", year: 2025 });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://local");
    expect(url.pathname).toBe("/api/search");
    expect(url.searchParams.get("q")).toBe("Coinbsae Europe Limited");
    expect(url.searchParams.get("regulator")).toBe("CBI");
    expect(url.searchParams.get("year")).toBe("2025");
    expect(url.searchParams.get("correctionOnly")).toBe("1");
  });
});
