import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api.js";
import { fetchPage } from "./useUnifiedData.js";

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
});
