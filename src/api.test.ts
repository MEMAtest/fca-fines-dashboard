import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUnifiedOverview, fetchUnifiedSearch } from "./api.js";

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
});
