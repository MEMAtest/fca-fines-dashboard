import { afterEach, describe, expect, it, vi } from "vitest";
import { siteFetch } from "./siteFetch.js";

describe("siteFetch", () => {
  afterEach(() => vi.restoreAllMocks());
  it("gets a token before the first call so no 401 is logged, then reuses it", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(url); return new Response("{}", { status: 200 }); }));
    await siteFetch("", "/api/site/a");
    await siteFetch("", "/api/site/b");
    expect(calls).toEqual(["/api/site/token", "/api/site/a", "/api/site/b"]);
  });
});
